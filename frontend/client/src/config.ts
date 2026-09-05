// Environment configuration
// In dev the Vite proxy forwards /api/* to the Python backend, so use a relative base.
// In production set VITE_API_BASE_URL (or legacy VITE_API_URL) to the deployed API origin (no trailing slash).

const envApi =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  (import.meta.env.VITE_API_URL as string | undefined) ||
  "";

const config = {
  apiBaseUrl: envApi,
} as const;

export const API_URLS = {
  chat: `${config.apiBaseUrl}/api/chat`,

  listConversations: `${config.apiBaseUrl}/api/conversations`,

  /** GET — requires `X-Session-ID`. */
  loadConversation: `${config.apiBaseUrl}/api/conversations/messages`,

  /** DELETE — requires `X-Session-ID`. */
  deleteConversation: `${config.apiBaseUrl}/api/conversations`,

  /** GET — ingested file by md5 `doc_id`, or verified external PDF when `url` is set (path id = paper id). Requires `X-Session-ID`. */
  sessionFile: (
    docId: string,
    query?: { pageNumber?: string | number; url?: string; download?: boolean },
  ) => {
    const base = `${config.apiBaseUrl}/api/files/${encodeURIComponent(docId)}`;
    if (!query) return base;

    const search = new URLSearchParams();
    if (query.url?.trim()) search.set("url", query.url.trim());
    if (query.download) search.set("download", "true");
    const page = query.pageNumber;
    if (page !== undefined && page !== null && page !== "") {
      search.set("page_number", String(page));
    }
    const qs = search.toString();
    return qs ? `${base}?${qs}` : base;
  },

  /** GET — table/formula overlay regions for reader mode. Requires `X-Session-ID`. */
  sessionFileRegions: (docId: string) =>
    `${config.apiBaseUrl}/api/files/${encodeURIComponent(docId)}/regions`,

  /** POST — `{ citation_inputs: string[] }`. Requires `X-Session-ID`. */
  cite: `${config.apiBaseUrl}/api/cite`,

  /** POST — `{ citation_inputs, export_format }`. Requires `X-Session-ID`. */
  citeExport: `${config.apiBaseUrl}/api/cite/export`,

  /** POST — requires `X-Session-ID`. */
  summarizeDoc: (docId: string) =>
    `${config.apiBaseUrl}/api/summarize/${encodeURIComponent(docId)}`,

  /** GET — list saved summarize runs (metadata). Requires `X-Session-ID`. */
  listSummaries: `${config.apiBaseUrl}/api/summarize`,

  /** GET — one saved summary (markdown). Requires `X-Session-ID`. */
  savedSummary: (summaryId: string) =>
    `${config.apiBaseUrl}/api/summarize/saved/${encodeURIComponent(summaryId)}`,

  /** POST — upload files. Requires `X-Session-ID`. */
  ingest: `${config.apiBaseUrl}/api/ingest`,

  /** GET — list RAG files (omit session to list all). DELETE — body ``{ doc_id }`` or ``{ doc_ids }``. Session header required for scoped delete. */
  ingestFiles: `${config.apiBaseUrl}/api/ingest/files`,

  newConversation: `${config.apiBaseUrl}/api/conversations/new`,
} as const;
