/**
 * Selection stability for pdf.js text layers (ported from TextLayerBuilder in pdf_viewer.mjs).
 * Without this, dragging across line gaps causes the selection to jump erratically.
 */

const textLayers = new Map<HTMLElement, HTMLElement>();
let selectionAbort: AbortController | null = null;

function resetEndOfContent(end: HTMLElement, textLayer: HTMLElement) {
  textLayer.append(end);
  end.style.width = "";
  end.style.height = "";
  textLayer.classList.remove("selecting");
}

function ensureGlobalSelectionListener() {
  if (selectionAbort) return;

  selectionAbort = new AbortController();
  const { signal } = selectionAbort;

  let isPointerDown = false;
  let prevRange: Range | null = null;
  let isFirefox: boolean | undefined;

  document.addEventListener(
    "pointerdown",
    () => {
      isPointerDown = true;
    },
    { signal },
  );
  document.addEventListener(
    "pointerup",
    () => {
      isPointerDown = false;
      textLayers.forEach(resetEndOfContent);
    },
    { signal },
  );
  window.addEventListener(
    "blur",
    () => {
      isPointerDown = false;
      textLayers.forEach(resetEndOfContent);
    },
    { signal },
  );
  document.addEventListener(
    "keyup",
    () => {
      if (!isPointerDown) {
        textLayers.forEach(resetEndOfContent);
      }
    },
    { signal },
  );

  document.addEventListener(
    "selectionchange",
    () => {
      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) {
        textLayers.forEach(resetEndOfContent);
        return;
      }

      const activeTextLayers = new Set<HTMLElement>();
      for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        textLayers.forEach((_end, textLayerDiv) => {
          if (!activeTextLayers.has(textLayerDiv) && range.intersectsNode(textLayerDiv)) {
            activeTextLayers.add(textLayerDiv);
          }
        });
      }

      textLayers.forEach((endDiv, textLayerDiv) => {
        if (activeTextLayers.has(textLayerDiv)) {
          textLayerDiv.classList.add("selecting");
        } else {
          resetEndOfContent(endDiv, textLayerDiv);
        }
      });

      const firstLayer = textLayers.values().next().value;
      if (!firstLayer) return;

      isFirefox ??=
        getComputedStyle(firstLayer).getPropertyValue("-moz-user-select") === "none";
      if (isFirefox) return;

      const range = selection.getRangeAt(0);
      const modifyStart =
        prevRange &&
        (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0 ||
          range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0);

      let anchor: Node = modifyStart ? range.startContainer : range.endContainer;
      if (anchor.nodeType === Node.TEXT_NODE) {
        anchor = anchor.parentNode!;
      }

      const parentTextLayer = (anchor as Element).parentElement?.closest(".textLayer") as
        | HTMLElement
        | null;
      const endDiv = parentTextLayer ? textLayers.get(parentTextLayer) : undefined;
      if (endDiv && parentTextLayer) {
        endDiv.style.width = parentTextLayer.style.width;
        endDiv.style.height = parentTextLayer.style.height;
        (anchor as Element).parentElement!.insertBefore(
          endDiv,
          modifyStart ? anchor : (anchor as Element).nextSibling,
        );
      }

      prevRange = range.cloneRange();
    },
    { signal },
  );
}

/** Append endOfContent and wire selection listeners. Returns cleanup. */
export function attachPdfTextLayerSelection(textLayer: HTMLElement): () => void {
  const endOfContent = document.createElement("div");
  endOfContent.className = "endOfContent";
  textLayer.append(endOfContent);

  textLayer.addEventListener("mousedown", () => {
    textLayer.classList.add("selecting");
  });

  // DOM-order copy text instead of the browser's layout-derived (gap-prone) one.
  textLayer.addEventListener("copy", (event) => {
    const text = document.getSelection()?.toString().replace(/\0/g, "") ?? "";
    event.clipboardData?.setData("text/plain", text);
    event.preventDefault();
    event.stopPropagation();
  });

  textLayers.set(textLayer, endOfContent);
  ensureGlobalSelectionListener();

  return () => {
    textLayers.delete(textLayer);
    endOfContent.remove();
    textLayer.classList.remove("selecting");
    if (textLayers.size === 0) {
      selectionAbort?.abort();
      selectionAbort = null;
    }
  };
}
