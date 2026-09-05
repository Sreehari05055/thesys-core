import { useMemo } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { buildSourceIndex, type Source } from "@/lib/chatMessages";
import type { DocumentSummary } from "@/lib/documentSummary";

type SummaryMarkdownBodyProps = {
  summary: DocumentSummary;
  onSourceClick?: (source: Source) => void;
  onAttachSourceForChat?: (source: Source) => void;
};

export function SummaryMarkdownBody({
  summary,
  onSourceClick,
  onAttachSourceForChat,
}: SummaryMarkdownBodyProps) {
  const citationIndex = useMemo(
    () => buildSourceIndex(summary.sources),
    [summary.sources],
  );

  return (
    <>
      <MarkdownRenderer
        markdown={summary.markdown}
        sources={summary.sources}
        allSourcesById={citationIndex.allSourcesById}
        globalSourceNumberById={citationIndex.globalSourceNumberById}
        knownSourceIds={citationIndex.knownSourceIds}
        sourcesIndexReady={summary.sources.length > 0}
        onSourceClick={onSourceClick}
      />
      {onAttachSourceForChat && summary.sources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {summary.sources.map((src, index) => (
            <button
              key={src.id}
              type="button"
              onClick={() => onAttachSourceForChat(src)}
              className="source-chip source-chip--num"
              title="Attach this source to your next message"
            >
              {index + 1}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
