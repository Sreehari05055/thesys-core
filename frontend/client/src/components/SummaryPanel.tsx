import React, { useState } from "react";
import { SummaryMarkdownBody } from "@/components/SummaryMarkdownBody";
import type { Source } from "@/lib/chatMessages";
import type { DocumentSummary } from "@/lib/documentSummary";

export interface SummaryPanelProps {
  summary: DocumentSummary | null;
  isLoading: boolean;
  onClose?: () => void;
  onSourceClick?: (source: Source) => void;
  onAttachSourceForChat?: (source: Source) => void;
}

export function SummaryPanel({
  summary,
  isLoading,
  onClose,
  onSourceClick,
  onAttachSourceForChat,
}: SummaryPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!summary?.markdown) return;
    try {
      await navigator.clipboard.writeText(summary.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col border border-white/10 rounded-lg bg-white/5 overflow-hidden my-4 max-w-full">
      <div className="flex items-center justify-between px-3 py-2 bg-black/20 border-b border-white/5">
        <span className="font-medium text-sm text-white/90">Document summary</span>
        <div className="flex items-center gap-2">
          {summary?.markdown && (
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="text-xs text-white/40 hover:text-white/80 transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} className="text-white/40 hover:text-white/80">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="h-0.5 w-full bg-white/5 overflow-hidden">
          <div className="h-full bg-primary/60 w-full animate-pulse" />
        </div>
      )}

      <div className="flex flex-col p-4 max-h-[350px] overflow-y-auto rag-scrollbar">
        {!summary?.markdown && !isLoading && (
          <div className="text-center text-sm text-white/40 py-4">No summary available.</div>
        )}
        {summary?.markdown && (
          <SummaryMarkdownBody
            summary={summary}
            onSourceClick={onSourceClick}
            onAttachSourceForChat={onAttachSourceForChat}
          />
        )}
      </div>
    </div>
  );
}
