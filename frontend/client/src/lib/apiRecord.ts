/** First non-empty string value among `keys` on a JSON object. */
export function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Normalize API `content` fields (plain string or array of text parts). */
export function extractTextContent(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((part) =>
        typeof part === "string" ? part : (part as { text?: string })?.text ?? "",
      )
      .join("");
  }
  return String(raw);
}
