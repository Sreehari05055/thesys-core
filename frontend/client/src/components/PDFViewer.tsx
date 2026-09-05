import { useEffect, useMemo, useRef, useState } from "react";
import "@/styles/reader-pdf-text-layer.css";
import "@/styles/reader-pdf-highlights.css";
import { pdfjs } from "@/lib/pdfjsSetup";
import { attachPdfTextLayerSelection } from "@/lib/pdfTextLayerSelection";
import { trimPdfTextLayerEOLWhitespace } from "@/lib/pdfTextLayerEOLTrim";
import { bboxesToCanvasRects, pdfPageDimensions, type CanvasRect } from "@/lib/pdfHighlightLayout";
import { API_URLS } from "../config";
import { apiFetch } from "../lib/apiFetch";
import { getApiErrorMessage } from "../lib/apiErrors";

interface BBox {
  box: [number, number, number, number];
  page: number;
  page_width?: number;
  page_height?: number;
  page_rotation?: number;
}

interface PDFViewerProps {
  sessionId: string;
  docId: string;
  pages: number[];
  bboxes?: BBox[];
}

const DEFAULT_SCALE = 1.2;

function scrollToHighlightRegion(
  scrollContainer: HTMLDivElement,
  pageWrapper: HTMLElement,
  minTop: number,
  maxBottom: number,
) {
  const wrapperTop = pageWrapper.offsetTop;
  const regionTop = wrapperTop + minTop;
  const regionHeight = Math.max(maxBottom - minTop, 1);
  const regionCenter = regionTop + regionHeight / 2;
  const viewportHeight = scrollContainer.clientHeight;
  const idealScroll = regionCenter - viewportHeight / 2;

  scrollContainer.scrollTo({ top: Math.max(0, idealScroll), behavior: "smooth" });
}

function scrollPageToCenter(
  scrollContainer: HTMLDivElement,
  pageWrapper: HTMLElement,
) {
  const viewportHeight = scrollContainer.clientHeight;
  const pageHeight = pageWrapper.offsetHeight;
  const wrapperTop = pageWrapper.offsetTop;
  const pageCenter = wrapperTop + pageHeight / 2;
  const idealScroll = pageCenter - viewportHeight / 2;

  scrollContainer.scrollTo({ top: Math.max(0, idealScroll), behavior: "smooth" });
}

export function PDFViewer({ sessionId, docId, pages, bboxes }: PDFViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageWrapperRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textLayerTaskRef = useRef<pdfjs.TextLayer | null>(null);
  const selectionCleanupRef = useRef<(() => void) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [highlightRects, setHighlightRects] = useState<CanvasRect[]>([]);

  const hasPages = Boolean(pages?.length);
  const currentPage = hasPages ? (pages[currentPageIndex] ?? pages[0]!) : 0;

  const currentBboxes = useMemo(() => {
    if (!bboxes?.length || !hasPages) return [];
    return bboxes.filter((b) => b.page === currentPage);
  }, [bboxes, currentPage, hasPages]);

  const bboxesKey = useMemo(() => {
    if (!currentBboxes.length) return "empty";
    return currentBboxes.map((b) => b.box?.join(",")).join("|");
  }, [currentBboxes]);

  const sourceBboxesKey = useMemo(
    () => bboxes?.map((b) => `${b.page}:${b.box.join(",")}`).join("|") ?? "",
    [bboxes],
  );

  useEffect(() => {
    const pageList = pages.filter((p) => p > 0);
    if (bboxes?.length && pageList.length > 0) {
      const bboxPages = new Set(bboxes.map((b) => b.page));
      const idx = pageList.findIndex((p) => bboxPages.has(p));
      setCurrentPageIndex(idx >= 0 ? idx : 0);
    } else {
      setCurrentPageIndex(0);
    }
  }, [docId, pages?.join(","), sourceBboxesKey]);

  useEffect(() => {
    let isMounted = true;
    let pdfDoc: pdfjs.PDFDocumentProxy | null = null;

    async function loadPage() {
      if (!hasPages || !sessionId || !docId || !currentPage) return;

      setLoading(true);
      setError(null);
      setHighlightRects([]);

      try {
        const res = await apiFetch(API_URLS.sessionFile(docId), {}, sessionId);
        if (!res.ok) {
          const message = await getApiErrorMessage(res);
          throw new Error(message || `HTTP ${res.status}`);
        }
        const arrayBuffer = await res.arrayBuffer();

        pdfDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise;

        if (!isMounted) {
          pdfDoc.destroy();
          return;
        }

        const targetPageNumber = Math.min(Math.max(currentPage, 1), pdfDoc.numPages);
        const page = await pdfDoc.getPage(targetPageNumber);
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        const textLayerEl = textLayerRef.current;
        const pageWrapper = pageWrapperRef.current;
        if (!canvas || !textLayerEl) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        const cssWidth = Math.floor(viewport.width);
        const cssHeight = Math.floor(viewport.height);
        canvas.width = cssWidth;
        canvas.height = cssHeight;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        if (pageWrapper) {
          pageWrapper.style.width = `${cssWidth}px`;
          pageWrapper.style.height = `${cssHeight}px`;
          pageWrapper.style.setProperty("--scale-factor", String(viewport.scale));
        }

        await page.render({ canvasContext: context, viewport }).promise;

        selectionCleanupRef.current?.();
        textLayerTaskRef.current?.cancel();
        textLayerEl.replaceChildren();

        pdfjs.setLayerDimensions(textLayerEl, viewport);
        const textLayer = new pdfjs.TextLayer({
          textContentSource: page.streamTextContent({
            includeMarkedContent: true,
            disableNormalization: true,
          }),
          container: textLayerEl,
          viewport,
        });
        textLayerTaskRef.current = textLayer;
        await textLayer.render();
        trimPdfTextLayerEOLWhitespace(textLayerEl);
        selectionCleanupRef.current = attachPdfTextLayerSelection(textLayerEl);

        const { width: pdfPageWidth, height: pdfPageHeight } = pdfPageDimensions(page.view as number[]);
        const rects =
          currentBboxes.length > 0
            ? bboxesToCanvasRects(
                currentBboxes.map(({ box, page_width, page_height }) => ({
                  box,
                  page_width,
                  page_height,
                })),
                cssWidth,
                cssHeight,
                pdfPageWidth,
                pdfPageHeight,
                page,
                scale,
                pageWrapper,
              )
            : [];

        if (isMounted) {
          setHighlightRects(rects);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error loading PDF page:", err);
        if (isMounted) {
          setError("Failed to load PDF page. Document might not exist or backend is unreachable.");
          setHighlightRects([]);
          setLoading(false);
        }
      }
    }

    loadPage();

    return () => {
      isMounted = false;
      selectionCleanupRef.current?.();
      selectionCleanupRef.current = null;
      textLayerTaskRef.current?.cancel();
      textLayerTaskRef.current = null;
      pdfDoc?.destroy();
    };
  }, [sessionId, docId, currentPage, scale, hasPages, bboxesKey]);

  useEffect(() => {
    if (!overlayRef.current) return;
    overlayRef.current.innerHTML = "";

    let minTop = Infinity;
    let maxBottom = -Infinity;

    for (const { left, top, width, height } of highlightRects) {
      minTop = Math.min(minTop, top);
      maxBottom = Math.max(maxBottom, top + height);

      const highlight = document.createElement("div");
      highlight.className = "pdf-highlight-overlay";
      highlight.dataset.sourceHighlight = "true";
      highlight.style.position = "absolute";
      highlight.style.left = `${left}px`;
      highlight.style.top = `${top}px`;
      highlight.style.width = `${width}px`;
      highlight.style.height = `${height}px`;
      overlayRef.current.appendChild(highlight);
    }

    const scrollContainer = scrollContainerRef.current;
    const pageWrapper = pageWrapperRef.current;
    if (scrollContainer && pageWrapper && !loading) {
      window.requestAnimationFrame(() => {
        if (Number.isFinite(minTop)) {
          scrollToHighlightRegion(scrollContainer, pageWrapper, minTop, maxBottom);
        } else {
          scrollPageToCenter(scrollContainer, pageWrapper);
        }
      });
    }
  }, [highlightRects, loading]);

  if (!hasPages) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-xs rounded-2xl border border-white/5 bg-black/60 p-6 backdrop-blur-md">
          <div className="text-sm text-white/60">No PDF preview available for this source</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden bg-black/5">
      <div className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-xl border border-white/10 bg-black/60 p-1 shadow-2xl backdrop-blur-md">
        <button
          onClick={() => setScale((s) => Math.max(s - 0.25, 0.5))}
          className="flex h-8 w-8 items-center justify-center rounded-lg font-bold text-white/80 transition-all hover:bg-white/10"
          title="Zoom Out"
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14" />
          </svg>
        </button>
        <div className="w-12 px-2 text-center text-[10px] font-bold uppercase tracking-tighter text-white/40">
          {Math.round(scale * 100)}%
        </div>
        <button
          onClick={() => setScale((s) => Math.min(s + 0.25, 3))}
          className="flex h-8 w-8 items-center justify-center rounded-lg font-bold text-white/80 transition-all hover:bg-white/10"
          title="Zoom In"
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <div className="mx-1 h-4 w-px bg-white/10" />
        <button
          onClick={() => setScale(DEFAULT_SCALE)}
          className="flex h-8 items-center justify-center rounded-lg px-2 text-[10px] font-bold uppercase tracking-wider text-white/80 hover:bg-white/10"
          title="Reset Zoom"
          type="button"
        >
          Reset
        </button>
      </div>

      <div className="rag-scrollbar min-h-0 flex-1 overflow-auto p-6" ref={scrollContainerRef}>
        <div className="flex min-h-full min-w-full w-max items-center justify-center">
          <div
            ref={pageWrapperRef}
            className="reader-pdf-page relative inline-block shrink-0 border border-black/20 bg-white shadow-2xl"
          >
            <canvas ref={canvasRef} className="pointer-events-none block" />
            <div ref={overlayRef} className="pdf-highlight-layer" aria-hidden />
            <div ref={textLayerRef} className="textLayer" />
          </div>
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/50">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/40 border-t-primary" />
            <span className="text-xs font-medium text-white/60">Loading page…</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/50 p-8 text-center">
          <div className="max-w-xs rounded-2xl border border-white/5 bg-black/60 p-6 backdrop-blur-md">
            <div className="mb-1 font-medium text-red-400">Preview Offline</div>
            <div className="text-[10px] text-white/50">{error}</div>
          </div>
        </div>
      )}

      {pages.length > 1 && (
        <div className="flex items-center justify-center gap-2 border-t border-white/10 bg-black/40 px-4 py-2 backdrop-blur-md">
          <button
            onClick={() => setCurrentPageIndex((i) => Math.max(i - 1, 0))}
            disabled={currentPageIndex === 0}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/70 transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            title="Previous page"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <div className="flex items-center gap-1">
            {pages.map((page, idx) => (
              <button
                key={page}
                onClick={() => setCurrentPageIndex(idx)}
                className={`h-7 min-w-[28px] rounded-lg px-1.5 text-[11px] font-semibold transition-all ${
                  idx === currentPageIndex
                    ? "bg-primary text-primary-foreground shadow-[0_0_8px_rgba(var(--primary),0.3)]"
                    : "text-white/50 hover:bg-white/10 hover:text-white/80"
                }`}
                title={`Go to page ${page}`}
                type="button"
              >
                {page}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCurrentPageIndex((i) => Math.min(i + 1, pages.length - 1))}
            disabled={currentPageIndex === pages.length - 1}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/70 transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            title="Next page"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

          <div className="ml-1 text-[10px] text-white/40">
            Page {currentPage} of {pages.length}
          </div>
        </div>
      )}
    </div>
  );
}
