/** Product name in the UI. */
export const SITE_NAME = "Thesys";

/** Short label for document title and meta when SITE_NAME is unset. */
const SITE_TITLE_FALLBACK = "Research workspace";

/** Legal and in-product copy when a name is required but SITE_NAME is empty. */
const SITE_NAME_COPY = "the service";

export function siteNameForCopy(): string {
  return SITE_NAME.trim() || SITE_NAME_COPY;
}

/** Legal, support, and terms inquiries. */
export const CONTACT_EMAIL = "researchbetainfo@gmail.com";

/** Shown on Terms of Service and Privacy Policy. */
export const LEGAL_LAST_UPDATED = "25 May 2026";

export const SITE_TAGLINE = "Research workspace for document-grounded analysis";

export const SITE_DESCRIPTION =
  "Upload papers, query your library with cited answers, preview source passages, and export bibliographies — built for serious research.";

export const OG_IMAGE_PATH = "/og-image.svg";

/** Canonical weave logo — edit this SVG only; UI loads it via WeaveLogo. */
export const WEAVE_MARK_PATH = "/weave-mark.svg?v=olive-deep";

export function pageTitle(segment?: string): string {
  const name = SITE_NAME.trim();
  const fallback = SITE_TITLE_FALLBACK;
  if (!segment) return name || fallback;
  if (!name) return segment;
  if (segment === name) return name;
  return `${segment} · ${name}`;
}
