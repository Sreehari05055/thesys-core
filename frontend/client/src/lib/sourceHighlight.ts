import type { Source } from "@/lib/chatMessages";
import type { PdfBbox } from "@/lib/pdfHighlightLayout";

export type SourceJumpTarget = {
  page: number;
  bboxes: PdfBbox[];
};

export function sourceJumpTarget(source: Source, page?: number): SourceJumpTarget {
  const targetPage = page ?? source.pages?.[0] ?? source.precise_bboxes?.[0]?.page ?? source.bboxes?.[0]?.page ?? 1;
  const allBboxes = (source.precise_bboxes?.length ? source.precise_bboxes : source.bboxes ?? [])
    .filter((bbox) => Array.isArray(bbox.box) && bbox.box.length === 4)
    .map((bbox) => ({
      box: bbox.box,
      page_width: bbox.page_width,
      page_height: bbox.page_height,
      page: bbox.page,
    }));

  let onPage = allBboxes.filter((bbox) => bbox.page === targetPage);
  if (onPage.length === 0) onPage = allBboxes;

  return {
    page: targetPage,
    bboxes: onPage.map(({ box, page_width, page_height }) => ({
      box,
      page_width,
      page_height,
    })),
  };
}
