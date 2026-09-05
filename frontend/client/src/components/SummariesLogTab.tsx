import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { API_URLS } from "@/config";
import {
  formatSummaryTimestamp,
  normalizeSavedSummaryList,
  type SavedSummaryMeta,
} from "@/lib/summaryList";

export type SummariesLogTabProps = {
  sessionId: string;
  refreshKey: number;
  activeSummaryId: string | null;
  onSelect: (meta: SavedSummaryMeta) => void;
  loadingDetailId: string | null;
};

export function SummariesLogTab({
  sessionId,
  refreshKey,
  activeSummaryId,
  onSelect,
  loadingDetailId,
}: SummariesLogTabProps) {
  const [items, setItems] = useState<SavedSummaryMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    if (!sessionId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(API_URLS.listSummaries, {}, sessionId);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(normalizeSavedSummaryList(data));
    } catch {
      setError("Could not load summaries.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchList();
  }, [fetchList, refreshKey]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="tab-summaries-log">
      <div className="shrink-0 px-4 pt-4 pb-2">
        <div className="sidebar-section-label px-1 py-1.5">Saved summaries</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rag-scrollbar px-3 pb-4">
        {loading && (
          <div className="text-[13px] text-muted-foreground text-center py-8">Loading…</div>
        )}
        {error && !loading && (
          <div className="text-[13px] text-destructive text-center py-8">{error}</div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="text-[13px] text-muted-foreground text-center py-8 leading-relaxed">
            No summaries yet. Use Summarize in the papers menu (+) to generate one.
          </div>
        )}
        <div className="space-y-1.5">
          {items.map((item) => {
            const isActive = activeSummaryId === item.id;
            const isLoadingRow = loadingDetailId === item.id;
            const timeLabel = formatSummaryTimestamp(item.created_at);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                disabled={isLoadingRow}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  isActive
                    ? "border-primary/30 bg-primary/8"
                    : "border-border bg-secondary hover:bg-accent"
                } disabled:opacity-60`}
                data-testid={`summary-log-item-${item.id}`}
              >
                <div className="text-[13px] font-medium text-foreground truncate">
                  {item.title || item.filename || "Summary"}
                </div>
                {item.filename && item.filename !== item.title && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{item.filename}</div>
                )}
                {timeLabel && (
                  <div className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
                    {timeLabel}
                  </div>
                )}
                {isLoadingRow && (
                  <div className="mt-1.5 text-[11px] text-primary">Opening…</div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
