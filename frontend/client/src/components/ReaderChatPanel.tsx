import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSessionChat } from "@/hooks/useSessionChat";
import { buildConversationSourceIndex, appendPendingChatSource, type Source } from "@/lib/chatMessages";
import { SummaryPanel } from "@/components/SummaryPanel";
import { scrollChatToBottom } from "@/lib/chatScroll";
import { sourceJumpTarget } from "@/lib/sourceHighlight";
import { getDocDisplayName, shouldConfirmCrossDocSource } from "@/lib/sourceDoc";
import type { IngestedFile } from "@/lib/ingestedFile";
import type { PdfBbox } from "@/lib/pdfHighlightLayout";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { PendingPassageChips, PendingSourceChips } from "@/components/chat/PendingSourceChips";
import {
  buildReaderQuestionFromPassages,
  isDuplicatePassage,
  MAX_READER_PASSAGES,
  type ReaderPassageSelection,
} from "@/lib/readerPassageSelection";

type CrossDocSourceNotice = {
  id: number;
  source: Source;
  docName: string;
  page: number;
};

type ReaderChatPanelProps = {
  sessionId: string;
  currentDocId: string;
  currentDocName: string;
  ingestedFiles: IngestedFile[];
  pendingSelection?: ReaderPassageSelection | null;
  onPendingSelectionHandled?: () => void;
  onJumpToPage?: (
    page: number,
    bboxes?: PdfBbox[] | [number, number, number, number][],
    options?: { highlightMs?: number },
  ) => void;
};

export function ReaderChatPanel({
  sessionId,
  currentDocId,
  currentDocName,
  ingestedFiles,
  pendingSelection,
  onPendingSelectionHandled,
  onJumpToPage,
}: ReaderChatPanelProps) {
  const summaryDefaults = useMemo(
    () => ({ filename: currentDocName, doc_id: currentDocId }),
    [currentDocName, currentDocId],
  );
  const { messages, loading, conversationLoading, loadError, documentSummary, sendMessage, closeSummary } =
    useSessionChat(sessionId, summaryDefaults);

  const [crossDocNotice, setCrossDocNotice] = useState<CrossDocSourceNotice | null>(null);
  const [input, setInput] = useState("");
  const [pendingPassages, setPendingPassages] = useState<ReaderPassageSelection[]>([]);
  const [pendingSourceRefs, setPendingSourceRefs] = useState<Source[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const crossDocNoticeIdRef = useRef(0);
  const { knownSourceIds, allSourcesById, globalSourceNumberById } = useMemo(
    () => buildConversationSourceIndex(messages),
    [messages],
  );

  const handleSourceClick = useCallback(
    (source: Source) => {
      const target = sourceJumpTarget(source);

      if (shouldConfirmCrossDocSource(source, currentDocId, currentDocName, ingestedFiles)) {
        crossDocNoticeIdRef.current += 1;
        setCrossDocNotice({
          id: crossDocNoticeIdRef.current,
          source,
          docName: getDocDisplayName(source),
          page: target.page,
        });
        return;
      }

      onJumpToPage?.(target.page, target.bboxes);
    },
    [currentDocId, currentDocName, ingestedFiles, onJumpToPage],
  );

  const dismissCrossDocNotice = useCallback(() => {
    setCrossDocNotice(null);
  }, []);

  useEffect(() => {
    scrollChatToBottom(scrollRef.current, 0);
  }, [messages, loading]);

  useEffect(() => {
    if (!pendingSelection) return;
    setPendingPassages((prev) => {
      if (isDuplicatePassage(prev, pendingSelection)) return prev;
      if (prev.length >= MAX_READER_PASSAGES) return prev;
      return [...prev, pendingSelection];
    });
    onPendingSelectionHandled?.();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [pendingSelection, onPendingSelectionHandled]);

  const canSend =
    !loading &&
    (!!input.trim() || pendingSourceRefs.length > 0 || pendingPassages.length > 0);

  const handleSend = async () => {
    if (!canSend) return;
    const text = buildReaderQuestionFromPassages(input, pendingPassages);
    const sourceIds = pendingSourceRefs.map((s) => s.id).filter(Boolean);
    setInput("");
    setPendingPassages([]);
    setPendingSourceRefs([]);
    await sendMessage(text, sourceIds);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && canSend) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleLocatePassage = useCallback(
    (id: string) => {
      const passage = pendingPassages.find((p) => p.id === id);
      if (!passage || !onJumpToPage) return;
      onJumpToPage(passage.page, passage.bboxes);
    },
    [pendingPassages, onJumpToPage],
  );

  const handleAttachSummarySource = useCallback(
    (source: Source) => {
      setPendingSourceRefs((prev) => appendPendingChatSource(prev, source));
      inputRef.current?.focus();
    },
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-card">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="text-sm font-semibold text-foreground">Document query</div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto rag-scrollbar p-3">
        {loadError && (
          <p className="py-4 text-center text-xs text-destructive">{loadError}</p>
        )}
        {conversationLoading && messages.length === 0 && !loadError && (
          <p className="py-8 text-center text-xs text-muted-foreground">Loading conversation…</p>
        )}
        {messages.length === 0 && !loadError && !conversationLoading && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Ask about this document while you read.
          </p>
        )}
        {messages.length > 0 && (
          <ChatMessageList
            messages={messages}
            loading={loading}
            allSourcesById={allSourcesById}
            globalSourceNumberById={globalSourceNumberById}
            knownSourceIds={knownSourceIds}
            sourcesIndexReady={messages.length > 0}
            onSourceClick={handleSourceClick}
            variant="reader"
            listTestId="list-reader-chat-messages"
          />
        )}

        {documentSummary && (
          <div className="mt-3">
            <SummaryPanel
              summary={documentSummary}
              isLoading={false}
              onClose={closeSummary}
              onSourceClick={handleSourceClick}
              onAttachSourceForChat={handleAttachSummarySource}
            />
          </div>
        )}
      </div>

      <div className="shrink-0 px-3 pb-3">
        <PendingPassageChips
          passages={pendingPassages}
          onLocate={onJumpToPage ? handleLocatePassage : undefined}
          onRemove={(id) => setPendingPassages((prev) => prev.filter((p) => p.id !== id))}
        />
        <PendingSourceChips
          sources={pendingSourceRefs}
          onRemove={(i) => setPendingSourceRefs((prev) => prev.filter((_, j) => j !== i))}
        />
        <ChatComposer
          inputRef={inputRef}
          value={input}
          onChange={setInput}
          onKeyDown={handleInputKeyDown}
          onSend={() => void handleSend()}
          loading={loading}
          canSend={canSend}
          placeholder={
            pendingPassages.length > 0 || pendingSourceRefs.length > 0
              ? pendingPassages.length > 1
                ? "Ask about the selected passages…"
                : "Ask about the selected passage…"
              : "Ask about this document…"
          }
          testIdInput="input-reader-chat-message"
          testIdSubmit="button-reader-chat-submit"
        />
      </div>

      {crossDocNotice &&
        createPortal(
          <div
            key={crossDocNotice.id}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
            onMouseDown={(e) => {
              if (e.target !== e.currentTarget) return;
              e.preventDefault();
              dismissCrossDocNotice();
            }}
            role="presentation"
            data-testid="reader-cross-doc-notice-backdrop"
          >
            <div
              role="dialog"
              aria-labelledby="reader-cross-doc-notice-title"
              aria-describedby="reader-cross-doc-notice-description"
              className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
              onMouseDown={(e) => e.stopPropagation()}
              data-testid="reader-cross-doc-notice-dialog"
            >
              <h3 id="reader-cross-doc-notice-title" className="text-[15px] font-semibold text-foreground">
                Source in another file
              </h3>
              <p
                id="reader-cross-doc-notice-description"
                className="mt-2 text-[13px] text-muted-foreground leading-relaxed"
              >
                This source is in{" "}
                <span className="font-medium text-foreground break-all">{crossDocNotice.docName}</span>
                {crossDocNotice.page > 0 ? ` (page ${crossDocNotice.page})` : ""}, not the document you are
                reading now.
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissCrossDocNotice();
                  }}
                  className="rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:brightness-95 transition-colors"
                  data-testid="button-reader-cross-doc-dismiss"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
