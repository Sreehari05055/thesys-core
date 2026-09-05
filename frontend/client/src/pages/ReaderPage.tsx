import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { PageHead } from "@/components/PageHead";
import { ReaderDocumentViewer, type ReaderDocumentViewerHandle } from "@/components/ReaderDocumentViewer";
import { ReaderChatPanel } from "@/components/ReaderChatPanel";
import { fetchSessionIngestedFiles, type IngestedFile } from "@/lib/ingestedFile";
import { peekReaderHighlight } from "@/lib/readerHighlightStorage";
import type { ReaderPassageSelection } from "@/lib/readerPassageSelection";

export function ReaderPage() {
  const [selectionAskPassage, setSelectionAskPassage] = useState<ReaderPassageSelection | null>(null);
  const [ingestedFiles, setIngestedFiles] = useState<IngestedFile[]>([]);
  const documentViewerRef = useRef<ReaderDocumentViewerHandle>(null);
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session")?.trim() ?? "";
  const docId = params.get("doc")?.trim() ?? "";
  const displayName = params.get("name")?.trim() ?? "";
  const initialPageRaw = params.get("page")?.trim();
  const initialPageParsed = initialPageRaw ? Number.parseInt(initialPageRaw, 10) : NaN;
  const initialHighlight = useMemo(
    () => (sessionId && docId ? peekReaderHighlight(sessionId, docId) : null),
    [sessionId, docId],
  );
  const initialPageFromUrl =
    Number.isFinite(initialPageParsed) && initialPageParsed > 0 ? initialPageParsed : undefined;
  const initialPage = initialPageFromUrl ?? initialHighlight?.page;
  const readerTitle = displayName || "Document reader";

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    (async () => {
      try {
        const files = await fetchSessionIngestedFiles(sessionId);
        if (!cancelled) setIngestedFiles(files);
      } catch {
        // Best-effort — source doc ids may still be on the source payload.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!sessionId || !docId) {
    return (
      <>
        <PageHead title="Reader" noIndex />
        <main className="rag-panel flex h-screen flex-col items-center justify-center gap-4 p-8">
          <h1 className="sr-only">Document reader</h1>
          <p className="text-sm text-white/60">Missing session or document.</p>
          <Link
            href="/"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Back to workspace
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHead title={readerTitle} noIndex />
      <div className="rag-panel flex h-screen w-full flex-col overflow-hidden" data-testid="page-reader">
        <header className="flex shrink-0 border-b border-white/10 px-4 py-2">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition">
            ← Back to workspace
          </Link>
        </header>

        <main className="min-h-0 flex-1">
          <h1 className="sr-only">{readerTitle}</h1>
          <PanelGroup direction="horizontal" className="h-full">
            <Panel id="reader-pdf" defaultSize={72} minSize={45}>
              <ReaderDocumentViewer
                ref={documentViewerRef}
                sessionId={sessionId}
                docId={docId}
                displayName={displayName || undefined}
                initialPage={initialPage}
                initialHighlight={initialHighlight ?? undefined}
                onAskSelection={setSelectionAskPassage}
              />
            </Panel>
            <PanelResizeHandle className="w-1.5 bg-white/10 hover:bg-primary/40 transition-colors" />
            <Panel id="reader-chat" defaultSize={28} minSize={22} maxSize={40}>
              <ReaderChatPanel
                sessionId={sessionId}
                currentDocId={docId}
                currentDocName={displayName || docId}
                ingestedFiles={ingestedFiles}
                pendingSelection={selectionAskPassage}
                onPendingSelectionHandled={() => setSelectionAskPassage(null)}
                onJumpToPage={(page, bboxes, options) => {
                  documentViewerRef.current?.jumpToPage(page, bboxes, options);
                }}
              />
            </Panel>
          </PanelGroup>
        </main>
      </div>
    </>
  );
}
