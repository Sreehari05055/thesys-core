import type { IngestedFile } from "@/lib/ingestedFile";

/** Matches backend `ActiveDocument` (doc_id + filename pair). */
export type ActiveDocument = {
  doc_id: string;
  filename: string;
};

export function activeDocumentsFromIngested(
  ingestedFiles: IngestedFile[],
  selectedDocIds: string[],
): ActiveDocument[] {
  const pruned = pruneSelectedDocIds(selectedDocIds, ingestedFiles);
  if (pruned.length === 0) return [];

  const byDocId = new Map<string, IngestedFile>();
  for (const file of ingestedFiles) {
    const docId = file.doc_id?.trim();
    if (docId) byDocId.set(docId, file);
  }

  const out: ActiveDocument[] = [];
  const seen = new Set<string>();
  for (const id of pruned) {
    const docId = id.trim();
    if (seen.has(docId)) continue;
    const file = byDocId.get(docId);
    if (file) {
      seen.add(docId);
      out.push({ doc_id: docId, filename: file.filename });
    }
  }
  return out;
}

export function pruneSelectedDocIds(
  selectedDocIds: string[],
  ingestedFiles: IngestedFile[],
): string[] {
  const valid = new Set(
    ingestedFiles.map((f) => f.doc_id?.trim()).filter((id): id is string => Boolean(id)),
  );
  return selectedDocIds.filter((id) => valid.has(id));
}

export function toggleDocIdInList(selectedDocIds: string[], docId: string): string[] {
  return selectedDocIds.includes(docId)
    ? selectedDocIds.filter((id) => id !== docId)
    : [...selectedDocIds, docId];
}

export function scopedActiveDocumentsForMessage(
  ingestedFiles: IngestedFile[],
  selectedDocIds: string[],
  override?: ActiveDocument[],
): ActiveDocument[] {
  if (override && override.length > 0) return override;
  return activeDocumentsFromIngested(
    ingestedFiles,
    pruneSelectedDocIds(selectedDocIds, ingestedFiles),
  );
}
