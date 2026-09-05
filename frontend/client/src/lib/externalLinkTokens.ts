import {
  externalPaperByPdfUrl,
  type ExternalPaper,
  verifiedPdfUrls,
} from "@/lib/externalPaper";

const URL_IN_TEXT =
  /https?:\/\/[^\s<>\[\]"')]+/gi;

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function externalLinkHtml(paper: ExternalPaper): string {
  const paperId = escapeHtmlAttr(paper.id);
  const title = escapeHtmlAttr(paper.title);
  return `<cite class="inline-external-link" data-paper-id="${paperId}" title="${title}" aria-label="Open paper link">` +
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>` +
    `<polyline points="15 3 21 3 21 9"/>` +
    `<line x1="10" y1="14" x2="21" y2="3"/>` +
    `</svg></cite>`;
}

/**
 * Replace verified PDF URLs in discover answers with compact external-link chips.
 * Only URLs present in ``externalPapers`` with ``pdf_verified`` are transformed.
 */
export function applyExternalLinkTokens(
  markdown: string,
  externalPapers: ExternalPaper[] | undefined,
  discoverMode: boolean,
): string {
  if (!discoverMode || !externalPapers?.length || !verifiedPdfUrls(externalPapers).length) {
    return markdown;
  }

  return markdown.replace(URL_IN_TEXT, (match) => {
    const paper = externalPaperByPdfUrl(externalPapers, match);
    return paper ? externalLinkHtml(paper) : match;
  });
}
