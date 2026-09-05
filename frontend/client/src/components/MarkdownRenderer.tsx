import { useEffect, useMemo, useRef } from "react";
import { marked } from "marked";
import "katex/dist/katex.min.css";
import type { Source } from "@/lib/chatMessages";
import type { ExternalPaper } from "@/lib/externalPaper";
import {
  applyCitationTokensBeforeMarkdown,
  buildCitationTokenContext,
} from "@/lib/citationTokens";
import { applyExternalLinkTokens } from "@/lib/externalLinkTokens";
import { injectMathIntoHtml, prepareMarkdownWithMath } from "@/lib/markdownMath";

marked.use({
  breaks: true,
  gfm: true,
  renderer: {
    link(token) {
      const text = this.parser.parseInline(token.tokens);
      let out = `<a href="${token.href}"`;
      if (token.title) out += ` title="${token.title}"`;
      out += ` target="_blank" rel="noopener noreferrer">${text}</a>`;
      return out;
    },
  },
});

type MarkdownRendererProps = {
  markdown: string;
  sources?: Source[];
  externalPapers?: ExternalPaper[];
  discoverMode?: boolean;
  onSourceClick?: (source: Source) => void;
  onExternalPaperClick?: (paper: ExternalPaper) => void;
  deletedSourceIds?: Set<string>;
  knownSourceIds?: Set<string>;
  allSourcesById?: Map<string, Source>;
  globalSourceNumberById?: Map<string, number>;
  sourcesIndexReady?: boolean;
};

export function MarkdownRenderer({
  markdown,
  sources,
  externalPapers,
  discoverMode = false,
  onSourceClick,
  onExternalPaperClick,
  deletedSourceIds,
  knownSourceIds,
  allSourcesById,
  globalSourceNumberById,
  sourcesIndexReady,
}: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSourceClickRef = useRef(onSourceClick);
  const onExternalPaperClickRef = useRef(onExternalPaperClick);
  const sourcesRef = useRef(sources);
  const externalPapersRef = useRef(externalPapers);
  const allSourcesByIdRef = useRef(allSourcesById);

  onSourceClickRef.current = onSourceClick;
  onExternalPaperClickRef.current = onExternalPaperClick;
  sourcesRef.current = sources;
  externalPapersRef.current = externalPapers;
  allSourcesByIdRef.current = allSourcesById;

  const citationCtx = useMemo(
    () =>
      buildCitationTokenContext(sources, {
        deletedSourceIds,
        knownSourceIds,
        allSourcesById,
        globalSourceNumberById,
        sourcesIndexReady,
      }),
    [
      sources,
      deletedSourceIds,
      knownSourceIds,
      allSourcesById,
      globalSourceNumberById,
      sourcesIndexReady,
    ],
  );

  const html = useMemo(() => {
    const { markdown: withMathSlots, slots } = prepareMarkdownWithMath(
      markdown,
      knownSourceIds,
    );
    const withCitations = applyCitationTokensBeforeMarkdown(withMathSlots, citationCtx);
    const withExternalLinks = applyExternalLinkTokens(
      withCitations,
      externalPapers,
      discoverMode,
    );
    const parsed = marked.parse(withExternalLinks, { async: false });
    const raw = typeof parsed === "string" ? parsed : "";
    return injectMathIntoHtml(raw, slots);
  }, [markdown, knownSourceIds, citationCtx, externalPapers, discoverMode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onClick = (event: MouseEvent) => {
      const cite = (event.target as HTMLElement | null)?.closest<HTMLElement>(".inline-citation");
      if (cite) {
        const sourceHandler = onSourceClickRef.current;
        if (!sourceHandler) return;
        if (cite.dataset.deleted === "true") return;
        if (cite.classList.contains("inline-citation--pending")) return;

        const sourceId = cite.dataset.sourceId;
        const src = sourceId
          ? allSourcesByIdRef.current?.get(sourceId)
          : sourcesRef.current?.[Number.parseInt(cite.dataset.sourceIdx ?? "", 10)];
        if (!src) return;

        event.preventDefault();
        event.stopPropagation();
        sourceHandler(src);
        return;
      }

      const external = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        ".inline-external-link",
      );
      if (!external) return;

      const paperHandler = onExternalPaperClickRef.current;
      if (!paperHandler) return;

      const paperId = external.dataset.paperId;
      const paper = externalPapersRef.current?.find((p) => p.id === paperId);
      if (!paper) return;

      event.preventDefault();
      event.stopPropagation();
      paperHandler(paper);
    };

    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
  }, [html]);

  return (
    <div
      ref={containerRef}
      className="rag-markdown prose prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
      data-testid="text-bot-message-markdown"
    />
  );
}

