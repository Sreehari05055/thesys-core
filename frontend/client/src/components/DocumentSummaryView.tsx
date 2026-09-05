import { SummaryMarkdownBody } from "@/components/SummaryMarkdownBody";
import type { Source } from "@/lib/chatMessages";
import type { DocumentSummary } from "@/lib/documentSummary";

export type DocumentSummaryViewProps = {
  summary: DocumentSummary | null;
  isLoading: boolean;
  onSourceClick?: (source: Source) => void;
};

export function DocumentSummaryView({
  summary,
  isLoading,
  onSourceClick,
}: DocumentSummaryViewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="view-document-summary">
      {isLoading && (
        <div className="h-0.5 w-full shrink-0 overflow-hidden bg-muted">
          <div className="h-full w-full animate-pulse bg-primary/60" />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto rag-scrollbar">
        <div className="mx-auto w-full max-w-2xl px-6 py-8">
          {isLoading && !summary && (
            <p className="py-12 text-center text-sm text-muted-foreground">Summarizing document…</p>
          )}
          {!isLoading && !summary && (
            <p className="py-12 text-center text-sm text-muted-foreground">No summary content.</p>
          )}
          {summary && (
            <SummaryMarkdownBody summary={summary} onSourceClick={onSourceClick} />
          )}
        </div>
      </div>
    </div>
  );
}
