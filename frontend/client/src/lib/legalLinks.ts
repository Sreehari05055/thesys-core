/** In-app legal pages (static). Override with env for hosted PDFs/HTML later if needed. */
const TERMS_OF_SERVICE_PATH = "/terms";
const PRIVACY_POLICY_PATH = "/privacy";

const termsUrlEnv = (import.meta.env.VITE_TERMS_URL as string | undefined)?.trim();
const privacyUrlEnv = (import.meta.env.VITE_PRIVACY_URL as string | undefined)?.trim();

/** External URL when set; otherwise same-origin path for in-app pages. */
export function termsHref(): string {
  return termsUrlEnv || TERMS_OF_SERVICE_PATH;
}

export function privacyHref(): string {
  return privacyUrlEnv || PRIVACY_POLICY_PATH;
}

export function isExternalLegalUrl(href: string): boolean {
  return /^https?:\/\//i.test(href);
}
