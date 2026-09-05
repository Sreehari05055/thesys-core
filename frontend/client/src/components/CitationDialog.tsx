import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/hooks/use-toast";
import type { Citation, CitationDialogData } from "@/types/chat";
import { isCitationBatchResponse } from "@/types/chat";

type CitationDialogProps = {
  data: CitationDialogData;
  onClose: () => void;
};

function linkifyCitation(text: string): string {
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  if (text.includes("<a ")) return text;
  return text.replace(
    urlRegex,
    (url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">${url}</a>`,
  );
}

function citationForStyle(citations: Citation[], style: string): Citation | undefined {
  return citations.find((c) => c.style_shortname === style);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>?/gm, "");
}

export function CitationDialog({ data, onClose }: CitationDialogProps) {
  const isBatch = isCitationBatchResponse(data);
  const { toast } = useToast();

  const styleOptions = useMemo(() => {
    if (isBatch) {
      const seen = new Set<string>();
      const styles: Citation[] = [];
      for (const result of data.results) {
        for (const citation of result.citations) {
          if (!seen.has(citation.style_shortname)) {
            seen.add(citation.style_shortname);
            styles.push(citation);
          }
        }
      }
      return styles;
    }
    return data.citations;
  }, [data, isBatch]);

  const [activeStyle, setActiveStyle] = useState(styleOptions[0]?.style_shortname || "");

  useEffect(() => {
    const available = styleOptions.map((c) => c.style_shortname);
    setActiveStyle((current) => {
      if (available.length === 0) return "";
      if (current && available.includes(current)) return current;
      return available[0];
    });
  }, [styleOptions]);

  const activeCitation = !isBatch
    ? data.citations.find((c) => c.style_shortname === activeStyle)
    : undefined;

  const copyCitation = async (htmlContent: string, plainText: string) => {
    try {
      const textBlob = new Blob([plainText], { type: "text/plain" });
      const htmlBlob = new Blob([htmlContent], { type: "text/html" });
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": textBlob,
          "text/html": htmlBlob,
        }),
      ]);
      toast({ title: "Copied", description: "Citation copied with active links." });
    } catch {
      await navigator.clipboard.writeText(plainText);
      toast({ title: "Copied", description: "Citation copied as plain text." });
    }
  };

  const handleCopy = async () => {
    if (isBatch) {
      const blocks: string[] = [];
      const plainBlocks: string[] = [];
      for (const result of data.results) {
        const citation = citationForStyle(result.citations, activeStyle);
        if (citation) {
          blocks.push(linkifyCitation(citation.citation));
          plainBlocks.push(stripHtml(citation.citation));
        }
      }
      if (blocks.length === 0) return;
      await copyCitation(blocks.join("<br/><br/>"), plainBlocks.join("\n\n"));
      return;
    }

    if (!activeCitation) return;
    await copyCitation(
      linkifyCitation(activeCitation.citation),
      stripHtml(activeCitation.citation),
    );
  };

  const title = isBatch ? "Export bibliography" : "Export citation";
  const subtitle = isBatch
    ? `${data.results.length} paper${data.results.length === 1 ? "" : "s"} · choose a reference style`
    : "Choose a reference style";

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
      role="presentation"
      data-testid="citation-dialog-backdrop"
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden min-h-0 animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
        data-testid="citation-dialog"
      >
        <div className="flex shrink-0 items-center justify-between mb-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground truncate max-w-md">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {styleOptions.length > 0 && (
          <div
            className="mb-4 shrink-0 rounded-xl border border-border bg-muted/50 p-2"
            role="tablist"
            aria-label="Citation styles"
          >
            <div className="flex flex-wrap gap-1.5">
              {styleOptions.map((c) => (
                <button
                  key={c.style_shortname}
                  type="button"
                  role="tab"
                  aria-selected={activeStyle === c.style_shortname}
                  onClick={() => setActiveStyle(c.style_shortname)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-tight transition-all ${
                    activeStyle === c.style_shortname
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  {c.style_shortname.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 bg-muted/40 rounded-xl border border-border p-6 mb-4 overflow-y-auto rag-scrollbar min-h-[140px] group relative">
          {isBatch ? (
            <div className="space-y-6">
              {data.results.map((result, index) => {
                const citation = citationForStyle(result.citations, activeStyle);
                return (
                  <div key={`${result.source}-${index}`} className="space-y-2">
                    <div className="text-[11px] font-semibold text-foreground/80 truncate" title={result.source}>
                      {result.source}
                    </div>
                    {result.error ? (
                      <p className="text-sm text-destructive/90 italic">{result.error}</p>
                    ) : citation ? (
                      <div
                        className="text-sm text-foreground leading-relaxed font-sans"
                        dangerouslySetInnerHTML={{ __html: linkifyCitation(citation.citation) }}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No citation for this style</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : activeCitation ? (
            <div className="space-y-4">
              <div className="text-[10px] font-bold text-primary/80 uppercase tracking-widest">
                {activeCitation.style_fullname}
              </div>
              <div
                className="text-base text-foreground leading-relaxed font-sans"
                dangerouslySetInnerHTML={{ __html: linkifyCitation(activeCitation.citation) }}
              />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-8 italic">No citation selected</div>
          )}
        </div>

        <div className="flex shrink-0 flex-col sm:flex-row justify-between items-center gap-4 pt-2">
          <button
            type="button"
            onClick={handleCopy}
            disabled={isBatch ? styleOptions.length === 0 : !activeCitation}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-foreground hover:bg-accent border border-border transition-all disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            {isBatch ? "Copy all" : "Copy Rich Text"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-8 py-2.5 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:brightness-95 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
