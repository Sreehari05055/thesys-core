import { apiFetch } from "@/lib/apiFetch";
import { API_URLS } from "@/config";
import type {
  CitationBatchResponse,
  CitationDialogData,
  CitationExportFormat,
  CitationExportResponse,
  CitationResponse,
} from "@/types/chat";
import type { IngestedFile } from "@/lib/ingestedFile";

/** DOI, arXiv id, or title/filename for cite. */
function citationInputForFile(file: IngestedFile): string | null {
  const identifier = file.metadata.identifier?.trim();
  if (identifier) return identifier;
  const filename = file.filename.trim();
  return filename || null;
}

function groupFilesBySession(
  files: IngestedFile[],
  fallbackSessionId?: string | null,
): Map<string, IngestedFile[]> {
  const bySession = new Map<string, IngestedFile[]>();

  for (const file of files) {
    const sessionId = file.session_id?.trim() || fallbackSessionId?.trim();
    if (!sessionId) continue;
    const group = bySession.get(sessionId) ?? [];
    group.push(file);
    bySession.set(sessionId, group);
  }

  return bySession;
}

const EXPORT_EXTENSIONS: Record<CitationExportFormat, string> = {
  bibtex: "bib",
  ris: "ris",
  enw: "enw",
  csv: "csv",
};

function defaultExportFilename(format: CitationExportFormat): string {
  return `bibliography.${EXPORT_EXTENSIONS[format]}`;
}

function parseExportContent(data: unknown, format: CitationExportFormat): string {
  const record = data as CitationExportResponse;
  if (!Array.isArray(record?.results)) {
    throw new Error("Unexpected export response");
  }

  const parts: string[] = [];
  for (const result of record.results) {
    if (result.error) continue;
    const match = result.exports?.find(
      (item) => item.export_name === format && typeof item.export === "string" && item.export.trim(),
    );
    if (match?.export.trim()) parts.push(match.export.trim());
  }

  if (parts.length === 0) throw new Error("Empty export response");

  const separator = format === "csv" ? "\n" : "\n\n";
  return parts.join(separator);
}

function saveTextDownload(content: string, filename: string, mimeType = "text/plain"): void {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function parseCiteResponse(data: unknown, preferSinglePaper = false): CitationDialogData {
  const record = data as CitationBatchResponse & CitationResponse;

  if (Array.isArray(record?.results)) {
    if (preferSinglePaper && record.results.length === 1 && !record.results[0]?.error) {
      return { citations: record.results[0].citations };
    }
    return { results: record.results };
  }

  if (Array.isArray(record?.citations)) {
    return { citations: record.citations };
  }

  throw new Error("Unexpected cite response");
}

export async function fetchCitations(
  citation_inputs: string[],
  sessionId: string,
  options?: { preferSinglePaper?: boolean },
): Promise<CitationDialogData> {
  const inputs = citation_inputs.map((value) => value.trim()).filter(Boolean);
  if (inputs.length === 0) throw new Error("No citable inputs");

  const res = await apiFetch(
    API_URLS.cite,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ citation_inputs: inputs }),
    },
    sessionId,
  );

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  return parseCiteResponse(data, options?.preferSinglePaper);
}

export async function exportCitations(
  files: IngestedFile[],
  export_format: CitationExportFormat,
  fallbackSessionId?: string | null,
): Promise<void> {
  const bySession = groupFilesBySession(files, fallbackSessionId);
  if (bySession.size === 0) {
    throw new Error("No session context for export");
  }

  const parts: string[] = [];
  const filename = defaultExportFilename(export_format);

  for (const [sessionId, groupFiles] of Array.from(bySession.entries())) {
    const citation_inputs = groupFiles
      .map(citationInputForFile)
      .filter((value: string | null): value is string => Boolean(value?.trim()));

    if (citation_inputs.length === 0) continue;

    const res = await apiFetch(
      API_URLS.citeExport,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citation_inputs, export_format }),
      },
      sessionId,
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    parts.push(parseExportContent(data, export_format));
  }

  if (parts.length === 0) throw new Error("No citable inputs");

  const separator = export_format === "csv" ? "\n" : "\n\n";
  saveTextDownload(parts.join(separator), filename);
}

export async function fetchBatchCitations(
  files: IngestedFile[],
  fallbackSessionId?: string | null,
): Promise<CitationBatchResponse> {
  const bySession = groupFilesBySession(files, fallbackSessionId);

  if (bySession.size === 0) {
    throw new Error("No session context for batch cite");
  }

  const mergedResults: CitationBatchResponse["results"] = [];

  for (const [sessionId, groupFiles] of Array.from(bySession.entries())) {
    const citation_inputs = groupFiles
      .map(citationInputForFile)
      .filter((value: string | null): value is string => Boolean(value?.trim()));

    if (citation_inputs.length === 0) continue;

    const data = await fetchCitations(citation_inputs, sessionId);
    if ("results" in data) {
      mergedResults.push(...data.results);
    } else if (data.citations.length > 0) {
      mergedResults.push({
        source: citation_inputs[0] ?? "",
        citations: data.citations,
        error: null,
      });
    }
  }

  if (mergedResults.length === 0) {
    throw new Error("No citable inputs");
  }

  return { results: mergedResults };
}
