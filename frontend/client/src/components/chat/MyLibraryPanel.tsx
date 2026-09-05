import { useMemo, useState } from "react";
import type { ChatPageModel } from "@/hooks/useChatPage";
import type { IngestedFile } from "@/lib/ingestedFile";
import { CITATION_EXPORT_FORMATS, type CitationExportFormat } from "@/types/chat";
import { cn } from "@/lib/utils";

type MyLibraryPanelProps = {
  model: ChatPageModel;
};

function libraryFileKey(file: IngestedFile): string {
  return `${file.session_id ?? "unknown"}:${file.doc_id ?? file.filename}`;
}

function BookmarkSimpleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block shrink-0"
      aria-hidden
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CiteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function ReaderIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function LibraryFileRow({
  file,
  sessionLabel,
  selected,
  onToggleSelected,
  onOpenReader,
  onDownload,
  downloadingFilename,
}: {
  file: IngestedFile;
  sessionLabel: string | null;
  selected: boolean;
  onToggleSelected: () => void;
  onOpenReader: (file: IngestedFile) => void;
  onDownload: (file: IngestedFile) => void;
  downloadingFilename: string | null;
}) {
  const docId = file.doc_id?.trim() || null;
  const sessionId = file.session_id?.trim() || null;
  const rowDisabled = !docId;
  const downloadDisabled = !docId || !sessionId;
  const isDownloading = downloadingFilename === file.filename;

  return (
    <li
      className="group flex min-w-0 items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 transition-colors hover:border-border hover:bg-accent/30"
      data-testid={`row-library-file-${file.filename}`}
    >
      <label className="flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelected}
          className="h-3.5 w-3.5 rounded border-border accent-primary"
          data-testid={`checkbox-library-file-${file.filename}`}
        />
      </label>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          disabled={rowDisabled}
          onClick={() => onOpenReader(file)}
          className={cn(
            "block w-full truncate border-0 bg-transparent p-0 text-left text-[13px] font-medium leading-snug text-foreground shadow-none outline-none transition-colors focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-primary/40",
            rowDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:text-primary",
          )}
          title={rowDisabled ? "Document id not ready yet" : file.filename}
        >
          {file.filename}
        </button>
        {sessionLabel && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70" title={sessionLabel}>
            {sessionLabel}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={rowDisabled}
          onClick={() => onOpenReader(file)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          title="Open in reader"
        >
          <ReaderIcon />
        </button>
        <button
          type="button"
          disabled={downloadDisabled || isDownloading}
          onClick={() => onDownload(file)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          title={downloadDisabled ? "Download unavailable" : "Download file"}
          data-testid={`button-download-library-file-${file.filename}`}
        >
          {isDownloading ? (
            <span className="text-[10px]">…</span>
          ) : (
            <DownloadIcon />
          )}
        </button>
      </div>
    </li>
  );
}

export function MyLibraryPanel({ model }: MyLibraryPanelProps) {
  const {
    libraryFiles,
    libraryFilesLoading,
    chats,
    openReaderForFile,
    downloadLibraryFile,
    downloadingFile,
    citeLibraryLoading,
    citeLibraryFiles,
    exportLibraryLoading,
    exportLibraryFiles,
  } = model;

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [showExportFormats, setShowExportFormats] = useState(false);

  const sessionTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const chat of chats) map.set(chat.sessionId, chat.title);
    return map;
  }, [chats]);

  const resolveSessionLabel = (file: IngestedFile) => {
    const sessionId = file.session_id?.trim();
    if (!sessionId) return null;
    return sessionTitleById.get(sessionId) ?? "Unknown session";
  };

  const toggleSelected = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleBibliography = () => {
    setShowExportFormats(false);
    const targets =
      selectedKeys.size > 0
        ? libraryFiles.filter((file) => selectedKeys.has(libraryFileKey(file)))
        : libraryFiles;
    void citeLibraryFiles(targets);
  };

  const selectedFiles = () =>
    selectedKeys.size > 0
      ? libraryFiles.filter((file) => selectedKeys.has(libraryFileKey(file)))
      : libraryFiles;

  const handleExport = (format: CitationExportFormat) => {
    void exportLibraryFiles(selectedFiles(), format);
  };

  const actionBusy = citeLibraryLoading || Boolean(exportLibraryLoading);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col px-6 py-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-foreground">
            <BookmarkSimpleIcon />
            <h2 className="text-[15px] font-semibold leading-none tracking-tight">My Library</h2>
          </div>

          {libraryFiles.length > 0 && (
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBibliography}
                  disabled={actionBusy || libraryFilesLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="button-library-bibliography"
                  title={selectedKeys.size > 0 ? "Cite selected papers" : "Cite all papers"}
                >
                  <CiteIcon />
                  {citeLibraryLoading ? "Generating…" : "Bibliography"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowExportFormats((open) => !open)}
                  disabled={actionBusy || libraryFilesLoading}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    showExportFormats
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-card text-foreground hover:bg-accent",
                  )}
                  data-testid="button-library-export"
                  title={selectedKeys.size > 0 ? "Export selected papers" : "Export all papers"}
                >
                  <ExportIcon />
                  Export
                </button>
              </div>

              {showExportFormats && (
                <div
                  className="flex flex-wrap justify-end gap-1.5 rounded-xl border border-border bg-muted/50 p-2"
                  data-testid="panel-library-export-formats"
                >
                  {CITATION_EXPORT_FORMATS.map(({ format, label }) => {
                    const isLoading = exportLibraryLoading === format;
                    return (
                      <button
                        key={format}
                        type="button"
                        onClick={() => handleExport(format)}
                        disabled={actionBusy || libraryFilesLoading}
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-[11px] font-bold tracking-tight transition-all",
                          isLoading
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                        data-testid={`button-export-format-${format}`}
                      >
                        {isLoading ? "Exporting…" : label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rag-scrollbar">
          {libraryFilesLoading ? (
            <div className="py-16 text-center text-[13px] text-muted-foreground" data-testid="state-library-loading">
              Loading papers…
            </div>
          ) : libraryFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="state-library-empty">
              <div className="mb-3 text-muted-foreground/30">
                <BookmarkSimpleIcon />
              </div>
              <div className="text-[14px] font-medium text-muted-foreground">No papers yet</div>
              <p className="mt-1.5 max-w-xs text-[13px] text-muted-foreground/70 leading-relaxed">
                Upload PDFs in a session to build your library.
              </p>
            </div>
          ) : (
            <ul className="space-y-2" data-testid="list-library-files">
              {libraryFiles.map((file) => {
                const key = libraryFileKey(file);
                return (
                  <LibraryFileRow
                    key={key}
                    file={file}
                    sessionLabel={resolveSessionLabel(file)}
                    selected={selectedKeys.has(key)}
                    onToggleSelected={() => toggleSelected(key)}
                    onOpenReader={openReaderForFile}
                    onDownload={downloadLibraryFile}
                    downloadingFilename={downloadingFile}
                  />
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
