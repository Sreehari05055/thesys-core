import { apiFetch } from "@/lib/apiFetch";
import { API_URLS } from "@/config";

export type IngestedFile = {
  filename: string;
  doc_id: string | null;
  /** Present when listing files across all sessions. */
  session_id: string | null;
  metadata: {
    identifier: string | null;
    verified: boolean;
  };
};

/** Match backend `os.path.basename` before `_doc_id_for_filename`. */
export function canonicalIngestedFilename(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const parts = trimmed.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? trimmed;
}

export function mergeIngestedFiles(
  existing: IngestedFile[],
  incoming: IngestedFile[],
): IngestedFile[] {
  const byName = new Map(existing.map((f) => [f.filename, f]));
  for (const file of incoming) {
    const prev = byName.get(file.filename);
    const incomingDocId = file.doc_id?.trim() || null;
    byName.set(file.filename, {
      filename: file.filename,
      doc_id: incomingDocId ?? prev?.doc_id ?? null,
      session_id: file.session_id?.trim() || prev?.session_id || null,
      metadata: {
        identifier: file.metadata.identifier ?? prev?.metadata.identifier ?? null,
        verified: file.metadata.verified || Boolean(prev?.metadata.verified),
      },
    });
  }
  return Array.from(byName.values());
}

function fileCountFromUploadMessage(message: string): number | null {
  const match = message.match(/(\d+)\s+files?/i);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** User-facing upload status (backend responses may say "ingested"). */
export function formatUploadStatusMessage(
  raw: string | null | undefined,
  fileCount?: number,
): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  const usesIngestWording = !trimmed || /\bingest/i.test(trimmed);

  if (!usesIngestWording) return trimmed;

  const n = fileCount ?? (trimmed ? fileCountFromUploadMessage(trimmed) : null);
  if (n === 1) return "1 file added to corpus.";
  if (n != null && n > 1) return `${n} files added to corpus.`;
  return "Added to corpus.";
}

export function normalizeIngestedFiles(raw: unknown): IngestedFile[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const record = item as Record<string, unknown>;
      const filenameRaw =
        record.filename ?? record.file_name ?? record.name ?? record.title;

      if (typeof filenameRaw !== "string" || !filenameRaw.trim()) return null;

      const filename = canonicalIngestedFilename(filenameRaw);
      if (!filename) return null;

      const metadataRaw = record.metadata as Record<string, unknown> | undefined;
      const metadata = {
        identifier: typeof metadataRaw?.identifier === "string" ? metadataRaw.identifier : null,
        verified: Boolean(metadataRaw?.verified),
      };
      const docIdRaw = record.doc_id ?? record.document_id;
      const sessionIdRaw = record.session_id ?? record.sessionId;
      return {
        filename,
        doc_id: typeof docIdRaw === "string" && docIdRaw.trim() ? docIdRaw.trim() : null,
        session_id:
          typeof sessionIdRaw === "string" && sessionIdRaw.trim() ? sessionIdRaw.trim() : null,
        metadata,
      };
    })
    .filter((value): value is IngestedFile => Boolean(value));
}

/** GET /api/ingest/files for a session. Throws on network/HTTP failure. */
export async function fetchSessionIngestedFiles(sessionId: string): Promise<IngestedFile[]> {
  const trimmed = sessionId.trim();
  if (!trimmed) return [];

  const res = await apiFetch(API_URLS.ingestFiles, {}, trimmed);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  return normalizeIngestedFiles(data?.files);
}

/** GET /api/ingest/files across all user sessions. Throws on network/HTTP failure. */
export async function fetchAllIngestedFiles(): Promise<IngestedFile[]> {
  const res = await apiFetch(API_URLS.ingestFiles);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  return normalizeIngestedFiles(data?.files);
}

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(header);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1].replace(/"/g, "").trim());
  } catch {
    return match[1].replace(/"/g, "").trim();
  }
}

/** GET /api/files/{doc_id}?download=true — saves the file to disk. Requires session id on the file. */
export async function downloadIngestedFile(file: IngestedFile): Promise<void> {
  const docId = file.doc_id?.trim();
  const sessionId = file.session_id?.trim();
  if (!docId || !sessionId) throw new Error("Missing document or session id");

  const res = await apiFetch(API_URLS.sessionFile(docId, { download: true }), {}, sessionId);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download =
    filenameFromContentDisposition(res.headers.get("Content-Disposition")) ||
    file.filename ||
    "document.pdf";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
