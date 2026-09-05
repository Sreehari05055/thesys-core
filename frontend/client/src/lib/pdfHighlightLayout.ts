import type { PDFPageProxy } from "pdfjs-dist";

export type PdfBbox = {
  box: [number, number, number, number];
  page_width?: number;
  page_height?: number;
};

export type CanvasRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type BboxLayoutMode =
  | "topLeftMeta"
  | "topLeftPdf"
  | "bottomLeftMeta"
  | "bottomLeftPdf"
  | "pdfViewport";

export function normalizeJumpBboxes(
  bboxes: PdfBbox[] | [number, number, number, number][],
): PdfBbox[] {
  return bboxes.map((entry) =>
    Array.isArray(entry) ? { box: entry } : entry,
  );
}

export function pdfPageDimensions(view: number[]): { width: number; height: number } {
  return {
    width: view[2]! - view[0]!,
    height: view[3]! - view[1]!,
  };
}

function clampRect(rect: CanvasRect): CanvasRect {
  return {
    left: rect.left,
    top: rect.top,
    width: Math.max(rect.width, 0),
    height: Math.max(rect.height, 0),
  };
}

function mapBoxTopLeft(
  box: [number, number, number, number],
  pageWidth: number,
  pageHeight: number,
  canvasCssWidth: number,
  canvasCssHeight: number,
): CanvasRect {
  const [x1, y1, x2, y2] = box;
  const scaleX = canvasCssWidth / pageWidth;
  const scaleY = canvasCssHeight / pageHeight;
  return clampRect({
    left: x1 * scaleX,
    top: y1 * scaleY,
    width: (x2 - x1) * scaleX,
    height: (y2 - y1) * scaleY,
  });
}

function mapBoxBottomLeft(
  box: [number, number, number, number],
  pageWidth: number,
  pageHeight: number,
  canvasCssWidth: number,
  canvasCssHeight: number,
): CanvasRect {
  const [x1, y1, x2, y2] = box;
  const scaleX = canvasCssWidth / pageWidth;
  const scaleY = canvasCssHeight / pageHeight;
  return clampRect({
    left: x1 * scaleX,
    top: (pageHeight - y2) * scaleY,
    width: (x2 - x1) * scaleX,
    height: (y2 - y1) * scaleY,
  });
}

function mapBoxPdfViewport(
  box: [number, number, number, number],
  pdfPage: PDFPageProxy,
  renderScale: number,
): CanvasRect {
  const viewport = pdfPage.getViewport({ scale: renderScale });
  const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle(box);
  return clampRect({
    left: Math.min(vx1, vx2),
    top: Math.min(vy1, vy2),
    width: Math.abs(vx2 - vx1),
    height: Math.abs(vy2 - vy1),
  });
}

function metaPageSize(bbox: PdfBbox, pdfPageWidth: number, pdfPageHeight: number) {
  return {
    width: bbox.page_width && bbox.page_width > 0 ? bbox.page_width : pdfPageWidth,
    height: bbox.page_height && bbox.page_height > 0 ? bbox.page_height : pdfPageHeight,
  };
}

function layoutRects(
  bboxes: PdfBbox[],
  mode: BboxLayoutMode,
  canvasCssWidth: number,
  canvasCssHeight: number,
  pdfPageWidth: number,
  pdfPageHeight: number,
  pdfPage: PDFPageProxy,
  renderScale: number,
): CanvasRect[] {
  return bboxes
    .map((bbox) => {
      const box = bbox.box;
      switch (mode) {
        case "topLeftMeta": {
          const { width, height } = metaPageSize(bbox, pdfPageWidth, pdfPageHeight);
          return mapBoxTopLeft(box, width, height, canvasCssWidth, canvasCssHeight);
        }
        case "topLeftPdf":
          return mapBoxTopLeft(box, pdfPageWidth, pdfPageHeight, canvasCssWidth, canvasCssHeight);
        case "bottomLeftMeta": {
          const { width, height } = metaPageSize(bbox, pdfPageWidth, pdfPageHeight);
          return mapBoxBottomLeft(box, width, height, canvasCssWidth, canvasCssHeight);
        }
        case "bottomLeftPdf":
          return mapBoxBottomLeft(box, pdfPageWidth, pdfPageHeight, canvasCssWidth, canvasCssHeight);
        case "pdfViewport":
          return mapBoxPdfViewport(box, pdfPage, renderScale);
        default:
          return null;
      }
    })
    .filter((rect): rect is CanvasRect => rect != null && rect.width > 0 && rect.height > 0);
}

function scoreHighlightRects(
  rects: CanvasRect[],
  canvasCssWidth: number,
  canvasCssHeight: number,
): number {
  if (rects.length === 0) return Number.NEGATIVE_INFINITY;

  let score = 0;
  for (const rect of rects) {
    const outOfBounds =
      rect.left < -4 ||
      rect.top < -4 ||
      rect.left + rect.width > canvasCssWidth + 4 ||
      rect.top + rect.height > canvasCssHeight + 4;

    if (outOfBounds) {
      score -= 24;
      continue;
    }

    score += 6;

    const heightRatio = rect.height / canvasCssHeight;
    if (heightRatio >= 0.006 && heightRatio <= 0.09) score += 4;
    else if (heightRatio <= 0.18) score += 1;
    else score -= 3;

    if (rect.width >= 16) score += 1;
  }

  return score;
}

function pickBestLayoutMode(
  bboxes: PdfBbox[],
  canvasCssWidth: number,
  canvasCssHeight: number,
  pdfPageWidth: number,
  pdfPageHeight: number,
  pdfPage: PDFPageProxy,
  renderScale: number,
): BboxLayoutMode {
  const modes: BboxLayoutMode[] = [
    "topLeftMeta",
    "topLeftPdf",
    "bottomLeftMeta",
    "bottomLeftPdf",
    "pdfViewport",
  ];

  let bestMode: BboxLayoutMode = "topLeftMeta";
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const mode of modes) {
    const rects = layoutRects(
      bboxes,
      mode,
      canvasCssWidth,
      canvasCssHeight,
      pdfPageWidth,
      pdfPageHeight,
      pdfPage,
      renderScale,
    );
    const score = scoreHighlightRects(rects, canvasCssWidth, canvasCssHeight);
    if (score > bestScore) {
      bestScore = score;
      bestMode = mode;
    }
  }

  return bestMode;
}

function horizontalOverlap(a: CanvasRect, b: CanvasRect): number {
  return Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
}

function verticalOverlap(a: CanvasRect, b: CanvasRect): number {
  return Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
}

function mergeTwoRects(a: CanvasRect, b: CanvasRect): CanvasRect {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  const right = Math.max(a.left + a.width, b.left + b.width);
  const bottom = Math.max(a.top + a.height, b.top + b.height);
  return {
    left,
    top,
    width: Math.max(right - left, 1),
    height: Math.max(bottom - top, 1),
  };
}

function onSameTextLine(a: CanvasRect, b: CanvasRect): boolean {
  const overlap = verticalOverlap(a, b);
  const minHeight = Math.min(a.height, b.height);
  return overlap >= minHeight * 0.45;
}

function rectsTouchOrOverlap(a: CanvasRect, b: CanvasRect, gapPx: number): boolean {
  if (!onSameTextLine(a, b)) return false;
  if (horizontalOverlap(a, b) > 0) return true;
  const gap = Math.max(b.left - (a.left + a.width), a.left - (b.left + b.width));
  return gap <= gapPx;
}

/** Merge adjacent rects on the same line into continuous highlight strips. */
function mergeCanvasRectsByLine(rects: CanvasRect[], gapPx = 8): CanvasRect[] {
  if (rects.length <= 1) return rects;

  let pool = [...rects];
  let changed = true;

  while (changed) {
    changed = false;
    const used = new Set<number>();
    const merged: CanvasRect[] = [];

    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;
      let current = pool[i]!;
      for (let j = i + 1; j < pool.length; j++) {
        if (used.has(j)) continue;
        if (rectsTouchOrOverlap(current, pool[j]!, gapPx)) {
          current = mergeTwoRects(current, pool[j]!);
          used.add(j);
          changed = true;
        }
      }
      merged.push(current);
    }

    pool = merged;
  }

  return pool;
}

function collectTextLayerRects(pageWrapper: HTMLElement): CanvasRect[] {
  const textLayer = pageWrapper.querySelector(".textLayer");
  if (!textLayer) return [];

  const wrapperRect = pageWrapper.getBoundingClientRect();
  const spanRects: CanvasRect[] = [];

  for (const span of Array.from(textLayer.querySelectorAll("span"))) {
    const bounds = span.getBoundingClientRect();
    if (bounds.width <= 1 || bounds.height <= 1) continue;
    spanRects.push({
      left: bounds.left - wrapperRect.left,
      top: bounds.top - wrapperRect.top,
      width: bounds.width,
      height: bounds.height,
    });
  }

  return spanRects;
}

function rectIntersects(a: CanvasRect, b: CanvasRect): boolean {
  return horizontalOverlap(a, b) > 0 && verticalOverlap(a, b) > 0;
}

function spanMatchesSeedRect(span: CanvasRect, seed: CanvasRect): boolean {
  if (rectIntersects(span, seed)) return true;
  if (!onSameTextLine(span, seed)) return false;
  return horizontalOverlap(span, seed) >= Math.min(span.width, seed.width) * 0.2;
}

/** Snap to text-layer spans and merge into one strip per line instead of one box per bbox. */
function refineRectsWithTextLayer(
  rects: CanvasRect[],
  pageWrapper: HTMLElement,
): CanvasRect[] {
  if (rects.length === 0) return rects;

  const spanRects = collectTextLayerRects(pageWrapper);
  if (spanRects.length === 0) return mergeCanvasRectsByLine(rects);

  const matched = spanRects.filter((span) =>
    rects.some((seed) => spanMatchesSeedRect(span, seed)),
  );

  if (matched.length === 0) return mergeCanvasRectsByLine(rects);
  return mergeCanvasRectsByLine(matched);
}

function hasDoclingBboxMeta(bboxes: PdfBbox[]): boolean {
  return bboxes.some(
    (b) =>
      typeof b.page_width === "number" &&
      b.page_width > 0 &&
      typeof b.page_height === "number" &&
      b.page_height > 0,
  );
}

/** Map PDF-space bbox coordinates to CSS pixels on the rendered canvas. */
function bboxToCanvasRect(
  bbox: PdfBbox,
  canvasCssWidth: number,
  canvasCssHeight: number,
  pdfPageWidth: number,
  pdfPageHeight: number,
): CanvasRect | null {
  const { width, height } = metaPageSize(bbox, pdfPageWidth, pdfPageHeight);
  if (!width || !height || !canvasCssWidth || !canvasCssHeight) return null;
  return mapBoxTopLeft(bbox.box, width, height, canvasCssWidth, canvasCssHeight);
}

export function bboxesToCanvasRects(
  bboxes: PdfBbox[],
  canvasCssWidth: number,
  canvasCssHeight: number,
  pdfPageWidth: number,
  pdfPageHeight: number,
  pdfPage?: PDFPageProxy,
  renderScale?: number,
  pageWrapper?: HTMLElement | null,
): CanvasRect[] {
  if (!bboxes.length || !canvasCssWidth || !canvasCssHeight) return [];

  // Backend Docling bboxes: top-left origin + page_width/page_height metadata.
  // Skip PyMuPDF-era auto layout + text-layer snap (breaks block-level paragraph boxes).
  if (hasDoclingBboxMeta(bboxes)) {
    return bboxes
      .map((bbox) => {
        const { width, height } = metaPageSize(bbox, pdfPageWidth, pdfPageHeight);
        return mapBoxTopLeft(bbox.box, width, height, canvasCssWidth, canvasCssHeight);
      })
      .filter((rect) => rect.width > 0 && rect.height > 0);
  }

  let rects: CanvasRect[];

  if (pdfPage && renderScale && renderScale > 0) {
    const mode = pickBestLayoutMode(
      bboxes,
      canvasCssWidth,
      canvasCssHeight,
      pdfPageWidth,
      pdfPageHeight,
      pdfPage,
      renderScale,
    );
    rects = layoutRects(
      bboxes,
      mode,
      canvasCssWidth,
      canvasCssHeight,
      pdfPageWidth,
      pdfPageHeight,
      pdfPage,
      renderScale,
    );
  } else {
    rects = bboxes
      .map((bbox) => bboxToCanvasRect(bbox, canvasCssWidth, canvasCssHeight, pdfPageWidth, pdfPageHeight))
      .filter((rect): rect is CanvasRect => rect != null);
  }

  if (pageWrapper) {
    rects = refineRectsWithTextLayer(rects, pageWrapper);
  } else {
    rects = mergeCanvasRectsByLine(rects);
  }

  return rects;
}

type WaitForScrollOptions = {
  targetTop?: number;
  tolerancePx?: number;
  settleMs?: number;
  timeoutMs?: number;
};

/** Resolve once a smooth scroll finishes (or the container stops moving). */
export function waitForSmoothScrollEnd(
  scrollContainer: HTMLElement,
  options: WaitForScrollOptions = {},
): Promise<void> {
  const tolerancePx = options.tolerancePx ?? 3;
  const settleMs = options.settleMs ?? 100;
  const timeoutMs = options.timeoutMs ?? 4000;
  const targetTop = options.targetTop;

  return new Promise((resolve) => {
    let finished = false;
    let settleTimer: number | null = null;
    let timeoutTimer: number | null = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      scrollContainer.removeEventListener("scroll", onScroll);
      scrollContainer.removeEventListener("scrollend", onScrollEnd);
      if (settleTimer != null) window.clearTimeout(settleTimer);
      if (timeoutTimer != null) window.clearTimeout(timeoutTimer);
      resolve();
    };

    const atTarget = () =>
      targetTop == null || Math.abs(scrollContainer.scrollTop - targetTop) <= tolerancePx;

    const maybeFinish = () => {
      if (atTarget()) finish();
    };

    const onScrollEnd = () => {
      maybeFinish();
    };

    const onScroll = () => {
      if (settleTimer != null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(maybeFinish, settleMs);
    };

    scrollContainer.addEventListener("scrollend", onScrollEnd, { once: true });
    scrollContainer.addEventListener("scroll", onScroll, { passive: true });
    timeoutTimer = window.setTimeout(finish, timeoutMs);

    requestAnimationFrame(onScroll);
  });
}
