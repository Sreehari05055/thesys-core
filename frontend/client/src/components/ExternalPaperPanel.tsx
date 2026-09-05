import { ExternalPdfPreview } from "@/components/ExternalPdfPreview";
import type { ExternalPaper } from "@/lib/externalPaper";
import {
  formatExternalPaperAuthors,
  primaryExternalLink,
} from "@/lib/externalPaper";

export type ExternalPaperPanelProps = {
  sessionId: string;
  paper: ExternalPaper;
  addingToLibrary: boolean;
  onOpenLink: () => void;
  onAddToLibrary?: () => void;
};

export function ExternalPaperPanel({
  sessionId,
  paper,
  addingToLibrary,
  onOpenLink,
  onAddToLibrary,
}: ExternalPaperPanelProps) {
  const meta = formatExternalPaperAuthors(paper);
  const link = primaryExternalLink(paper);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="panel-external-paper">
      {paper.pdf_verified && (
        <>
          <ExternalPdfPreview sessionId={sessionId} paper={paper} />
          <div
            className="pointer-events-none relative z-10 -mt-6 h-6 shrink-0 bg-gradient-to-t from-card to-transparent"
            aria-hidden
          />
        </>
      )}

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto p-4 pt-0 rag-scrollbar">
        <span className="mb-3 inline-block rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          External paper
        </span>

        <h3 className="text-[15px] font-semibold leading-snug text-foreground">{paper.title}</h3>

        {meta && (
          <p className="mt-1.5 text-[12px] text-muted-foreground">{meta}</p>
        )}

        {paper.doi && (
          <p className="mt-2 text-[11px] text-muted-foreground/80">
            DOI: <span className="font-mono text-foreground/70">{paper.doi}</span>
          </p>
        )}

        {paper.abstract && (
          <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
            {paper.abstract}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border p-4">
        <button
          type="button"
          onClick={onOpenLink}
          disabled={!link}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          data-testid="button-open-external-link"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Open link
        </button>

        {paper.pdf_verified && onAddToLibrary && (
          <button
            type="button"
            onClick={onAddToLibrary}
            disabled={addingToLibrary || !paper.pdf_url}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary text-[13px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            data-testid="button-add-external-to-library"
          >
            {addingToLibrary ? "Adding…" : "Add to library"}
          </button>
        )}
      </div>
    </div>
  );
}
