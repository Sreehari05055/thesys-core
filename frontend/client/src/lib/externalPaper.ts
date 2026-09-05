import { pickString } from "@/lib/apiRecord";

export type ExternalPaper = {
  id: string;
  title: string;
  authors: string;
  publication_year: number | null;
  doi: string;
  abstract: string;
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

/** Normalize chat SSE ``external_papers`` payload. */
export function normalizeExternalPapers(raw: unknown): ExternalPaper[] {
  if (!Array.isArray(raw)) return [];

  const out: ExternalPaper[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = pickString(record, ["id"]);
    if (!id) continue;

    const pdf_verified = Boolean(record.pdf_verified);
    const pdf_url = pdf_verified ? pickOptionalString(record, "pdf_url") || null : null;

    out.push({
      id,
      title: pickOptionalString(record, "title") || "Untitled paper",
      authors: pickOptionalString(record, "authors"),
      publication_year: pickOptionalYear(record),
      doi: pickOptionalString(record, "doi"),
      abstract: pickOptionalString(record, "abstract"),
      pdf_verified,
      pdf_url,
      landing_page_url: pickOptionalString(record, "landing_page_url"),
    });
  }

  return out;
}

/** Verified PDF links the LLM may emit in discover answers. */
export function verifiedPdfUrls(papers: ExternalPaper[]): string[] {
  return papers
    .filter((p) => p.pdf_verified && p.pdf_url)
    .map((p) => p.pdf_url!);
}

export function externalPaperByPdfUrl(
  papers: ExternalPaper[],
  url: string,
): ExternalPaper | undefined {
  const normalized = normalizeUrlForMatch(url);
  return papers.find(
    (p) => p.pdf_verified && p.pdf_url && normalizeUrlForMatch(p.pdf_url) === normalized,
  );
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
