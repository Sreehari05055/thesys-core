import type { OfflineQueryTurn } from "@/lib/chatMessages";
import { cn } from "@/lib/utils";

type OfflineQueryHistoryProps = {
  turns: OfflineQueryTurn[];
  selectedIndex: number | null;
  loading: boolean;
  onSelect: (index: number) => void;
};

export function OfflineQueryHistory({
  turns,
  selectedIndex,
  loading,
  onSelect,
}: OfflineQueryHistoryProps) {
  if (turns.length === 0 && !loading) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center" data-testid="state-offline-empty">
        <div className="max-w-sm text-center">
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            Search your papers
          </div>
          <div className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
            Upload PDFs, then search for a claim or topic. Matching passages open in the PDF.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-6" data-testid="list-offline-queries">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/75">
        Queries
      </div>
      <ul className="space-y-1">
        {turns.map((turn) => {
          const active = turn.index === selectedIndex;
          return (
            <li key={turn.index}>
              <button
                type="button"
                onClick={() => onSelect(turn.index)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  active
                    ? "border-primary/30 bg-primary/8 text-foreground"
                    : "border-transparent bg-transparent text-foreground/75 hover:bg-accent/60 hover:text-foreground",
                )}
                data-testid={`offline-query-${turn.index}`}
              >
                <span className="mt-0.5 min-w-0 flex-1 text-[13px] leading-snug line-clamp-2">
                  {turn.query}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                    active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {turn.sources.length}
                </span>
              </button>
            </li>
          );
        })}
        {loading ? (
          <li className="px-3 py-2 text-[12px] text-muted-foreground" data-testid="offline-query-loading">
            Searching…
          </li>
        ) : null}
      </ul>
    </div>
  );
}
