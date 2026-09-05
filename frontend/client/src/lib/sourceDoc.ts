import { canonicalIngestedFilename, type IngestedFile } from "@/lib/ingestedFile";
import type { Source } from "@/lib/chatMessages";

/** Human-readable label (filename/title) for UI only. */
export function getDocDisplayName(source: Source): string {
  const record = source as Source & { filename?: string; file_name?: string };
  const name = [record.filename, record.file_name, source.title].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  return name?.trim() ?? "Document";
}

function isLikelyDocId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return false;
  return !(trimmed.includes(".") || trimmed.includes("/") || trimmed.includes("\\"));
}

export function getDocId(source: Source, ingestedFiles: IngestedFile[]): string {
  const record = source as Source & { doc_id?: string; document_id?: string };
  const displayName = canonicalIngestedFilename(getDocDisplayName(source));
  const ingested = ingestedFiles.find(
    (f) => f.filename === displayName || f.filename === getDocDisplayName(source),
  );
  if (ingested?.doc_id?.trim()) return ingested.doc_id.trim();

  for (const raw of [record.doc_id, record.document_id]) {
    if (typeof raw === "string" && isLikelyDocId(raw)) return raw.trim();
  }

  // source.id is usually a chunk id — only treat it as doc id when it matches a known paper.
  if (typeof source.id === "string" && isLikelyDocId(source.id)) {
    const id = source.id.trim();
    if (ingestedFiles.some((f) => f.doc_id?.trim() === id)) return id;
  }

  return "";
}

function isSourceInCurrentDocument(
  source: Source,
  currentDocId: string,
  currentDocName: string,
  ingestedFiles: IngestedFile[],
): boolean {
  const normalizedCurrentDocId = currentDocId.trim();
  if (!normalizedCurrentDocId) return false;

  const sourceDocId = getDocId(source, ingestedFiles);
  if (sourceDocId && sourceDocId === normalizedCurrentDocId) return true;

  const sourceName = canonicalIngestedFilename(getDocDisplayName(source));
  const currentName = canonicalIngestedFilename(currentDocName);
  if (sourceName && currentName && sourceName === currentName) return true;

  const currentFile = ingestedFiles.find((f) => f.doc_id?.trim() === normalizedCurrentDocId);
  if (
    currentFile &&
    sourceName &&
    canonicalIngestedFilename(currentFile.filename) === sourceName
  ) {
    return true;
  }

  return false;
}

/** Only prompt to switch papers when the source clearly belongs to a different document. */
export function shouldConfirmCrossDocSource(
  source: Source,
  currentDocId: string,
  currentDocName: string,
  ingestedFiles: IngestedFile[],
): boolean {
  if (isSourceInCurrentDocument(source, currentDocId, currentDocName, ingestedFiles)) {
    return false;
  }

  const normalizedCurrentDocId = currentDocId.trim();
  const sourceDocId = getDocId(source, ingestedFiles);
  if (!sourceDocId || !normalizedCurrentDocId || sourceDocId === normalizedCurrentDocId) {
    return false;
  }

  if (
    ingestedFiles.some(
      (f) => f.doc_id?.trim() === sourceDocId && f.doc_id.trim() !== normalizedCurrentDocId,
    )
  ) {
    return true;
  }

  const record = source as Source & { doc_id?: string; document_id?: string };
  for (const raw of [record.doc_id, record.document_id]) {
    if (typeof raw === "string" && isLikelyDocId(raw) && raw.trim() !== normalizedCurrentDocId) {
      return true;
    }
  }

  return false;
}
