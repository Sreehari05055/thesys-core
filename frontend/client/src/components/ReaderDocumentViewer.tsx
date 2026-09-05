import {
  useCallback,
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import "@/styles/reader-pdf-text-layer.css";
import "@/styles/reader-pdf-highlights.css";
import { pdfjs } from "@/lib/pdfjsSetup";
import { API_URLS } from "@/config";
import { attachPdfTextLayerSelection } from "@/lib/pdfTextLayerSelection";
import { trimPdfTextLayerEOLWhitespace } from "@/lib/pdfTextLayerEOLTrim";
import { capturePassageFromSelection, type ReaderPassageSelection } from "@/lib/readerPassageSelection";
import {
  bboxesToCanvasRects,
  normalizeJumpBboxes,
  pdfPageDimensions,
  waitForSmoothScrollEnd,
  type PdfBbox,
} from "@/lib/pdfHighlightLayout";
import type { SourceJumpTarget } from "@/lib/sourceHighlight";
import { clearReaderHighlight } from "@/lib/readerHighlightStorage";
import {
  fetchSessionFileRegions,
  regionToPassage,
  unionRegionCanvasRects,
  type ReaderRegion,
} from "@/lib/readerRegions";
import { apiFetch } from "@/lib/apiFetch";
import { getApiErrorMessage } from "@/lib/apiErrors";

const DEFAULT_SCALE = 1.55;
const HIGHLIGHT_SCROLL_PADDING_PX = 96;
const SOURCE_HIGHLIGHT_MS = 1000;
const HIGHLIGHT_FADE_MS = 180;
const HIGHLIGHT_OVERLAY_SELECTOR = ".pdf-highlight-layer .pdf-highlight-overlay";
const REGION_OVERLAY_SELECTOR = ".pdf-region-layer .pdf-region";
const HIGHLIGHT_OVERLAY_CLASS = "pdf-highlight-overlay animate-in fade-in duration-200";

function clearPdfHighlights(): void {
  document.querySelectorAll(HIGHLIGHT_OVERLAY_SELECTOR).forEach((el) => el.remove());
}

function clearTableRegionOverlays(): void {
  document.querySelectorAll(REGION_OVERLAY_SELECTOR).forEach((el) => el.remove());
}

function clearReaderPdfSelection(): void {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed) return;
  const anchor = selection.anchorNode;
  const anchorEl =
    anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
  if (anchorEl?.closest(".reader-pdf-page")) {
    selection.removeAllRanges();
  }
}

type AskToolbarState = {
  top: number;
  left: number;
  text: string;
};

type ReaderDocumentViewerProps = {
  sessionId: string;
  docId: string;
  displayName?: string;
  initialPage?: number;
  initialHighlight?: SourceJumpTarget;
  onAskSelection?: (passage: ReaderPassageSelection) => void;
};

async function drawBboxHighlights(
  page: number,
  bboxes: PdfBbox[],
  pdfDoc: pdfjs.PDFDocumentProxy,
  canvas: HTMLCanvasElement,
  options: { className: string; autoRemoveMs?: number },
): Promise<void> {
  const wrapper = canvas.parentElement;
  const highlightLayer = wrapper?.querySelector(".pdf-highlight-layer");
  if (!wrapper || !highlightLayer || bboxes.length === 0) return;

  try {
    const pdfPage = await pdfDoc.getPage(page);
    const { width: pdfPageWidth, height: pdfPageHeight } = pdfPageDimensions(pdfPage.view as number[]);
    const cssWidth = Number.parseFloat(canvas.style.width);
    const cssHeight = Number.parseFloat(canvas.style.height);
    if (!cssWidth || !cssHeight) return;

    const rects = bboxesToCanvasRects(
      bboxes,
      cssWidth,
      cssHeight,
      pdfPageWidth,
      pdfPageHeight,
      pdfPage,
      cssWidth / pdfPageWidth,
      wrapper,
    );
    rects.forEach(({ left, top, width, height }) => {
      const highlight = document.createElement("div");
      highlight.className = options.className;
      highlight.style.position = "absolute";
      highlight.style.left = `${left}px`;
      highlight.style.top = `${top}px`;
      highlight.style.width = `${width}px`;
      highlight.style.height = `${height}px`;
      highlight.style.pointerEvents = "none";
      highlightLayer.appendChild(highlight);

      if (options.autoRemoveMs != null) {
        window.setTimeout(() => {
          requestAnimationFrame(() => highlight.classList.add("is-fading"));
          const removeHighlight = () => highlight.remove();
          highlight.addEventListener("transitionend", removeHighlight, { once: true });
          window.setTimeout(removeHighlight, HIGHLIGHT_FADE_MS + 40);
        }, options.autoRemoveMs);
      }
    });
  } catch (e) {
    console.error("Error drawing bbox highlights in ReaderDocumentViewer:", e);
  }
}

async function scrollToPage(
  scrollContainer: HTMLDivElement,
  canvas: HTMLCanvasElement,
  targetTop?: number,
): Promise<void> {
  if (targetTop != null) {
    scrollContainer.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    await waitForSmoothScrollEnd(scrollContainer, { targetTop: Math.max(0, targetTop) });
    return;
  }
  canvas.scrollIntoView({ behavior: "smooth", block: "center" });
  await waitForSmoothScrollEnd(scrollContainer);
}

async function scrollToPageHighlights(
  scrollContainer: HTMLDivElement,
  page: number,
  bboxes: PdfBbox[],
  pdfDoc: pdfjs.PDFDocumentProxy,
  canvas: HTMLCanvasElement,
): Promise<void> {
  const pageWrapper = canvas.parentElement;
  if (!pageWrapper || bboxes.length === 0) {
    await scrollToPage(scrollContainer, canvas);
    return;
  }

  try {
    const pdfPage = await pdfDoc.getPage(page);
    const { width: pdfPageWidth, height: pdfPageHeight } = pdfPageDimensions(pdfPage.view as number[]);
    const cssWidth = Number.parseFloat(canvas.style.width);
    const cssHeight = Number.parseFloat(canvas.style.height);
    if (!cssWidth || !cssHeight) {
      await scrollToPage(scrollContainer, canvas);
      return;
    }

    const rects = bboxesToCanvasRects(
      bboxes,
      cssWidth,
      cssHeight,
      pdfPageWidth,
      pdfPageHeight,
      pdfPage,
      cssWidth / pdfPageWidth,
      pageWrapper,
    );
    if (rects.length === 0) {
      await scrollToPage(scrollContainer, canvas);
      return;
    }

    let minTop = Infinity;
    let maxBottom = -Infinity;
    rects.forEach(({ top, height }) => {
      minTop = Math.min(minTop, top);
      maxBottom = Math.max(maxBottom, top + height);
    });

    const wrapperTop = pageWrapper.offsetTop;
    const regionTop = wrapperTop + minTop;
    const regionHeight = Math.max(maxBottom - minTop, 1);
    const viewportHeight = scrollContainer.clientHeight;
    const paddedTop = regionTop - HIGHLIGHT_SCROLL_PADDING_PX;
    const paddedHeight = regionHeight + HIGHLIGHT_SCROLL_PADDING_PX * 2;
    const idealScroll = paddedTop - Math.max(32, (viewportHeight - paddedHeight) * 0.2);

    await scrollToPage(scrollContainer, canvas, idealScroll);
  } catch {
    await scrollToPage(scrollContainer, canvas);
  }
}

function getSelectionCaretRect(selection: Selection): DOMRect {
  const focusNode = selection.focusNode;
  if (focusNode) {
    const caret = document.createRange();
    caret.setStart(focusNode, selection.focusOffset);
    caret.collapse(true);
    const focusRects = caret.getClientRects();
    if (focusRects.length > 0) return focusRects[0]!;
    const focusBox = caret.getBoundingClientRect();
    if (focusBox.width > 0 || focusBox.height > 0) return focusBox;
  }

  const range = selection.getRangeAt(0);
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[rects.length - 1]!;
  return range.getBoundingClientRect();
}

type JumpToPageOptions = { highlightMs?: number };

export interface ReaderDocumentViewerHandle {
  jumpToPage: (
    page: number,
    bboxes?: PdfBbox[] | [number, number, number, number][],
    options?: JumpToPageOptions,
  ) => void;
}

export const ReaderDocumentViewer = forwardRef<
  ReaderDocumentViewerHandle,
  ReaderDocumentViewerProps
>(function ReaderDocumentViewer(
  { sessionId, docId, displayName, initialPage, initialHighlight, onAskSelection },
  ref,
) {
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const textLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const textLayerTasks = useRef<Map<number, pdfjs.TextLayer>>(new Map());
  const textLayerSelectionCleanups = useRef<Map<number, () => void>>(new Map());
  const pdfDocRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const canvasRenderedPagesRef = useRef<Set<number>>(new Set());
  const textLayerRenderedPagesRef = useRef<Set<number>>(new Set());
  const pageRenderTasksRef = useRef<Map<number, Promise<boolean>>>(new Map());
  const jumpGenerationRef = useRef(0);
  const didApplyInitialHighlightRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [tableRegions, setTableRegions] = useState<ReaderRegion[]>([]);
  const [askToolbar, setAskToolbar] = useState<AskToolbarState | null>(null);
  const tableRegionsRef = useRef<ReaderRegion[]>([]);
  const onAskSelectionRef = useRef(onAskSelection);
  onAskSelectionRef.current = onAskSelection;
  tableRegionsRef.current = tableRegions;

  const setCanvasRef = useCallback((pageNum: number, el: HTMLCanvasElement | null) => {
    if (el) canvasRefs.current.set(pageNum, el);
    else canvasRefs.current.delete(pageNum);
  }, []);

  const setTextLayerRef = useCallback((pageNum: number, el: HTMLDivElement | null) => {
    if (el) textLayerRefs.current.set(pageNum, el);
    else textLayerRefs.current.delete(pageNum);
  }, []);

  const cancelTextLayers = useCallback(() => {
    textLayerTasks.current.forEach((task) => task.cancel());
    textLayerTasks.current.clear();
    textLayerSelectionCleanups.current.forEach((cleanup) => cleanup());
    textLayerSelectionCleanups.current.clear();
    textLayerRefs.current.forEach((el) => el.replaceChildren());
  }, []);

  const syncTableRegionOverlays = useCallback(async (pageNum: number) => {
    const doc = pdfDocRef.current;
    const canvas = canvasRefs.current.get(pageNum);
    const pageWrapper = canvas?.parentElement;
    const regionLayer = pageWrapper?.querySelector(".pdf-region-layer");
    if (!doc || !canvas || !pageWrapper || !regionLayer) return;

    regionLayer.querySelectorAll(".pdf-region").forEach((el) => el.remove());

    const pageRegions = tableRegionsRef.current.filter((region) => region.page === pageNum);
    if (pageRegions.length === 0) return;

    try {
      const pdfPage = await doc.getPage(pageNum);
      const { width: pdfPageWidth, height: pdfPageHeight } = pdfPageDimensions(pdfPage.view as number[]);
      const cssWidth = Number.parseFloat(canvas.style.width);
      const cssHeight = Number.parseFloat(canvas.style.height);
      if (!cssWidth || !cssHeight) return;

      const renderScale = cssWidth / pdfPageWidth;

      for (const region of pageRegions) {
        const rects = bboxesToCanvasRects(
          region.bboxes,
          cssWidth,
          cssHeight,
          pdfPageWidth,
          pdfPageHeight,
          pdfPage,
          renderScale,
          pageWrapper,
        );
        const union = unionRegionCanvasRects(rects);
        if (!union || union.width <= 0 || union.height <= 0) continue;

        const askAboutRegion = () => {
          clearReaderPdfSelection();
          setAskToolbar(null);
          onAskSelectionRef.current?.(regionToPassage(region));
        };

        const overlay = document.createElement("div");
        overlay.className = "pdf-region";
        overlay.style.left = `${union.left}px`;
        overlay.style.top = `${union.top}px`;
        overlay.style.width = `${union.width}px`;
        overlay.style.height = `${union.height}px`;
        overlay.setAttribute("role", "group");
        overlay.setAttribute("aria-label", `Region on page ${region.page}`);

        const askBtn = document.createElement("button");
        askBtn.type = "button";
        askBtn.className = "pdf-region-ask";
        askBtn.setAttribute("aria-label", `Ask about excerpt on page ${region.page}`);
        askBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>Ask</span>`;
        askBtn.addEventListener("mousedown", (event) => event.preventDefault());
        askBtn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          askAboutRegion();
        });

        overlay.appendChild(askBtn);
        regionLayer.appendChild(overlay);
      }
    } catch (e) {
      console.error("Error drawing table region overlays:", e);
    }
  }, []);

  const syncAllTableRegionOverlays = useCallback(async () => {
    const pages = Array.from(canvasRenderedPagesRef.current);
    await Promise.all(pages.map((pageNum) => syncTableRegionOverlays(pageNum)));
  }, [syncTableRegionOverlays]);

  const renderPdfPage = useCallback(
    async (pageNum: number, options: { textLayer?: boolean } = {}): Promise<boolean> => {
      const includeTextLayer = options.textLayer !== false;
      if (
        canvasRenderedPagesRef.current.has(pageNum) &&
        (!includeTextLayer || textLayerRenderedPagesRef.current.has(pageNum))
      ) {
        return true;
      }

      const inFlight = pageRenderTasksRef.current.get(pageNum);
      if (inFlight) return inFlight;

      const task = (async () => {
        const doc = pdfDocRef.current;
        const canvas = canvasRefs.current.get(pageNum);
        const textLayerEl = textLayerRefs.current.get(pageNum);
        if (!doc || !canvas || !textLayerEl) return false;

        if (!canvasRenderedPagesRef.current.has(pageNum)) {
          const page = await doc.getPage(pageNum);
          const viewport = page.getViewport({ scale: DEFAULT_SCALE });
          const pageWrapper = textLayerEl.parentElement;
          if (pageWrapper) {
            pageWrapper.style.setProperty("--scale-factor", String(viewport.scale));
          }

          const ctx = canvas.getContext("2d");
          if (!ctx) return false;

          const outputScale = new pdfjs.OutputScale();
          // Must match pdf.js `setLayerDimensions` rounding (CSS round(down)) so the
          // canvas raster and the text layer share identical dimensions.
          const cssWidth = Math.floor(viewport.width);
          const cssHeight = Math.floor(viewport.height);
          canvas.width = Math.floor(cssWidth * outputScale.sx);
          canvas.height = Math.floor(cssHeight * outputScale.sy);
          canvas.style.width = `${cssWidth}px`;
          canvas.style.height = `${cssHeight}px`;

          const transform = outputScale.scaled
            ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0]
            : undefined;
          await page.render({ canvasContext: ctx, viewport, transform }).promise;
          canvasRenderedPagesRef.current.add(pageNum);
        }

        if (includeTextLayer && !textLayerRenderedPagesRef.current.has(pageNum)) {
          const page = await doc.getPage(pageNum);
          const viewport = page.getViewport({ scale: DEFAULT_SCALE });

          textLayerEl.replaceChildren();
          // Let pdf.js size the layer to exactly `--scale-factor * pageWidth`.
          // Glyph left/top are percentages of THIS width; overriding it (e.g. to the
          // rounded canvas size) desyncs %-positions from the absolute font scale,
          // producing cumulative gaps and clipping the last glyph on justified lines.
          pdfjs.setLayerDimensions(textLayerEl, viewport);

          const textLayer = new pdfjs.TextLayer({
            textContentSource: page.streamTextContent({
              includeMarkedContent: true,
              disableNormalization: true,
            }),
            container: textLayerEl,
            viewport,
          });
          textLayerTasks.current.set(pageNum, textLayer);
          await textLayer.render();
          trimPdfTextLayerEOLWhitespace(textLayerEl);

          textLayerSelectionCleanups.current.get(pageNum)?.();
          textLayerSelectionCleanups.current.set(
            pageNum,
            attachPdfTextLayerSelection(textLayerEl),
          );
          textLayerRenderedPagesRef.current.add(pageNum);
        }

        void syncTableRegionOverlays(pageNum);
        return true;
      })();

      pageRenderTasksRef.current.set(pageNum, task);
      try {
        return await task;
      } finally {
        pageRenderTasksRef.current.delete(pageNum);
      }
    },
    [syncTableRegionOverlays],
  );

  const performJumpToPage = useCallback(
    async (
      page: number,
      bboxes?: PdfBbox[] | [number, number, number, number][],
      highlightMs = SOURCE_HIGHLIGHT_MS,
    ): Promise<boolean> => {
      const jumpGeneration = ++jumpGenerationRef.current;
      clearReaderPdfSelection();
      setAskToolbar(null);
      clearPdfHighlights();

      if (!canvasRenderedPagesRef.current.has(page)) {
        const rendered = await renderPdfPage(page, { textLayer: false });
        if (jumpGeneration !== jumpGenerationRef.current || !rendered) return false;
      }

      const canvas = canvasRefs.current.get(page);
      const scrollContainer = scrollContainerRef.current;
      const pdfDoc = pdfDocRef.current;
      if (!canvas) return false;

      const normalizedBboxes = bboxes?.length ? normalizeJumpBboxes(bboxes) : [];

      if (scrollContainer) {
        if (normalizedBboxes.length > 0 && pdfDoc) {
          await scrollToPageHighlights(scrollContainer, page, normalizedBboxes, pdfDoc, canvas);
        } else {
          await scrollToPage(scrollContainer, canvas);
        }
      }
      if (jumpGeneration !== jumpGenerationRef.current) return false;

      if (normalizedBboxes.length === 0 || !pdfDoc) {
        void renderPdfPage(page);
        return normalizedBboxes.length === 0;
      }

      await drawBboxHighlights(page, normalizedBboxes, pdfDoc, canvas, {
        className: HIGHLIGHT_OVERLAY_CLASS,
        autoRemoveMs: highlightMs,
      });
      if (jumpGeneration !== jumpGenerationRef.current) return false;
      void renderPdfPage(page);
      return true;
    },
    [renderPdfPage],
  );

  useImperativeHandle(
    ref,
    () => ({
      jumpToPage: (page, bboxes, options) => {
        void performJumpToPage(page, bboxes, options?.highlightMs ?? SOURCE_HIGHLIGHT_MS);
      },
    }),
    [performJumpToPage],
  );

  useEffect(() => {
    let cancelled = false;
    pdfDocRef.current?.destroy();
    pdfDocRef.current = null;
    setNumPages(0);
    setTableRegions([]);
    setError(null);
    setLoading(true);
    cancelTextLayers();
    clearTableRegionOverlays();
    canvasRefs.current.clear();
    textLayerRefs.current.clear();
    canvasRenderedPagesRef.current.clear();
    textLayerRenderedPagesRef.current.clear();
    pageRenderTasksRef.current.clear();
    didApplyInitialHighlightRef.current = false;

    async function loadDocument() {
      if (!sessionId || !docId) return;
      try {
        const res = await apiFetch(API_URLS.sessionFile(docId), {}, sessionId);
        if (!res.ok) {
          const message = await getApiErrorMessage(res);
          throw new Error(message || `HTTP ${res.status}`);
        }
        const arrayBuffer = await res.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) {
          pdf.destroy();
          return;
        }
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setLoading(false);

        try {
          const regions = await fetchSessionFileRegions(sessionId, docId);
          if (!cancelled) setTableRegions(regions);
        } catch (e) {
          console.warn("Could not load table regions:", e);
          if (!cancelled) setTableRegions([]);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Could not load PDF.";
          setError(msg);
          setLoading(false);
        }
      }
    }

    void loadDocument();
    return () => {
      cancelled = true;
      cancelTextLayers();
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
  }, [sessionId, docId, cancelTextLayers]);

  useEffect(() => {
    if (tableRegions.length === 0) {
      clearTableRegionOverlays();
      return;
    }
    void syncAllTableRegionOverlays();
  }, [tableRegions, syncAllTableRegionOverlays]);

  useEffect(() => {
    didApplyInitialHighlightRef.current = false;
  }, [sessionId, docId, initialPage, initialHighlight]);

  useEffect(() => {
    const pdf = pdfDocRef.current;
    if (!pdf || numPages === 0 || loading) return;

    let cancelled = false;

    async function renderPages() {
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (cancelled) return;
        await renderPdfPage(pageNum);
      }

      if (cancelled || didApplyInitialHighlightRef.current) return;

      if (initialHighlight?.bboxes.length) {
        const page = initialHighlight.page;
        if (page >= 1 && page <= numPages) {
          didApplyInitialHighlightRef.current = true;
          const applied = await performJumpToPage(page, initialHighlight.bboxes, SOURCE_HIGHLIGHT_MS);
          if (applied) clearReaderHighlight(sessionId, docId);
        }
        return;
      }

      const targetPage = initialPage;
      if (targetPage == null || targetPage < 1 || targetPage > numPages) return;
      const canvas = canvasRefs.current.get(targetPage);
      if (!canvas) return;
      didApplyInitialHighlightRef.current = true;
      canvas.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    const t = requestAnimationFrame(() => {
      void renderPages();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(t);
    };
  }, [
    numPages,
    loading,
    initialPage,
    initialHighlight,
    performJumpToPage,
    renderPdfPage,
    sessionId,
    docId,
  ]);

  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root) return;

    const updateToolbar = () => {
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setAskToolbar(null);
        return;
      }

      const anchor = selection.anchorNode;
      if (!anchor || !root.contains(anchor)) {
        setAskToolbar(null);
        return;
      }

      const text = selection.toString().trim();
      if (!text) {
        setAskToolbar(null);
        return;
      }

      const caretRect = getSelectionCaretRect(selection);
      if (caretRect.width === 0 && caretRect.height === 0) {
        setAskToolbar(null);
        return;
      }

      setAskToolbar({
        top: caretRect.top - 10,
        left: caretRect.left + caretRect.width / 2,
        text,
      });
    };

    const hideToolbar = () => setAskToolbar(null);

    let isPointerDown = false;
    const onPointerDown = () => {
      isPointerDown = true;
    };
    const onPointerUp = () => {
      isPointerDown = false;
      updateToolbar();
    };
    const onSelectionChange = () => {
      if (!isPointerDown) updateToolbar();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("selectionchange", onSelectionChange);
    root.addEventListener("scroll", hideToolbar, { passive: true });
    window.addEventListener("resize", hideToolbar);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      root.removeEventListener("scroll", hideToolbar);
      window.removeEventListener("resize", hideToolbar);
    };
  }, [numPages, loading, error]);

  const handleAskClick = useCallback(async () => {
    const selection = document.getSelection();
    if (!askToolbar?.text || !selection || selection.isCollapsed) return;

    const passage = await capturePassageFromSelection(
      selection,
      async (page) => {
        const doc = pdfDocRef.current;
        if (!doc) return null;
        const pdfPage = await doc.getPage(page);
        return { view: pdfPage.view as number[] };
      },
      (page) => canvasRefs.current.get(page),
    );

    if (!passage) return;

    onAskSelection?.(passage);
    setAskToolbar(null);
    selection.removeAllRanges();
  }, [askToolbar, onAskSelection]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-black/20">
      <div className="flex shrink-0 items-center border-b border-white/10 px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white/90">{displayName || docId}</div>
          {numPages > 0 && <div className="text-[10px] text-white/45">{numPages} pages</div>}
        </div>
      </div>
      <div ref={scrollContainerRef} className="relative min-h-0 flex-1 overflow-auto rag-scrollbar p-6">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/40 border-t-primary" />
          </div>
        )}
        {error && <div className="py-20 text-center text-sm text-red-300">{error}</div>}
        {!loading && !error && numPages > 0 && (
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <div
                key={pageNum}
                className="reader-pdf-page relative inline-block border border-black/20 bg-white shadow-2xl"
              >
                <canvas
                  ref={(el) => setCanvasRef(pageNum, el)}
                  className="pointer-events-none block"
                />
                <div className="pdf-highlight-layer" aria-hidden />
                <div className="pdf-region-layer" aria-hidden />
                <div
                  ref={(el) => setTextLayerRef(pageNum, el)}
                  className="textLayer"
                  data-page={pageNum}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {askToolbar && onAskSelection && (
        <div
          className="pointer-events-none fixed z-50 flex -translate-x-1/2 -translate-y-full flex-col items-center"
          style={{ top: askToolbar.top, left: askToolbar.left }}
          data-testid="reader-selection-ask-toolbar"
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleAskClick}
            className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-white/20 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-black/50 transition hover:border-primary/50 hover:bg-zinc-800"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
              aria-hidden
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Ask
          </button>
          <div
            className="h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-zinc-900"
            aria-hidden
          />
        </div>
      )}
    </div>
  );
});
