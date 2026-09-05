/**
 * pdf.js EOL spans are scaleX-stretched to the PDF-reported line width (canvasWidth).
 * Trailing whitespace in those spans is invisible on the canvas but still widens the
 * selection box — trim it and rescale using measureText, not a char-count guess.
 */
export function trimPdfTextLayerEOLWhitespace(textLayer: HTMLElement): void {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  for (const span of Array.from(textLayer.querySelectorAll("span"))) {
    const next = span.nextSibling;
    if (next?.nodeName !== "BR") continue;

    const text = span.textContent ?? "";
    const trimmed = text.replace(/\s+$/, "");
    if (trimmed.length === text.length) continue;

    if (!trimmed) {
      span.style.userSelect = "none";
      span.style.pointerEvents = "none";
      continue;
    }

    const style = getComputedStyle(span);
    ctx.font = `${style.fontSize} ${style.fontFamily}`;

    const fullWidth = ctx.measureText(text).width;
    const trimWidth = ctx.measureText(trimmed).width;
    if (fullWidth <= 0 || trimWidth <= 0) continue;

    span.textContent = trimmed;

    const transform = span.style.transform;
    const scaleMatch = /scaleX\(([^)]+)\)/.exec(transform);
    if (scaleMatch) {
      const scaleX = Number.parseFloat(scaleMatch[1]);
      if (Number.isFinite(scaleX)) {
        const nextScale = scaleX * (trimWidth / fullWidth);
        span.style.transform = transform.replace(
          /scaleX\([^)]+\)/,
          `scaleX(${nextScale})`,
        );
      }
    }
  }
}
