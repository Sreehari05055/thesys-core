import katex from "katex";

const LATEX_SIGNAL =
  /\\[a-zA-Z]+|[_^{}]|\\mid|\\propto|\\frac|\\max|\\min|\\sum|\\left|\\right|\\hat|\\lambda|\\mathcal|[∝∣≤≥±∞]/;

const MATH_SLOT_RE = /@@MATH_SLOT_(\d+)@@/g;

function looksLikeLatex(content: string): boolean {
  const t = content.trim();
  if (t.length < 3) return false;
  if (/^\d{1,4}$/.test(t)) return false;
  if (/^\[?deleted\]?$/i.test(t)) return false;
  return LATEX_SIGNAL.test(t);
}

/** Exact source-id match only — no shape heuristics. */
function peelKnownSourceIds(
  tex: string,
  knownSourceIds?: Set<string>,
): { tex: string; citations: string[] } {
  if (!knownSourceIds?.size) return { tex: tex.trim(), citations: [] };

  let body = tex.trim();
  const citations: string[] = [];

  for (const id of Array.from(knownSourceIds)) {
    const sub = `_{${id}}`;
    if (body.endsWith(sub)) {
      body = body.slice(0, -sub.length).trimEnd();
      citations.push(id);
      break;
    }
  }

  const lines = body.split("\n");
  const last = lines.at(-1)?.trim() ?? "";
  if (lines.length > 1 && knownSourceIds.has(last)) {
    lines.pop();
    body = lines.join("\n").trim();
    citations.push(last);
  }

  return { tex: body, citations };
}

function citeSuffix(citations: string[]): string {
  return citations.map((id) => `[${id}]`).join("");
}

function normalizeLlmMathDelimiters(markdown: string, knownSourceIds?: Set<string>): string {
  let out = markdown;

  out = out.replace(/```(?:latex|math)?\s*\n([\s\S]*?)```/gi, (match, body: string) => {
    const { tex, citations } = peelKnownSourceIds(body, knownSourceIds);
    if (!looksLikeLatex(tex)) return citations.length ? citeSuffix(citations) : match;
    return `$$${tex}$$${citations.length ? `\n${citeSuffix(citations)}\n` : ""}`;
  });

  out = out.replace(/\\\[([\s\S]*?)\\\]/g, (_, tex) => `$$${tex}$$`);
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_, tex) => `$${tex}$`);

  out = out.replace(/(?:^|\n)\[\s*([\s\S]*?)\s*\](?!\()/g, (match, raw: string) => {
    const trimmed = raw.trim();
    if (knownSourceIds?.has(trimmed)) return match;
    const { tex, citations } = peelKnownSourceIds(raw, knownSourceIds);
    if (!looksLikeLatex(tex)) return citations.length ? citeSuffix(citations) : match;
    return `\n$$${tex}$$${citations.length ? `\n${citeSuffix(citations)}\n` : ""}`;
  });

  return out;
}

function renderMath(tex: string, displayMode: boolean): string {
  const html = katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    strict: "ignore",
    trust: true,
  });
  return displayMode
    ? `<div class="math-display">${html}</div>`
    : `<span class="math-inline">${html}</span>`;
}

const BLOCK_MATH_RE = /\$\$([\s\S]*?)\$\$/g;
const INLINE_MATH_RE = /(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/g;

function mathSlot(i: number): string {
  return `@@MATH_SLOT_${i}@@`;
}

export function prepareMarkdownWithMath(
  markdown: string,
  knownSourceIds?: Set<string>,
): {
  markdown: string;
  slots: string[];
} {
  const slots: string[] = [];
  let md = normalizeLlmMathDelimiters(markdown, knownSourceIds);

  md = md.replace(BLOCK_MATH_RE, (_, raw: string) => {
    const { tex, citations } = peelKnownSourceIds(raw, knownSourceIds);
    if (!tex) return citations.length ? `\n${citeSuffix(citations)}\n` : "";
    const i = slots.length;
    slots.push(renderMath(tex, true));
    return `\n\n${mathSlot(i)}\n\n${citations.length ? `${citeSuffix(citations)}\n` : ""}`;
  });

  md = md.replace(INLINE_MATH_RE, (_, raw: string) => {
    const { tex, citations } = peelKnownSourceIds(raw, knownSourceIds);
    if (!tex) return citations.length ? citeSuffix(citations) : "";
    const i = slots.length;
    slots.push(renderMath(tex, false));
    return `${mathSlot(i)}${citations.length ? ` ${citeSuffix(citations)}` : ""}`;
  });

  return { markdown: md, slots };
}

export function injectMathIntoHtml(html: string, slots: string[]): string {
  return html.replace(MATH_SLOT_RE, (_, index: string) => slots[Number(index)] ?? "");
}
