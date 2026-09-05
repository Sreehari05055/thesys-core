import type { RefObject } from "react";
import { Panel, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { ExternalPaperPanel } from "@/components/ExternalPaperPanel";
import { PDFViewer } from "@/components/PDFViewer";
import { SummariesLogTab } from "@/components/SummariesLogTab";
import type { ChatPageModel } from "@/hooks/useChatPage";
import { cn } from "@/lib/utils";

type ChatRightPanelProps = {
  model: ChatPageModel;
  intelPanelRef: RefObject<ImperativePanelHandle | null>;
};

function SourceHighlightModeToggle({
  precise,
  onChange,
}: {
  precise: boolean;
  onChange: (precise: boolean) => void;
}) {
  return (
    <div
      className="flex h-7 shrink-0 items-center rounded-md border border-border bg-muted p-0.5"
      role="group"
      aria-label="Highlight mode"
    >
      <button
        type="button"
        title="Full retrieved chunk"
        onClick={() => onChange(false)}
        className={cn(
          "rounded px-2 py-1 text-[10px] font-medium transition-colors",
          !precise
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={!precise}
      >
        Full
      </button>
      <button
        type="button"
        title="Focused citation"
        onClick={() => onChange(true)}
        className={cn(
          "rounded px-2 py-1 text-[10px] font-medium transition-colors",
          precise
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={precise}
      >
        Focused
      </button>
    </div>
  );
}

export function ChatRightPanel({ model, intelPanelRef }: ChatRightPanelProps) {
  const {
    showRightPanel,
    rightPanelTab,
    setRightPanelTab,
    setShowRightPanel,
    messages,
    leftPanelMode,
    documentSummary,
    showPDF,
    activeSource,
    selectSourceForPreview,
    getDocDisplayName,
    attachSourceForChat,
    openReaderForSource,
    activeChat,
    getDocId,
    activeSessionId,
    summariesRefreshKey,
    activeSummaryId,
    loadSavedSummary,
    loadingSavedSummaryId,
    activeExternalPaper,
    setActiveExternalPaper,
    addingExternalPaperId,
    openExternalPaperLink,
    addExternalPaperToLibrary,
    panelSources,
    globalSourceNumberById,
    usePreciseSourceHighlight,
    setUsePreciseSourceHighlight,
  } = model;

  const panelHidden = !showRightPanel;
  const viewingSummary = leftPanelMode === "summary";
  const showExternalPaper = activeExternalPaper != null && !viewingSummary;
  const sidebarSources = viewingSummary ? (documentSummary?.sources ?? []) : panelSources;
  const pdfPreview = showPDF && activeSource != null && !showExternalPaper;
  const activePreviewBboxes = usePreciseSourceHighlight
    ? activeSource?.precise_bboxes
    : activeSource?.bboxes;

  return (
    <>
      <PanelResizeHandle
        className={cn("panel-resize-handle", panelHidden && "panel-resize-handle--hidden")}
      />
      <Panel
        ref={intelPanelRef}
        id="intel-panel"
        order={2}
        defaultSize={0}
        minSize={0}
        collapsible
        collapsedSize={0}
        className="panel-split-transition min-w-0 overflow-hidden"
      >
        <aside
          aria-label={showExternalPaper ? "External paper" : "Sources and summaries"}
          className="flex h-full flex-col bg-card"
        >
          {showExternalPaper ? (
            <>
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
                <span className="text-[13px] font-semibold text-foreground">Paper link</span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveExternalPaper(null);
                    setShowRightPanel(false);
                  }}
                  className="icon-btn"
                  title="Close"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <ExternalPaperPanel
                sessionId={activeSessionId ?? activeChat?.sessionId ?? ""}
                paper={activeExternalPaper}
                addingToLibrary={addingExternalPaperId === activeExternalPaper.id}
                onOpenLink={() => openExternalPaperLink(activeExternalPaper)}
                onAddToLibrary={
                  activeExternalPaper.pdf_verified
                    ? () => addExternalPaperToLibrary(activeExternalPaper)
                    : undefined
                }
              />
            </>
          ) : (
            <>
          {!pdfPreview && (
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
            <div className="flex items-center gap-0.5">
              {(["sources", "summaries"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setRightPanelTab(tab)}
                  className={`tab-bar-item ${rightPanelTab === tab ? "tab-bar-item--active" : ""}`}
                >
                  {tab === "sources" && "Sources"}
                  {tab === "summaries" && "Summaries"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowRightPanel(false)}
              className="icon-btn"
              title="Close panel"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          )}

          <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
            {rightPanelTab === "sources" && (
              <>
                {!showPDF && sidebarSources.length > 0 ? (
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 rag-scrollbar">
                    <div className="sidebar-section-label py-2 px-1">
                      {viewingSummary ? "Summary Sources" : "Document Sources"}
                    </div>
                    {sidebarSources.map((src, index) => {
                              const currentId = globalSourceNumberById.get(src.id) ?? index + 1;
                              return (
                                <div key={src.id || `source-${currentId}`} className="group rounded-lg border border-border bg-secondary overflow-hidden transition-colors hover:bg-accent hover:border-border">
                                  <button
                                    type="button"
                                    className="w-full text-left p-3"
                                    onClick={() => selectSourceForPreview(src, { showPdf: true })}
                                  >
                                    <div className="flex items-center gap-2.5 mb-2">
                                      <div className="h-7 w-7 rounded-md bg-primary/12 flex items-center justify-center text-primary font-bold text-[11px] shrink-0 group-hover:bg-primary/20 transition-colors">
                                        {currentId}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="text-[13px] font-semibold text-foreground truncate">{getDocDisplayName(src)}</div>
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                          {src.pages && src.pages.length > 0
                                            ? (src.pages.length > 1 ? `Pages ${src.pages.join(", ")}` : `Page ${src.pages[0]}`)
                                            : "No page info"}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-[12px] text-muted-foreground line-clamp-3 leading-relaxed">{src.content}</div>
                                  </button>
                                  <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5 pt-1 border-t border-border">
                                    <button
                                      type="button"
                                      title={
                                        src.pages && src.pages.length > 0
                                          ? `Open page ${src.pages[0]} in reader`
                                          : "Open in reader"
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openReaderForSource(src);
                                      }}
                                      className="flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-muted text-foreground/80 hover:bg-accent hover:text-foreground text-[11px] font-medium transition-colors"
                                      data-testid={`button-open-source-in-reader-list-${currentId}`}
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                                      </svg>
                                      Open in reader
                                    </button>
                                    <button
                                      type="button"
                                      title="Ask about this source"
                                      onClick={(e) => { e.stopPropagation(); attachSourceForChat(src); }}
                                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/12 hover:bg-primary/22 text-primary text-[11px] font-medium transition-colors"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                                      Ask about this
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                  </div>
                ) : activeSource && showPDF ? (
                  <div className="flex min-h-0 flex-1 flex-col bg-background">
                    {/* PDF viewer header */}
                    <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-card px-3">
                      <button
                        type="button"
                        onClick={() => model.setShowPDF(false)}
                        className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                        Back to sources
                      </button>

                      <div className="mx-2 flex min-w-0 items-center gap-1.5">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="text-[11px] text-muted-foreground truncate">{activeSource ? getDocDisplayName(activeSource) : ""}</span>
                        {activeSource.pages && activeSource.pages.length > 0 && (
                          <span className="text-[10px] text-muted-foreground/60 shrink-0">
                            {activeSource.pages.length > 1 ? `pp.${activeSource.pages.join(",")}` : `p.${activeSource.pages[0]}`}
                          </span>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <SourceHighlightModeToggle
                          precise={usePreciseSourceHighlight}
                          onChange={setUsePreciseSourceHighlight}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!activeSource) return;
                            openReaderForSource(activeSource);
                          }}
                          className="shrink-0 h-7 px-2.5 rounded-md border border-border bg-muted text-foreground/80 hover:bg-accent hover:text-foreground transition-colors flex items-center gap-1 text-[11px] font-medium"
                          title={
                            activeSource.pages && activeSource.pages.length > 0
                              ? `Open page ${activeSource.pages[0]} in reader`
                              : "Open in reader"
                          }
                          data-testid="button-open-source-in-reader"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                          </svg>
                          Open in reader
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!activeSource) return;
                            attachSourceForChat(activeSource);
                          }}
                          className="shrink-0 h-7 px-2.5 rounded-md bg-primary/12 border border-primary/25 text-primary hover:bg-primary/22 transition-colors flex items-center gap-1 text-[11px] font-medium"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                          Ask
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowRightPanel(false)}
                          className="icon-btn h-7 w-7 shrink-0"
                          title="Close panel"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1">
                    <PDFViewer
                      key={`${activeSource.id}-${usePreciseSourceHighlight ? "focused" : "full"}`}
                      sessionId={activeChat?.sessionId ?? ""}
                      docId={getDocId(activeSource)}
                      pages={activeSource.pages || []}
                      bboxes={activePreviewBboxes}
                    />
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-muted-foreground/30">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="8" y1="13" x2="16" y2="13" />
                      <line x1="8" y1="17" x2="13" y2="17" />
                    </svg>
                    <div className="text-[13px] font-medium text-muted-foreground">No source selected</div>
                    <div className="text-[12px] text-muted-foreground/60 mt-1 leading-relaxed">
                      {viewingSummary
                        ? "Click a citation in the summary to preview it here"
                        : sidebarSources.length === 0
                          ? "Cited sources will appear here as the assistant responds"
                          : "Click a citation in the chat to preview it here"}
                    </div>
                  </div>
                )}
              </>
            )}


            {rightPanelTab === "summaries" && activeSessionId && (
              <SummariesLogTab
                sessionId={activeSessionId}
                refreshKey={summariesRefreshKey}
                activeSummaryId={activeSummaryId}
                onSelect={loadSavedSummary}
                loadingDetailId={loadingSavedSummaryId}
              />
            )}
          </div>
            </>
          )}
        </aside>
      </Panel>
    </>
  );
}
