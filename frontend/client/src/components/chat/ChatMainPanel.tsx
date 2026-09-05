import { useEffect, useRef } from "react";
import { Panel, PanelGroup, type ImperativePanelHandle } from "react-resizable-panels";
import { ChatSourcesPopover } from "@/components/ChatSourcesPopover";
import { DocumentSummaryView } from "@/components/DocumentSummaryView";
import type { ChatPageModel } from "@/hooks/useChatPage";
import { SITE_NAME } from "@/lib/siteMeta";
import { researchScopePlaceholder } from "@/lib/researchScope";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageList } from "./ChatMessageList";
import { PendingSourceChips } from "./PendingSourceChips";
import { ChatRightPanel } from "./ChatRightPanel";
import { ResearchScopePicker } from "./ResearchScopePicker";
import { MyLibraryPanel } from "./MyLibraryPanel";

type ChatMainPanelProps = {
  model: ChatPageModel;
};

const PANEL_SPLIT = {
  closed: { chat: 100, intel: 0 },
  list: { chat: 62, intel: 38 },
  preview: { chat: 42, intel: 58 },
} as const;

export function ChatMainPanel({ model }: ChatMainPanelProps) {
  const chatPanelRef = useRef<ImperativePanelHandle>(null);
  const intelPanelRef = useRef<ImperativePanelHandle>(null);

  const {
    showRightPanel,
    showPDF,
    activeChatId,
    leftPanelMode,
    exitSummaryView,
    activeSummaryTitle,
    activeChat,
    setShowRightPanel,
    openRightPanel,
    selectSourceForPreview,
    selectExternalPaperForPreview,
    documentSummary,
    summaryLoading,
    chatWindowRef,
    createNewChat,
    messages,
    allSourcesById,
    globalSourceNumberById,
    deletedSourceIds,
    knownSourceIds,
    sourcesIndexReady,
    loading,
    activeSource,
    pendingSourceRefs,
    setPendingSourceRefs,
    ingestedFiles,
    ingestedFilesLoading,
    uploadLoading,
    uploadMessage,
    selectedChatDocIds,
    toggleChatDocSelection,
    setSelectedChatDocIds,
    uploadPdfFiles,
    openReaderForFile,
    handleCite,
    handleSummarizeFile,
    handleDeleteIngestedFile,
    deletingFile,
    chatInputRef,
    input,
    setInput,
    handleInputKeyDown,
    handleSend,
    selectedChatDocs,
    canSend,
    researchScope,
    setResearchScope,
    sidebarView,
  } = model;

  const libraryView = sidebarView === "library";

  const discoverMode = researchScope === "discover";

  useEffect(() => {
    const chatPanel = chatPanelRef.current;
    const intelPanel = intelPanelRef.current;
    if (!chatPanel || !intelPanel) return;

    const target = !showRightPanel
      ? PANEL_SPLIT.closed
      : showPDF
        ? PANEL_SPLIT.preview
        : PANEL_SPLIT.list;

    chatPanel.resize(target.chat);
    intelPanel.resize(target.intel);
  }, [showRightPanel, showPDF, activeChatId]);

  return (
    <main className="flex-1 h-full overflow-hidden bg-background" aria-label="Research workspace">
      <h1 className="sr-only">{activeChat ? activeChat.title : `${SITE_NAME} research workspace`}</h1>
      <PanelGroup
        key={activeChatId ?? "workspace"}
        direction="horizontal"
        className="chat-panel-group h-full"
      >
        <Panel
          ref={chatPanelRef}
          id="chat-panel"
          order={1}
          defaultSize={100}
          minSize={30}
          className="panel-split-transition min-w-[320px]"
        >
          <div className="flex h-full min-h-0 flex-col">
            {/* Panel header */}
            <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
              {leftPanelMode === "summary" ? (
                <>
                  <button
                    type="button"
                    onClick={exitSummaryView}
                    className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    data-testid="button-summary-back-to-chat"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    Back
                  </button>
                  <div
                    className="min-w-0 flex-1 text-[13px] font-semibold text-foreground truncate text-center"
                    title={activeSummaryTitle || "Summary"}
                    data-testid="text-panel-title-chat"
                  >
                    {activeSummaryTitle || "Summary"}
                  </div>
                </>
              ) : libraryView ? (
                <div
                  className="min-w-0 flex-1 text-[13px] font-semibold tracking-tight truncate text-foreground/90"
                  data-testid="text-panel-title-chat"
                >
                  My Library
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[13px] font-semibold tracking-tight truncate text-foreground/90"
                    data-testid="text-panel-title-chat"
                  >
                    {activeChat ? activeChat.title : "Workspace"}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (showRightPanel) setShowRightPanel(false);
                  else openRightPanel("sources");
                }}
                disabled={libraryView}
                className={`icon-btn transition-all ${showRightPanel
                  ? "bg-primary/15 text-primary border border-primary/25"
                  : ""
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                title={libraryView ? "Sources panel unavailable in library view" : showRightPanel ? "Hide panel" : "Show sources panel"}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M15 3v18" />
                </svg>
              </button>
            </div>

            {leftPanelMode === "summary" ? (
              <DocumentSummaryView
                summary={documentSummary}
                isLoading={summaryLoading}
                onSourceClick={(src) => selectSourceForPreview(src, { showPdf: true })}
              />
            ) : libraryView ? (
              <MyLibraryPanel model={model} />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div
                  ref={chatWindowRef}
                  className="flex-1 overflow-y-auto rag-scrollbar"
                  data-testid="panel-chat-messages"
                >
                  <div className="mx-auto w-full max-w-2xl px-6 py-8">
                    {!activeChat ? (
                      <div className="flex h-full min-h-[60vh] items-center justify-center" data-testid="state-no-chat">
                        <div className="max-w-sm text-center">
                          <div className="text-[15px] font-semibold tracking-tight text-foreground">Welcome to {SITE_NAME}</div>
                          <div className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
                            Start a session, upload research papers, and ask questions grounded in your documents.
                          </div>
                          <button
                            type="button"
                            onClick={createNewChat}
                            className="mt-5 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold hover:brightness-95 transition-all"
                          >
                            New session
                          </button>
                        </div>
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex h-full min-h-[60vh] items-center justify-center" data-testid="state-chat-empty">
                        <div className="max-w-sm text-center">
                          <div className="text-[15px] font-semibold tracking-tight text-foreground" data-testid="text-empty-title">
                            {discoverMode ? "Discover papers on the web" : "Query your library"}
                          </div>
                          <div className="mt-2 text-[13px] text-muted-foreground leading-relaxed" data-testid="text-empty-subtitle">
                            {discoverMode
                              ? "Describe a topic, author, or question — we'll search open literature, not your uploads."
                              : "Upload PDFs with the + button, select which papers to include, and get cited answers."}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <ChatMessageList
                        messages={messages}
                        loading={loading}
                        allSourcesById={allSourcesById}
                        globalSourceNumberById={globalSourceNumberById}
                        knownSourceIds={knownSourceIds}
                        sourcesIndexReady={sourcesIndexReady}
                        deletedSourceIds={deletedSourceIds}
                        activeSourceId={activeSource?.id}
                        onSourceClick={(src) => selectSourceForPreview(src, { showPdf: true })}
                        discoverMode={discoverMode}
                        onExternalPaperClick={selectExternalPaperForPreview}
                        variant="workspace"
                      />
                    )}
                  </div>
                </div>

                {activeChat && (
                  <div className="mx-auto w-full max-w-2xl shrink-0 px-6 pb-4">
                    {!discoverMode && (
                      <PendingSourceChips
                        sources={pendingSourceRefs}
                        onRemove={(i) => setPendingSourceRefs((prev) => prev.filter((_, j) => j !== i))}
                      />
                    )}
                    <ChatComposer
                      inputRef={chatInputRef}
                      value={input}
                      onChange={setInput}
                      onKeyDown={handleInputKeyDown}
                      onSend={handleSend}
                      loading={loading}
                      canSend={canSend}
                      composerClassName={discoverMode ? "rag-composer-bar--discover" : undefined}
                      placeholder={researchScopePlaceholder(researchScope, {
                        pendingCitations: pendingSourceRefs.length,
                        selectedDocCount: selectedChatDocs.length,
                        singleDocName: selectedChatDocs[0]?.filename,
                      })}
                      lead={
                        !discoverMode ? (
                          <ChatSourcesPopover
                            disabled={loading}
                            files={ingestedFiles}
                            filesLoading={ingestedFilesLoading}
                            uploadLoading={uploadLoading}
                            uploadMessage={uploadMessage}
                            selectedDocIds={selectedChatDocIds}
                            onToggleDoc={toggleChatDocSelection}
                            onClearSelection={() => setSelectedChatDocIds([])}
                            onUploadFiles={uploadPdfFiles}
                            onOpenReader={openReaderForFile}
                            onSummarize={handleSummarizeFile}
                            onCite={handleCite}
                            onDelete={handleDeleteIngestedFile}
                            deletingFilename={deletingFile}
                            triggerClassName="h-8 w-8 rounded-md border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
                          />
                        ) : undefined
                      }
                      insetFooter={
                        <ResearchScopePicker
                          scope={researchScope}
                          onScopeChange={setResearchScope}
                          disabled={loading}
                        />
                      }
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </Panel>

        <ChatRightPanel model={model} intelPanelRef={intelPanelRef} />
      </PanelGroup>
    </main>
  );
}
