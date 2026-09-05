import type { ChatMessage } from "@/lib/chatMessages";

export type RightPanelTab = "sources" | "summaries";

export type Chat = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  /** When the session was last opened or used (ms). Drives sidebar order when set. */
  lastAccessAt?: number;
  sessionId: string;
};

/** Item from GET /api/conversations */
export type ConversationSummary = {
  session_id: string;
  title?: string;
  created_at?: string;
  last_access?: string;
  /** Legacy shapes */
  sessionId?: string;
  id?: string;
  createdAt?: string;
  lastAccess?: string;
};

/** GET /api/conversations/messages (header `X-Session-ID`) */
export type ConversationLoadResponse = {
  session_id?: string;
  title?: string;
  messages?: unknown;
};

export type Citation = {
  citation: string;
  style_fullname: string;
  style_shortname: string;
};

export type CitationResponse = {
  citations: Citation[];
};

type CitationBatchResult = {
  source: string;
  citations: Citation[];
  error: string | null;
};

export type CitationBatchResponse = {
  results: CitationBatchResult[];
};

export type CitationDialogData = CitationResponse | CitationBatchResponse;

export function isCitationBatchResponse(
  data: CitationDialogData,
): data is CitationBatchResponse {
  return "results" in data && Array.isArray(data.results);
}

export type CitationExportFormat = "bibtex" | "ris" | "enw" | "csv";

export const CITATION_EXPORT_FORMATS: {
  format: CitationExportFormat;
  label: string;
}[] = [
  { format: "bibtex", label: "BibTeX" },
  { format: "ris", label: "RIS" },
  { format: "enw", label: "EndNote" },
  { format: "csv", label: "CSV" },
];

type CitationExportItem = {
  export_name: string;
  export: string;
};

type CitationExportResult = {
  citation_input: string;
  exports: CitationExportItem[];
  error: string | null;
};

export type CitationExportResponse = {
  results: CitationExportResult[];
};
