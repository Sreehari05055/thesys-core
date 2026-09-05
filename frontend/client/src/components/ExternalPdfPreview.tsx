import { useEffect, useRef, useState } from "react";
import { API_URLS } from "@/config";
import { getApiErrorMessage } from "@/lib/apiErrors";
import { apiFetch } from "@/lib/apiFetch";
import type { ExternalPaper } from "@/lib/externalPaper";
import { pdfjs } from "@/lib/pdfjsSetup";

/** Slight zoom within the preview box (width clipped, top-aligned). */
const PREVIEW_ZOOM = 1.25;

type ExternalPdfPreviewProps = {
  sessionId: string;
  paper: ExternalPaper;
  pageNumber?: number;
};

export function ExternalPdfPreview({
  sessionId,
  paper,
  pageNumber = 1,
}: ExternalPdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!paper.pdf_verified || !sessionId.trim()) {
      setLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;
    let pdfDoc: pdfjs.PDFDocumentProxy | null = null;

    async function loadPreview() {
      setLoading(true);
      setError(null);

      try {
        if (!paper.pdf_url) {
          throw new Error("No verified PDF URL for this paper.");
        }

        const fileUrl = API_URLS.sessionFile(paper.id, {
          url: paper.pdf_url,
          pageNumber,
        });
        const res = await apiFetch(fileUrl, {}, sessionId);
        if (!res.ok) {
          const message = await getApiErrorMessage(res, "Could not load PDF preview.");
          throw new Error(message || `HTTP ${res.status}`);
        }

        const arrayBuffer = await res.arrayBuffer();
        pdfDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise;

        if (!isMounted) {
          pdfDoc.destroy();
          return;
        }

        const targetPage = Math.min(Math.max(pageNumber, 1), pdfDoc.numPages);
        const page = await pdfDoc.getPage(targetPage);
        const containerWidth = Math.max((containerRef.current?.clientWidth ?? 280) - 24, 120);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport }).promise;

        if (isMounted) setLoading(false);
      } catch (err) {
        console.error("Error loading external PDF preview:", err);
        pdfDoc?.destroy();
        pdfDoc = null;
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : "Failed to load PDF preview.",
          );
          setLoading(false);
        }
      }
    }

    void loadPreview();

    return () => {
      isMounted = false;
      pdfDoc?.destroy();
    };
  }, [pageNumber, paper.id, paper.pdf_url, paper.pdf_verified, sessionId]);

  if (!paper.pdf_verified) return null;

  return (
    <div
      ref={containerRef}
      className="relative min-h-[220px] flex-1 overflow-hidden bg-black/5"
      data-testid="external-pdf-preview"
    >
      <div
        className="absolute inset-0 overflow-hidden p-3"
        style={{
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 78%, transparent 100%)",
          maskImage: "linear-gradient(to bottom, black 0%, black 78%, transparent 100%)",
        }}
      >
        <canvas
          ref={canvasRef}
          className="block w-full origin-top border border-border bg-white shadow-md"
          style={{ transform: `scale(${PREVIEW_ZOOM})`, transformOrigin: "top center" }}
        />
      </div>

      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60">
          <div className="flex flex-col items-center gap-2">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary/40 border-t-primary" />
            <span className="text-[11px] text-muted-foreground">Loading preview…</span>
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 p-4 text-center">
          <p className="text-[12px] text-muted-foreground">{error}</p>
        </div>
      )}
    </div>
  );
}
