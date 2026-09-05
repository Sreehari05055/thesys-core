import { extractTextContent, pickString } from "@/lib/apiRecord";
import {
  buildCitationTokenContext,
  extractCitedSourceIds,
} from "@/lib/citationTokens";
import type { ExternalPaper } from "@/lib/externalPaper";
import { normalizeExternalPapers } from "@/lib/externalPaper";

type SourceBbox = {
  page: number;
  box: [number, number, number, number];
  page_width?: number;
  page_height?: number;
  page_rotation?: number;
};

export type Source = {
  content: string;
  id: string;
  title: string;
  doc_id?: string;
  document_id?: string;
  filename?: string;
  file_name?: string;
  pages: number[];
  bboxes: SourceBbox[];
  precise_bboxes: SourceBbox[];
  score: number;
};

export type HighlightAction = {
  filename: string;
  page: number;
  bboxes: [number, number, number, number][];
};

export type ChatMessage = {
  sender: "user" | "bot";
  text: string;
  raw?: string;
  sources?: Source[];
  externalPapers?: ExternalPaper[];
  highlightAction?: HighlightAction;
};

const DEFAULT_PENDING_SOURCE_LIMIT = 2;

export function appendPendingChatSource(
  prev: Source[],
  source: Source,
  max = DEFAULT_PENDING_SOURCE_LIMIT,
): Source[] {
  if (prev.some((item) => item.id === source.id) || prev.length >= max) return prev;
  return [...prev, source];
}

function mergeExternalPapers(
  existing: ExternalPaper[],
  incoming: ExternalPaper[],
): ExternalPaper[] {
  if (!incoming.length) return existing;
  const merged = [...existing];
  for (const paper of incoming) {
    if (!merged.some((p) => p.id === paper.id)) merged.push(paper);
  }
  return merged;
}

function externalPapersFromRecord(record: Record<string, unknown>): ExternalPaper[] {
  return Array.isArray(record.external_papers)
    ? normalizeExternalPapers(record.external_papers)
    : [];
}

function botMessageFields(
  record: Record<string, unknown>,
  pendingExternalPapers: ExternalPaper[],
): Pick<ChatMessage, "sources" | "externalPapers" | "highlightAction"> {
  const externalPapers = mergeExternalPapers(
    pendingExternalPapers,
    externalPapersFromRecord(record),
  );

  return {
    sources: Array.isArray(record.sources) ? normalizeChatSources(record.sources) : undefined,
    externalPapers: externalPapers.length > 0 ? externalPapers : undefined,
    highlightAction:
      record.highlightAction && typeof record.highlightAction === "object"
        ? (record.highlightAction as HighlightAction)
        : undefined,
  };
}

export function normalizeLoadedMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];

  const normalized: ChatMessage[] = [];
  let pendingExternalPapers: ExternalPaper[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;

    if (typeof record.sender === "string" && typeof record.text === "string") {
      if (record.sender === "user" || record.sender === "bot") {
        const sender = record.sender;
        const text = record.text;
        if (sender === "user") {
          normalized.push({ sender, text });
        } else {
          const botFields = botMessageFields(record, pendingExternalPapers);
          pendingExternalPapers = [];
          normalized.push({
            sender,
            text,
            raw: text,
            ...botFields,
          });
        }
      }
      continue;
    }

    if (typeof record.role === "string") {
      const role = record.role.toLowerCase();

      if (role === "tool") {
        pendingExternalPapers = mergeExternalPapers(
          pendingExternalPapers,
          externalPapersFromRecord(record),
        );
        continue;
      }

      const sender: "user" | "bot" | null =
        role === "user" || role === "human"
          ? "user"
          : role === "assistant" || role === "ai" || role === "bot"
            ? "bot"
            : null;

      if (!sender) continue;

      let text = extractTextContent(record.content);
      if (!text && typeof record.text === "string") {
        text = record.text;
      }

      if (text) {
        if (sender === "user") {
          normalized.push({ sender, text });
        } else {
          const botFields = botMessageFields(record, pendingExternalPapers);
          pendingExternalPapers = [];
          normalized.push({
            sender,
            text,
            raw: text,
            ...botFields,
          });
        }
      }
      continue;
    }

    if (typeof record.question === "string" && record.question.trim()) {
      normalized.push({ sender: "user", text: record.question });
    }
    if (typeof record.answer === "string" && record.answer.trim()) {
      const botFields = botMessageFields(record, pendingExternalPapers);
      pendingExternalPapers = [];
      normalized.push({ sender: "bot", text: record.answer, raw: record.answer, ...botFields });
    }
  }

  return normalized;
}

type PageDimension = {
  page: number;
  page_width: number;
  page_height: number;
  page_rotation?: number;
};

function parseBox4(v: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(v) || v.length < 4) return undefined;
  const [a, b, c, d] = v;
  if (
    typeof a !== "number" ||
    typeof b !== "number" ||
    typeof c !== "number" ||
    typeof d !== "number"
  ) {
    return undefined;
  }
  return [a, b, c, d];
}

function buildPageDimensionMap(
  page_dimensions?: PageDimension[],
  single?: { page?: number; page_width?: number; page_height?: number; page_rotation?: number },
): Map<number, PageDimension> {
  const map = new Map<number, PageDimension>();
  for (const d of page_dimensions ?? []) {
    if (typeof d.page === "number" && d.page_width > 0 && d.page_height > 0) {
      map.set(d.page, d);
    }
  }
  if (
    typeof single?.page === "number" &&
    typeof single.page_width === "number" &&
    single.page_width > 0 &&
    typeof single.page_height === "number" &&
    single.page_height > 0 &&
    !map.has(single.page)
  ) {
    map.set(single.page, {
      page: single.page,
      page_width: single.page_width,
      page_height: single.page_height,
      page_rotation: single.page_rotation,
    });
  }
  return map;
}

function normalizeSourceBboxes(
  rawBboxes: unknown,
  pages: number[],
  opts: {
    page?: number;
    page_width?: number;
    page_height?: number;
    page_dimensions?: PageDimension[];
  },
  fallbackBboxes?: SourceBbox[],
): NonNullable<Source["bboxes"]> {
  const dimMap = buildPageDimensionMap(opts.page_dimensions, {
    page: opts.page,
    page_width: opts.page_width,
    page_height: opts.page_height,
  });
  const fallbackByPage = new Map<number, SourceBbox>();
  for (const fb of fallbackBboxes ?? []) {
    if (!fallbackByPage.has(fb.page)) fallbackByPage.set(fb.page, fb);
  }
  const defaultPage = opts.page ?? pages[0] ?? 1;
  const items = Array.isArray(rawBboxes) ? rawBboxes : [];
  const out: Source["bboxes"] = [];

  for (const item of items) {
    let box: [number, number, number, number] | undefined;
    let bboxPage = defaultPage;
    let pw: number | undefined;
    let ph: number | undefined;
    let rotation: number | undefined;

    const directBox = parseBox4(item);
    if (directBox) {
      box = directBox;
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      box = parseBox4(o.box);
      if (typeof o.page === "number") bboxPage = o.page;
      if (typeof o.page_width === "number") pw = o.page_width;
      if (typeof o.page_height === "number") ph = o.page_height;
      if (typeof o.page_rotation === "number") rotation = o.page_rotation;
    }

    if (!box) continue;

    const dims = dimMap.get(bboxPage);
    const fallback = fallbackByPage.get(bboxPage);
    const page_width = pw && pw > 0 ? pw : dims?.page_width ?? fallback?.page_width;
    const page_height = ph && ph > 0 ? ph : dims?.page_height ?? fallback?.page_height;
    const page_rotation = rotation ?? dims?.page_rotation;

    if (!page_width || !page_height) continue;

    out.push({
      box,
      page: bboxPage,
      page_width,
      page_height,
      ...(page_rotation !== undefined ? { page_rotation } : {}),
    });
  }

  return out;
}

/** Normalize RAG source objects from chat/history SSE payloads. */
export function normalizeChatSources(raw: unknown): Source[] {
  return normalizeSourcesFromApi(raw, { filename: "", doc_id: "" });
}

/** Normalize RAG source objects from summarize/chat API payloads. */
export function normalizeSourcesFromApi(
  raw: unknown,
  defaults: { filename: string; doc_id: string },
): Source[] {
  if (!Array.isArray(raw)) return [];

  const out: Source[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = pickString(record, ["id", "chunk_id"]);
    if (!id) continue;

    const filename = pickString(record, ["filename", "file_name"]) || defaults.filename;
    const doc_id = pickString(record, ["doc_id", "document_id"]) || defaults.doc_id;

    const page =
      typeof record.page === "number" && record.page > 0 ? record.page : undefined;
    const page_width =
      typeof record.page_width === "number" && record.page_width > 0
        ? record.page_width
        : undefined;
    const page_height =
      typeof record.page_height === "number" && record.page_height > 0
        ? record.page_height
        : undefined;
    const page_dimensions = Array.isArray(record.page_dimensions)
      ? (record.page_dimensions as PageDimension[])
      : undefined;

    let pages: number[] = [];
    if (Array.isArray(record.pages)) {
      pages = record.pages.filter((p): p is number => typeof p === "number" && p > 0);
    } else if (page) {
      pages = [page];
    }

    const bboxes = normalizeSourceBboxes(record.bboxes, pages, {
      page,
      page_width,
      page_height,
      page_dimensions,
    });
    const preciseRaw =
      record.precise_bboxes ?? record.preciseBboxes ?? record.precise_bbox;
    const precise_bboxes = normalizeSourceBboxes(preciseRaw, pages, {
      page,
      page_width,
      page_height,
      page_dimensions,
    }, bboxes);

    if (pages.length === 0 && bboxes.length > 0) {
      pages = Array.from(new Set(bboxes.map((b) => b.page))).sort((a, b) => a - b);
    }
    if (pages.length === 0 && precise_bboxes.length > 0) {
      pages = Array.from(new Set(precise_bboxes.map((b) => b.page))).sort((a, b) => a - b);
    }

    const content =
      typeof record.content === "string"
        ? record.content
        : typeof record.summary === "string"
          ? record.summary
          : "";

    out.push({
      id,
      content,
      title:
        (typeof record.title === "string" && record.title.trim()) || filename,
      filename,
      file_name: filename,
      doc_id,
      document_id: doc_id,
      pages: pages.length > 0 ? pages : [1],
      bboxes,
      precise_bboxes,
      score: typeof record.score === "number" ? record.score : 1,
    });
  }

  return out;
}

/** Source IDs and lookup maps for a single sources list (e.g. document summary). */
export function buildSourceIndex(sources: Source[]) {
  const knownSourceIds = new Set<string>();
  const allSourcesById = new Map<string, Source>();
  const globalSourceNumberById = new Map<string, number>();
  let counter = 0;

  for (const source of sources) {
    if (!source?.id) continue;
    knownSourceIds.add(source.id);
    if (!allSourcesById.has(source.id)) {
      allSourcesById.set(source.id, source);
      globalSourceNumberById.set(source.id, ++counter);
    }
  }

  return { knownSourceIds, allSourcesById, globalSourceNumberById };
}

/** Cited sources across a conversation, in order of first LLM citation. */
export function collectCitedConversationSources(messages: ChatMessage[]): Source[] {
  const allSources = messages.flatMap((m) => m.sources ?? []);
  const fullIndex = buildSourceIndex(allSources);

  const result: Source[] = [];
  const seen = new Set<string>();

  for (const msg of messages) {
    if (msg.sender !== "bot" || !msg.sources?.length) continue;
    const text = (msg.raw ?? msg.text)?.trim();
    if (!text) continue;

    const ctx = buildCitationTokenContext(msg.sources, {
      knownSourceIds: fullIndex.knownSourceIds,
      allSourcesById: fullIndex.allSourcesById,
      globalSourceNumberById: fullIndex.globalSourceNumberById,
    });

    for (const id of extractCitedSourceIds(text, ctx)) {
      if (seen.has(id)) continue;
      const src = fullIndex.allSourcesById.get(id);
      if (src) {
        seen.add(id);
        result.push(src);
      }
    }
  }

  return result;
}

/** Source IDs and lookup maps for LLM-cited sources in a conversation. */
export function buildConversationSourceIndex(messages: ChatMessage[]) {
  return buildSourceIndex(collectCitedConversationSources(messages));
}

export function updateLastBotMessage(
  messages: ChatMessage[],
  patch: Partial<ChatMessage>,
): ChatMessage[] {
  const updated = [...messages];
  for (let i = updated.length - 1; i >= 0; i--) {
    if (updated[i].sender === "bot") {
      // Merge sources arrays instead of replacing to avoid losing sources from earlier events
      const currentSources = updated[i].sources ?? [];
      const patchSources = patch.sources ?? [];
      const mergedSources =
        patchSources.length > 0
          ? [
              ...currentSources,
              ...patchSources.filter((s) => !currentSources.some((cs) => cs.id === s.id)),
            ]
          : currentSources;

      const currentPapers = updated[i].externalPapers ?? [];
      const patchPapers = patch.externalPapers ?? [];
      const mergedPapers =
        patchPapers.length > 0
          ? [
              ...currentPapers,
              ...patchPapers.filter((p) => !currentPapers.some((cp) => cp.id === p.id)),
            ]
          : currentPapers;

      updated[i] = {
        ...updated[i],
        ...patch,
        sources: mergedSources,
        externalPapers: patch.externalPapers !== undefined ? mergedPapers : updated[i].externalPapers,
      };
      return updated;
    }
  }
  return updated;
}
