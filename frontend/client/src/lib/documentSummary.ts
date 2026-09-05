import { pickString } from "@/lib/apiRecord";
import { normalizeSourcesFromApi, type Source } from "@/lib/chatMessages";

function extractSummaryMarkdown(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (typeof record.summary === "string") return record.summary.trim();
  }
  return "";
}

export type DocumentSummary = {
  markdown: string;
  filename: string;
  doc_id: string;
  summary_id: string | null;
  sources: Source[];
};

export function normalizeDocumentSummaryFromApi(
  data: unknown,
  fallback: {
    filename: string;
    doc_id: string;
    summary_id?: string | null;
  },
): DocumentSummary | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;

  const markdown = extractSummaryMarkdown(record.summary);
  if (!markdown) return null;

  const summary_id =
    pickString(record, ["summary_id", "id"]) || fallback.summary_id?.trim() || null;

  const filename = pickString(record, ["filename", "file_name"]) || fallback.filename;
  const doc_id = pickString(record, ["doc_id", "document_id"]) || fallback.doc_id;

  return {
    markdown,
    filename,
    doc_id,
    summary_id,
    sources: normalizeSourcesFromApi(record.sources, { filename, doc_id }),
  };
}

/** Normalize SSE `summaries` payloads (single object or legacy chunk list). */
export function normalizeDocumentSummaryFromSummariesEvent(
  summaries: unknown[],
  fallback: { filename: string; doc_id: string },
): DocumentSummary | null {
  if (summaries.length === 0) return null;

  if (summaries.length === 1) {
    const single = normalizeDocumentSummaryFromApi(summaries[0], fallback);
    if (single) return single;
  }

  const parts: string[] = [];
  const mergedSources: Source[] = [];
  const seenSourceIds = new Set<string>();

  for (const item of summaries) {
    const md = extractSummaryMarkdown(item);
    if (md) parts.push(md);

    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const itemSources = normalizeSourcesFromApi(record.sources ?? [item], fallback);
    for (const source of itemSources) {
      if (seenSourceIds.has(source.id)) continue;
      seenSourceIds.add(source.id);
      mergedSources.push(source);
    }
  }
  if (parts.length === 0) return null;

  return {
    markdown: parts.join("\n\n"),
    filename: fallback.filename,
    doc_id: fallback.doc_id,
    summary_id: null,
    sources: mergedSources,
  };
}
