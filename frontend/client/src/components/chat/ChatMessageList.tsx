import { DraftingIndicator } from "@/components/DraftingIndicator";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { SentPassageChips } from "@/components/chat/PendingSourceChips";
import { buildCitationTokenContext, extractCitedSourceIds } from "@/lib/citationTokens";
import type { ChatMessage, Source } from "@/lib/chatMessages";
import type { ExternalPaper } from "@/lib/externalPaper";
import { parseReaderUserMessage } from "@/lib/readerPassageSelection";

export type ChatMessageListProps = {
  messages: ChatMessage[];
  loading: boolean;
  allSourcesById: Map<string, Source>;
  globalSourceNumberById: Map<string, number>;
  knownSourceIds: Set<string>;
  sourcesIndexReady: boolean;
  deletedSourceIds?: Set<string>;
  activeSourceId?: string | null;
  onSourceClick?: (source: Source) => void;
  discoverMode?: boolean;
  onExternalPaperClick?: (paper: ExternalPaper) => void;
  variant?: "workspace" | "reader";
  listTestId?: string;
};

export function ChatMessageList({
  messages,
  loading,
  allSourcesById,
  globalSourceNumberById,
  knownSourceIds,
  sourcesIndexReady,
  deletedSourceIds = new Set(),
  activeSourceId,
  onSourceClick,
  discoverMode = false,
  onExternalPaperClick,
  variant = "workspace",
  listTestId = "list-chat-messages",
}: ChatMessageListProps) {
  let globalSourceCounter = 0;
  const isReader = variant === "reader";

  return (
    <div className="space-y-6" data-testid={listTestId}>
      {messages.map((msg, idx) => {
        const isUser = msg.sender === "user";
        const isStreamingMessage = loading && !isUser && idx === messages.length - 1;
        return (
          <div
            key={idx}
            className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            data-testid={`row-message-${idx}`}
          >
            {isUser ? (
              (() => {
                const parsed = isReader ? parseReaderUserMessage(msg.text) : null;
                const question = parsed?.question ?? msg.text;
                const showChips = (parsed?.passages.length ?? 0) > 0;
                return (
                  <div
                    className={
                      isReader
                        ? "max-w-[92%] rounded-lg border border-border bg-secondary px-3 py-2"
                        : "max-w-[82%] rounded-xl border border-border bg-secondary px-4 py-3"
                    }
                    data-testid={`bubble-message-${idx}`}
                  >
                    {showChips ? <SentPassageChips passages={parsed!.passages} /> : null}
                    {question ? (
                      <div
                        className={`whitespace-pre-wrap break-words text-foreground/90 ${isReader ? "text-[13px] leading-relaxed" : "text-[14px] leading-6"}`}
                        data-testid={`text-user-message-${idx}`}
                      >
                        {question}
                      </div>
                    ) : null}
                    {!question && showChips ? (
                      <div className="sr-only" data-testid={`text-user-message-${idx}`}>
                        Asked about selected passage
                      </div>
                    ) : null}
                  </div>
                );
              })()
            ) : (
              <div className="w-full min-w-0" data-testid={`bubble-message-${idx}`}>
                <div className="min-w-0" data-testid={`content-message-${idx}`}>
                  <div className="w-full break-words">
                    <MarkdownRenderer
                      markdown={msg.raw ?? msg.text}
                      sources={msg.sources}
                      externalPapers={msg.externalPapers}
                      discoverMode={discoverMode || (msg.externalPapers?.length ?? 0) > 0}
                      allSourcesById={allSourcesById}
                      globalSourceNumberById={globalSourceNumberById}
                      deletedSourceIds={deletedSourceIds}
                      knownSourceIds={knownSourceIds}
                      sourcesIndexReady={sourcesIndexReady}
                      onSourceClick={onSourceClick}
                      onExternalPaperClick={onExternalPaperClick}
                    />
                  </div>

                  {!isReader && msg.highlightAction && (
                    <div className="flex items-center gap-1.5 mt-2 text-[12px] text-muted-foreground/70">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      Page {msg.highlightAction.page} · {msg.highlightAction.filename}
                    </div>
                  )}

                  {isReader && msg.sources && msg.sources.length > 0 && (() => {
                    const citationCtx = buildCitationTokenContext(msg.sources, {
                      allSourcesById,
                      globalSourceNumberById,
                      knownSourceIds,
                    });
                    const citedIds = new Set(
                      extractCitedSourceIds(msg.raw ?? msg.text, citationCtx),
                    );
                    const citedSources = msg.sources.filter((src) => citedIds.has(src.id));
                    if (citedSources.length === 0) return null;
                    return (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {citedSources.map((src, sIdx) => {
                        const num = globalSourceNumberById.get(src.id) ?? ++globalSourceCounter;
                        return (
                          <button
                            key={src.id ?? sIdx}
                            type="button"
                            onClick={() => onSourceClick?.(src)}
                            disabled={!onSourceClick}
                            className={`source-chip source-chip--num ${activeSourceId === src.id ? "source-chip--active" : ""} ${!onSourceClick ? "source-chip--static" : ""}`}
                            aria-label={`Citation ${num}`}
                          >
                            <span className="tabular-nums font-semibold">{num}</span>
                          </button>
                        );
                      })}
                    </div>
                    );
                  })()}

                  {isStreamingMessage && !(msg.raw ?? msg.text) && <DraftingIndicator />}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {loading && messages[messages.length - 1]?.sender !== "bot" && <DraftingIndicator />}
    </div>
  );
}

