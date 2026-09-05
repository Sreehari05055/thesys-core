import type { SourceJumpTarget } from "@/lib/sourceHighlight";

const STORAGE_PREFIX = "reader-highlight:";

function storageKey(sessionId: string, docId: string): string {
  return `${STORAGE_PREFIX}${sessionId}:${docId}`;
}

function parseStoredHighlight(raw: string): SourceJumpTarget | null {
  try {
    const parsed = JSON.parse(raw) as SourceJumpTarget;
    if (typeof parsed.page !== "number" || !Array.isArray(parsed.bboxes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Stash a source highlight to apply once the reader opens. */
export function storeReaderHighlight(
  sessionId: string,
  docId: string,
  target: SourceJumpTarget,
): void {
  if (!sessionId || !docId) return;
  sessionStorage.setItem(storageKey(sessionId, docId), JSON.stringify(target));
}

/** Read a stashed reader highlight without removing it. */
export function peekReaderHighlight(sessionId: string, docId: string): SourceJumpTarget | null {
  if (!sessionId || !docId) return null;
  const raw = sessionStorage.getItem(storageKey(sessionId, docId));
  if (!raw) return null;
  return parseStoredHighlight(raw);
}

export function clearReaderHighlight(sessionId: string, docId: string): void {
  if (!sessionId || !docId) return;
  sessionStorage.removeItem(storageKey(sessionId, docId));
}
