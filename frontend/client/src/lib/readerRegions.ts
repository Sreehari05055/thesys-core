import { API_URLS } from "@/config";
import { apiFetch } from "@/lib/apiFetch";
import { getApiErrorMessage } from "@/lib/apiErrors";
import type { PdfBbox } from "@/lib/pdfHighlightLayout";
import { createPassageId, type ReaderPassageSelection } from "@/lib/readerPassageSelection";

export type ReaderRegion = {
  id: string;
  tag: string;
  page: number;
  pages: number[];
  bboxes: PdfBbox[];
  content: string;
  preview: string;
};

type RegionsResponse = {
  doc_id?: string;
  regions?: unknown[];
};

function parseBox4(v: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(v) || v.length < 4) return undefined;
  const nums = v.slice(0, 4).map((n) => Number(n));
  if (nums.some((n) => !Number.isFinite(n))) return undefined;
  return nums as [number, number, number, number];
}

function normalizeRegionBboxes(raw: unknown): PdfBbox[] {
  if (!Array.isArray(raw)) return [];
  const out: PdfBbox[] = [];

  for (const item of raw) {
    const direct = parseBox4(item);
    if (direct) {
      out.push({ box: direct });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const box = parseBox4(o.box);
    if (!box) continue;
    out.push({
      box,
      ...(typeof o.page_width === "number" ? { page_width: o.page_width } : {}),
      ...(typeof o.page_height === "number" ? { page_height: o.page_height } : {}),
    });
  }

  if (out.length === 0) return out;
  return out;
}

function normalizeRegion(raw: unknown): ReaderRegion | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const tag = typeof o.tag === "string" ? o.tag.trim() : "";
  const page = typeof o.page === "number" && o.page > 0 ? o.page : 0;
  if (!id || !page) return null;

  const bboxes = normalizeRegionBboxes(o.bboxes);
  if (bboxes.length === 0) return null;

  const pages = Array.isArray(o.pages)
    ? o.pages.filter((p): p is number => typeof p === "number" && p > 0)
    : [page];

  return {
    id,
    tag: tag || "table",
    page,
    pages: pages.length > 0 ? pages : [page],
    bboxes,
    content: typeof o.content === "string" ? o.content : "",
    preview: typeof o.preview === "string" ? o.preview : "",
  };
}

function normalizeReaderRegions(raw: unknown): ReaderRegion[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeRegion).filter((r): r is ReaderRegion => r != null);
}

export async function fetchSessionFileRegions(
  sessionId: string,
  docId: string,
): Promise<ReaderRegion[]> {
  const res = await apiFetch(API_URLS.sessionFileRegions(docId), {}, sessionId);
  if (!res.ok) {
    const message = await getApiErrorMessage(res);
    throw new Error(message || `HTTP ${res.status}`);
  }
  const data = (await res.json()) as RegionsResponse;
  return normalizeReaderRegions(data.regions);
}

function regionPassageText(region: ReaderRegion): string {
  // Prefer full `content` (e.g. entire table markdown); `preview` is chip/UI only.
  const content = region.content.trim();
  if (content) return content;
  const preview = region.preview.trim();
  if (preview) return preview;
  return `Excerpt (page ${region.page})`;
}

export function regionToPassage(region: ReaderRegion): ReaderPassageSelection {
  return {
    id: createPassageId(),
    text: regionPassageText(region),
    preview: region.preview.trim() || undefined,
    page: region.page,
    bboxes: region.bboxes.map((b) => b.box),
  };
}

export function unionRegionCanvasRects(
  rects: Array<{ left: number; top: number; width: number; height: number }>,
): { left: number; top: number; width: number; height: number } | null {
  if (rects.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const r of rects) {
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.left + r.width);
    bottom = Math.max(bottom, r.top + r.height);
  }
  return { left, top, width: right - left, height: bottom - top };
}

// ponytail: runnable check — upgrade path: vitest if region parsing grows
if (import.meta.env.DEV && typeof console !== "undefined") {
  const sample = normalizeReaderRegions([
    {
      id: "t1",
      tag: "table",
      page: 2,
      pages: [2],
      bboxes: [{ box: [10, 20, 100, 80], page_width: 612, page_height: 792 }],
      content: "| col1 | col2 |\n|---|---|\n| a | b |",
      preview: "| col1 | col2 |",
    },
    {
      id: "c1",
      tag: "code",
      page: 3,
      pages: [3],
      bboxes: [{ box: [10, 20, 100, 80], page_width: 612, page_height: 792 }],
      preview: "def foo():",
    },
  ]);
  console.assert(sample.length === 2 && sample[1]!.tag === "code");
  console.assert(regionPassageText(sample[0]!).includes("| a | b |"));
}
