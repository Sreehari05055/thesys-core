/** In-app terms page. Override with env for a hosted page. */
const TERMS_OF_SERVICE_PATH = "/terms";

const termsUrlEnv = (import.meta.env.VITE_TERMS_URL as string | undefined)?.trim();

/** External URL when set; otherwise the in-app terms page. */
export function termsHref(): string {
  return termsUrlEnv || TERMS_OF_SERVICE_PATH;
}

export function isExternalLegalUrl(href: string): boolean {
  return /^https?:\/\//i.test(href);
}
