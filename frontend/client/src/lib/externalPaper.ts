import { pickString } from "@/lib/apiRecord";

export type ExternalPaper = {
  id: string;
  title: string;
  authors: string;
  publication_year: number | null;
  doi: string;
  abstract: string;
  cited_by_count: number | null;
  pdf_verified: boolean;
  pdf_url: string | null;
  landing_page_url: string;
};

function pickOptionalString(record: Record<string, unknown>, key: string): string {
  const v = record[key];
  return typeof v === "string" ? v.trim() : "";
}

function pickOptionalYear(record: Record<string, unknown>): number | null {
  const v = record.publication_year;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickOptionalCount(record: Record<string, unknown>, key: string): number | null {
  const v = record[key];
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.trunc(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

/** Normalize chat SSE ``external_papers`` payload. */
export function normalizeExternalPapers(raw: unknown): ExternalPaper[] {
  if (!Array.isArray(raw)) return [];

  const out: ExternalPaper[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = pickString(record, ["id"]);
    if (!id) continue;

    const pdf_url = pickOptionalString(record, "pdf_url") || null;

    out.push({
      id,
      title: pickOptionalString(record, "title") || "Untitled paper",
      authors: pickOptionalString(record, "authors"),
      publication_year: pickOptionalYear(record),
      doi: pickOptionalString(record, "doi"),
      abstract: pickOptionalString(record, "abstract"),
      cited_by_count: pickOptionalCount(record, "cited_by_count"),
      pdf_verified: Boolean(pdf_url),
      pdf_url,
      landing_page_url: pickOptionalString(record, "landing_page_url"),
    });
  }

  return out;
}

export function paperByUrl(
  papers: ExternalPaper[],
  url: string,
): ExternalPaper | undefined {
  const normalized = normalizeUrlForMatch(url);
  if (!normalized) return undefined;
  return papers.find((p) => {
    const pdf = p.pdf_url ? normalizeUrlForMatch(p.pdf_url) : "";
    const landing = p.landing_page_url ? normalizeUrlForMatch(p.landing_page_url) : "";
    return pdf === normalized || landing === normalized;
  });
}

export function primaryExternalLink(paper: ExternalPaper): string {
  return paper.pdf_url ?? paper.landing_page_url ?? "";
}

export function formatExternalPaperAuthors(paper: ExternalPaper): string {
  const parts: string[] = [];
  if (paper.authors) parts.push(paper.authors);
  if (paper.publication_year != null) parts.push(String(paper.publication_year));
  return parts.join(" · ");
}

function normalizeUrlForMatch(url: string): string {
  return url.trim().replace(/[.,;:!?)]+$/g, "").replace(/\/$/, "");
}
