export type ReaderPassageSelection = {
  id: string;
  /** Full text sent to the model. */
  text: string;
  /** Short label for chips; falls back to truncated `text`. */
  preview?: string;
  page: number;
  bboxes: [number, number, number, number][];
};

export const MAX_READER_PASSAGES = 5;

export function createPassageId(): string {
  return `passage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getTextLayerFromNode(node: Node | null): HTMLElement | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLElement && current.classList.contains("textLayer")) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

export async function capturePassageFromSelection(
  selection: Selection,
  getPdfPage: (page: number) => Promise<{ view: number[] } | null>,
  getCanvas: (page: number) => HTMLCanvasElement | undefined,
): Promise<ReaderPassageSelection | null> {
  const text = selection.toString().trim();
  if (!text || selection.rangeCount === 0) return null;

  const textLayer = getTextLayerFromNode(selection.anchorNode);
  if (!textLayer) return null;

  const page = Number.parseInt(textLayer.dataset.page ?? "", 10);
  if (!Number.isFinite(page) || page < 1) return null;

  const pageWrapper = textLayer.parentElement;
  const canvas = getCanvas(page);
  if (!pageWrapper || !canvas) return null;

  const pdfPage = await getPdfPage(page);
  if (!pdfPage) return null;

  const cssWidth = Number.parseFloat(canvas.style.width);
  const cssHeight = Number.parseFloat(canvas.style.height);
  if (!cssWidth || !cssHeight) return null;

  const pdfWidth = pdfPage.view[2]! - pdfPage.view[0]!;
  const pdfHeight = pdfPage.view[3]! - pdfPage.view[1]!;
  const scaleX = pdfWidth / cssWidth;
  const scaleY = pdfHeight / cssHeight;

  const wrapperRect = pageWrapper.getBoundingClientRect();
  const range = selection.getRangeAt(0);
  const bboxes: [number, number, number, number][] = [];

  for (const rect of Array.from(range.getClientRects())) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    const left = rect.left - wrapperRect.left;
    const top = rect.top - wrapperRect.top;
    bboxes.push([
      left * scaleX,
      top * scaleY,
      (left + rect.width) * scaleX,
      (top + rect.height) * scaleY,
    ]);
  }

  if (bboxes.length === 0) return null;

  return {
    id: createPassageId(),
    text,
    page,
    bboxes,
  };
}

export function buildReaderQuestionFromPassages(
  userText: string,
  passages: ReaderPassageSelection[],
): string {
  const trimmed = userText.trim();
  if (passages.length === 0) return trimmed;

  const blocks = passages.map((passage, index) => {
    const quoted = passage.text.trim().replace(/"/g, '\\"');
    if (passages.length === 1) {
      return `About this passage:\n\n"${quoted}"`;
    }
    return `Passage ${index + 1} (page ${passage.page}):\n"${quoted}"`;
  });

  const prefix = blocks.join("\n\n");
  return trimmed ? `${prefix}\n\n${trimmed}` : prefix;
}

function unescapeQuotedPassage(quoted: string): string {
  return quoted.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

export type ParsedReaderUserMessage = {
  passages: Array<{ text: string; page: number }>;
  question: string;
};

/** Split API-shaped reader questions back into chip passages + typed question. */
export function parseReaderUserMessage(text: string): ParsedReaderUserMessage | null {
  const raw = text.trim();
  if (!raw) return null;

  const single = raw.match(/^About this passage:\n\n"((?:\\.|[^"\\])*)"(?:\n\n([\s\S]*))?$/);
  if (single) {
    return {
      passages: [{ text: unescapeQuotedPassage(single[1] ?? ""), page: 0 }],
      question: (single[2] ?? "").trim(),
    };
  }

  const multiRe = /^Passage \d+ \(page (\d+)\):\n"((?:\\.|[^"\\])*)"/gm;
  const passages: Array<{ text: string; page: number }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = multiRe.exec(raw)) !== null) {
    if (passages.length === 0 && match.index !== 0) return null;
    if (passages.length > 0) {
      const between = raw.slice(lastIndex, match.index);
      if (between !== "\n\n") return null;
    }
    passages.push({
      page: Number.parseInt(match[1] ?? "0", 10) || 0,
      text: unescapeQuotedPassage(match[2] ?? ""),
    });
    lastIndex = multiRe.lastIndex;
  }

  if (passages.length === 0) return null;

  const rest = raw.slice(lastIndex);
  if (rest && !rest.startsWith("\n\n")) return null;
  return { passages, question: rest.trim() };
}

export function passageChipLabel(passage: {
  text: string;
  preview?: string;
  page?: number;
}): string {
  const preview = passage.preview?.trim();
  if (preview) return preview;
  const text = passage.text.trim();
  // Tables/code blocks: show first line in the blob, not the whole excerpt.
  const firstLine = text.split(/\n/, 1)[0]?.trim() || text;
  if (firstLine.length <= 72) return firstLine;
  return `${firstLine.slice(0, 72)}…`;
}

export function isDuplicatePassage(
  passages: ReaderPassageSelection[],
  candidate: ReaderPassageSelection,
): boolean {
  return passages.some(
    (passage) =>
      passage.page === candidate.page &&
      passage.text.trim() === candidate.text.trim(),
  );
}

// ponytail: runnable check — upgrade path: vitest if parse rules grow
if (import.meta.env.DEV && typeof console !== "undefined") {
  const built = buildReaderQuestionFromPassages("why?", [
    { id: "p1", text: '| a | b |\n|---|---|\n| 1 | 2 |', page: 2, bboxes: [[0, 0, 1, 1]] },
  ]);
  const parsed = parseReaderUserMessage(built);
  console.assert(parsed?.question === "why?");
  console.assert(parsed?.passages[0]?.text.includes("| 1 | 2 |"));
  console.assert(passageChipLabel({ text: parsed!.passages[0]!.text }) === "| a | b |");
}
