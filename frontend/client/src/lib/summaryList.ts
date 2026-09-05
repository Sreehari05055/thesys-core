import { pickString } from "@/lib/apiRecord";

export type SavedSummaryMeta = {
  id: string;
  title: string;
  filename: string;
  doc_id: string;
  created_at?: string;
};

export function normalizeSavedSummaryList(data: unknown): SavedSummaryMeta[] {
  const raw = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? (data as Record<string, unknown>).summaries ??
        (data as Record<string, unknown>).items ??
        (data as Record<string, unknown>).results
      : null;
  if (!Array.isArray(raw)) return [];

  const out: SavedSummaryMeta[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = pickString(record, ["id", "summary_id", "summaryId"]);
    if (!id) continue;
    const filename = pickString(record, ["filename", "file_name", "document_name"]);
    const title = pickString(record, ["title", "name"]) || filename || "Summary";
    const doc_id = pickString(record, ["doc_id", "document_id", "docId"]);
    const created_at = pickString(record, ["created_at", "createdAt", "timestamp"]);
    out.push({ id, title, filename, doc_id, created_at });
  }
  return out;
}

/** Human-readable date for summary log rows (ISO or epoch strings from API). */
export function formatSummaryTimestamp(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return trimmed;

  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins >= 0 && diffMins < 60) {
    return diffMins <= 1 ? "Just now" : `${diffMins} min ago`;
  }
  const diffHours = Math.floor(diffMs / 3_600_000);
  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
