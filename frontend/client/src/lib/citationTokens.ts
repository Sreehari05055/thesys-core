import type { Source } from "@/lib/chatMessages";

export type CitationTokenContext = {
  sourceMap: Map<string, number>;
  deletedSourceIds?: Set<string>;
  knownSourceIds?: Set<string>;
  allSourcesById?: Map<string, Source>;
  globalSourceNumberById?: Map<string, number>;
  sourcesIndexReady?: boolean;
  /** Replace unresolved known source ids instead of showing raw ids. */
  maskUnresolvedIds?: boolean;
};

function citationHtml(
  className: string,
  label: string,
  sourceId?: string,
  extraAttrs?: Record<string, string>,
): string {
  const attrs = [
    sourceId ? `data-source-id="${sourceId}"` : "",
    ...Object.entries(extraAttrs ?? {}).map(([k, v]) => `${k}="${v}"`),
  ]
    .filter(Boolean)
    .join(" ");
  return `<cite class="inline-citation ${className}"${attrs ? ` ${attrs}` : ""}>${label}</cite>`;
}

function resolveCitationTokenToSourceId(
  trimmed: string,
  ctx: CitationTokenContext,
): string | null {
  if (ctx.deletedSourceIds?.has(trimmed)) return null;

  const numericLabel = /^\d{1,4}$/.test(trimmed) ? Number.parseInt(trimmed, 10) : NaN;
  if (Number.isFinite(numericLabel) && numericLabel >= 1) {
    if (ctx.globalSourceNumberById) {
      for (const [id, num] of Array.from(ctx.globalSourceNumberById.entries())) {
        if (num === numericLabel) return id;
      }
    }
    for (const [id, idx] of Array.from(ctx.sourceMap.entries())) {
      const num = ctx.globalSourceNumberById?.get(id) ?? idx + 1;
      if (num === numericLabel) return id;
    }
  }

  if (ctx.allSourcesById?.has(trimmed)) return trimmed;
  if (ctx.sourceMap.has(trimmed)) return trimmed;
  if (ctx.knownSourceIds?.has(trimmed)) return trimmed;

  return null;
}

function resolveCitationToken(
  trimmed: string,
  ctx: CitationTokenContext,
): string | null {
  if (ctx.deletedSourceIds?.has(trimmed)) {
    return citationHtml("inline-citation--deleted", "[deleted]", undefined, {
      "data-deleted": "true",
    });
  }

  const sourceId = resolveCitationTokenToSourceId(trimmed, ctx);
  if (!sourceId) return null;

  const globalNum = ctx.globalSourceNumberById?.get(sourceId);
  const localIdx = ctx.sourceMap.get(sourceId);
  const num = globalNum ?? (localIdx !== undefined ? localIdx + 1 : undefined);
  if (num === undefined) {
    if (ctx.maskUnresolvedIds) {
      return citationHtml("inline-citation--pending", "…", sourceId, { title: "Citation" });
    }
    return null;
  }

  return citationHtml("", `[${num}]`, sourceId);
}

/** LLM prose often says "Source 1" — normalize to bracket form before citation rendering. */
function normalizeProseSourceLabels(markdown: string): string {
  return markdown.replace(/\b[Ss]ources?\s+(\d+)\b/g, (_, num: string) => `[${num}]`);
}

export function applyCitationTokensBeforeMarkdown(
  markdown: string,
  ctx: CitationTokenContext,
): string {
  const ctxWithMask = { ...ctx, maskUnresolvedIds: true };
  const normalized = normalizeProseSourceLabels(markdown);
  return normalized.replace(/\[([^\]]+)\]/g, (match, id: string) => {
    const trimmed = id.trim();
    return resolveCitationToken(trimmed, ctxWithMask) ?? match;
  });
}

export function buildCitationTokenContext(
  sources: Source[] | undefined,
  options: Omit<CitationTokenContext, "sourceMap">,
): CitationTokenContext {
  const sourceMap = new Map<string, number>();
  sources?.forEach((src, i) => sourceMap.set(src.id, i));
  return { sourceMap, ...options };
}

/** Source IDs the LLM cited in prose, in order of first appearance. */
export function extractCitedSourceIds(
  markdown: string,
  ctx: CitationTokenContext,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const normalized = normalizeProseSourceLabels(markdown);

  normalized.replace(/\[([^\]]+)\]/g, (_, id: string) => {
    const trimmed = id.trim();
    const sourceId = resolveCitationTokenToSourceId(trimmed, ctx);
    if (sourceId && !seen.has(sourceId)) {
      seen.add(sourceId);
      ids.push(sourceId);
    }
    return id;
  });

  return ids;
}
