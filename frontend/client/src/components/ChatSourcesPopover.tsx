import { useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import type { IngestedFile } from "@/lib/ingestedFile";
import { cn } from "@/lib/utils";

type ChatSourcesPopoverProps = {
  disabled?: boolean;
  files: IngestedFile[];
  filesLoading: boolean;
  uploadLoading: boolean;
  uploadMessage: string | null;
  selectedDocIds: string[];
  onToggleDoc: (docId: string) => void;
  onClearSelection: () => void;
  onUploadFiles: (files: File[]) => void;
  onOpenReader: (file: IngestedFile) => void;
  onSummarize: (file: IngestedFile) => void;
  onCite: (file: IngestedFile) => void;
  onDelete: (file: IngestedFile) => void;
  deletingFilename: string | null;
  triggerClassName?: string;
};

const POPOVER_CONTENT_CLASS =
  "z-50 w-[min(100vw-2rem,24rem)] rounded-xl p-3 outline-none rag-popover-content";

function CiteIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 17c-2.5 0-4.5-2-4.5-4.5V7h3.5v5c0 .8.7 1.5 1.5 1.5H7zm10 0c-2.5 0-4.5-2-4.5-4.5V7H16v5c0 .8.7 1.5 1.5 1.5H17z" />
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

function SummarizeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ChatSourcesPopover({
  disabled,
  files,
  filesLoading,
  uploadLoading,
  uploadMessage,
  selectedDocIds,
  onToggleDoc,
  onClearSelection,
  onUploadFiles,
  onOpenReader,
  onSummarize,
  onCite,
  onDelete,
  deletingFilename,
  triggerClassName,
}: ChatSourcesPopoverProps) {
  const [open, setOpen] = useState(false);
  const [summarizeConfirmFile, setSummarizeConfirmFile] = useState<IngestedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCount = selectedDocIds.length;

  const soleSelectedDocId = selectedCount === 1 ? selectedDocIds[0]! : null;

  const soleSelectedFile =
    soleSelectedDocId != null
      ? files.find((f) => f.doc_id?.trim() === soleSelectedDocId) ?? null
      : null;

  const canUseSoleSelectedFile = Boolean(soleSelectedFile?.doc_id?.trim());

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    const accepted = raw.filter((f) => /\.pdf$/i.test(f.name));
    const rejected = raw.length - accepted.length;
    if (rejected > 0) {
      window.alert(`${rejected} file(s) ignored — only PDF files are allowed.`);
    }
    if (accepted.length > 0) onUploadFiles(accepted);
  };

  const runOnSoleSelected = (action: (file: IngestedFile) => void) => {
    if (!soleSelectedFile || !canUseSoleSelectedFile) return;
    action(soleSelectedFile);
    setOpen(false);
  };

  const openReader = (file: IngestedFile) => {
    if (!file.doc_id?.trim()) return;
    onOpenReader(file);
    setOpen(false);
  };

  const confirmSummarize = () => {
    if (!summarizeConfirmFile?.doc_id?.trim()) return;
    onSummarize(summarizeConfirmFile);
    setSummarizeConfirmFile(null);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled || uploadLoading}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
            triggerClassName,
          )}
          title="Upload and manage papers"
          data-testid="button-chat-sources-popover"
          aria-label="Papers"
        >
          {uploadLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground/80" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className={POPOVER_CONTENT_CLASS}
          data-testid="popover-chat-sources"
        >
          <Popover.Arrow className="fill-popover" />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleFileChange}
            data-testid="input-chat-sources-upload"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-95 disabled:opacity-50"
            data-testid="button-chat-sources-upload"
          >
            Upload PDF
          </button>
          {uploadMessage && (
            <p
              className={cn(
                "mt-2 text-xs",
                /failed|exceeded|too large|already in your corpus|duplicate/i.test(uploadMessage)
                  ? "text-red-400"
                  : "text-primary",
              )}
              data-testid="status-chat-sources-upload"
            >
              {uploadMessage}
            </p>
          )}

          <button
            type="button"
            disabled={!canUseSoleSelectedFile}
            onClick={() => runOnSoleSelected(onOpenReader)}
            className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/12 px-3 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
            title={
              canUseSoleSelectedFile
                ? "Open checked paper in reader"
                : selectedCount > 1
                  ? "Check one paper only, or click a title below to read"
                  : "Check a paper below, or click a title to read"
            }
            data-testid="button-popover-open-reader"
          >
            <ReaderIcon />
            Open in Reader
          </button>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Include in answers
              </span>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground/70">
                {selectedCount === 0
                  ? "No selection — chat uses all papers"
                  : selectedCount === 1
                    ? "1 paper selected for chat"
                    : `${selectedCount} papers selected for chat`}
                {" · "}
                click a title to read
              </p>
            </div>
            {selectedCount > 0 && (
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={onClearSelection}
                className="shrink-0 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          <div className="mt-2 max-h-[240px] overflow-x-hidden overflow-y-auto rag-scrollbar">
            {filesLoading ? (
              <div className="py-4 text-center text-xs text-muted-foreground">Loading papers…</div>
            ) : files.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">No papers yet — upload a PDF above</div>
            ) : (
              <ul className="space-y-1">
                {files.map((file, idx) => {
                  const docId = file.doc_id?.trim() || null;
                  const checked = Boolean(docId && selectedDocIds.includes(docId));
                  const rowDisabled = !docId;
                  const canCite = file.metadata.verified;

                  return (
                    <li key={file.filename}>
                      <div
                        className={cn(
                          "group flex min-w-0 items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:bg-accent/60",
                          checked && "border-primary/20 bg-primary/8",
                        )}
                        data-testid={`row-chat-source-${idx}`}
                      >
                        <input
                          type="checkbox"
                          className="rag-checkbox h-4 w-4 shrink-0 rounded"
                          checked={checked}
                          disabled={rowDisabled || uploadLoading}
                          onChange={() => docId && onToggleDoc(docId)}
                          title={rowDisabled ? "Document id not ready yet" : "Include in chat answers"}
                          data-testid={`checkbox-chat-source-${idx}`}
                        />
                        <button
                          type="button"
                          disabled={rowDisabled}
                          onClick={() => openReader(file)}
                          className={cn(
                            "min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-[13px] leading-snug text-foreground/90 shadow-none outline-none transition-colors focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-primary/40",
                            rowDisabled
                              ? "cursor-not-allowed opacity-50"
                              : "cursor-pointer hover:text-primary",
                          )}
                          title={rowDisabled ? "Document id not ready yet" : file.filename}
                          data-testid={`button-open-reader-row-${idx}`}
                        >
                          {file.filename}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (!canCite) return;
                            setOpen(false);
                            onCite(file);
                          }}
                          disabled={!canCite}
                          className={cn(
                            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors",
                            canCite
                              ? "border-primary/35 bg-primary/12 text-primary hover:bg-primary/22"
                              : "cursor-not-allowed border-border bg-muted text-muted-foreground/35",
                          )}
                          title={canCite ? "Generate citation" : "Citation unavailable (unverified)"}
                          data-testid={`button-cite-popover-${idx}`}
                        >
                          <CiteIcon />
                        </button>

                        <button
                          type="button"
                          onClick={() => onDelete(file)}
                          disabled={deletingFilename === file.filename}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                          title="Delete file"
                          data-testid={`button-delete-popover-${idx}`}
                        >
                          {deletingFilename === file.filename ? "…" : "×"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <button
              type="button"
              disabled={!canUseSoleSelectedFile}
              onClick={() => {
                if (!canUseSoleSelectedFile || !soleSelectedFile) return;
                setOpen(false);
                setSummarizeConfirmFile(soleSelectedFile);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              title={
                canUseSoleSelectedFile
                  ? "Generate a full summary (uses usage quota)"
                  : selectedCount > 1
                    ? "Check exactly one paper to summarize"
                    : "Check one paper above to enable summarization"
              }
              data-testid="button-popover-summarize"
            >
              <SummarizeIcon />
              Generate summary…
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>

      {summarizeConfirmFile && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
          onClick={() => setSummarizeConfirmFile(null)}
          role="presentation"
          data-testid="summarize-confirm-backdrop"
        >
          <div
            role="alertdialog"
            aria-labelledby="summarize-confirm-title"
            aria-describedby="summarize-confirm-description"
            className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            data-testid="summarize-confirm-dialog"
          >
            <h3 id="summarize-confirm-title" className="text-[15px] font-semibold text-foreground">
              Generate summary?
            </h3>
            <p id="summarize-confirm-description" className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
              This will run a full summarization on{" "}
              <span className="font-medium text-foreground break-all">{summarizeConfirmFile.filename}</span>.
              It may count toward your usage limits and can take a minute.
            </p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setSummarizeConfirmFile(null)}
                className="rounded-md border border-border px-4 py-2 text-[13px] font-medium text-foreground hover:bg-accent transition-colors"
                data-testid="button-summarize-confirm-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSummarize}
                className="rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:brightness-95 transition-colors"
                data-testid="button-summarize-confirm"
              >
                Generate summary
              </button>
            </div>
          </div>
        </div>
      )}
    </Popover.Root>
  );
}
