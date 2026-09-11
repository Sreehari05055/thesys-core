import os
import re
from collections import defaultdict
from functools import lru_cache
import ftfy
from cleantext import clean
from docling.datamodel.accelerator_options import AcceleratorDevice, AcceleratorOptions
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.types.doc import CodeItem, DocItemLabel, PictureItem, SectionHeaderItem, TableItem
from docling_core.types.doc.document import CodeItem
from app import logger
from app.core.config import admin
from docling_core.types.doc.base import BoundingBox, CoordOrigin
from docling_core.types.doc.page import TextCellUnit

_SKIP_LABELS = frozenset(
    {
        DocItemLabel.PAGE_HEADER,
        DocItemLabel.PAGE_FOOTER,
        DocItemLabel.DOCUMENT_INDEX,
    }
)

def clean_for_embeddings(text: str) -> str:
    """Normalize mojibake and collapse runaway whitespace before embedding."""
    cleaned = clean(
        ftfy.fix_text(text),
        fix_unicode=True,
        to_ascii=False,
        lower=False,
        no_line_breaks=False,
        no_urls=False,
        no_emails=False,
        no_phone_numbers=False,
        no_numbers=False,
        no_punct=False,
    )
    cleaned = re.sub(r"\n{4,}", "\n\n", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    return cleaned.strip()

@lru_cache(maxsize=1)
def _build_converter() -> DocumentConverter:
    accel = AcceleratorOptions(
        device=AcceleratorDevice.AUTO,
        num_threads=max(1, os.cpu_count() or 4),
    )
    opts = PdfPipelineOptions(
        do_ocr=False,
        do_table_structure=True,
        generate_parsed_pages=True,
        accelerator_options=accel,
    )
    opts.table_structure_options.mode = TableFormerMode.ACCURATE
    return DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)}
    )

class PDFExtractor:
    """Extract PDF structure via Docling (reading order, tags, table markdown)."""

    @staticmethod
    def _converter() -> DocumentConverter:
        return _build_converter()

    @staticmethod
    def _caption_refs_to_skip(doc) -> set[str]:
        refs: set[str] = set()
        for item, _level in doc.iterate_items():
            if isinstance(item, (TableItem, PictureItem, CodeItem)):
                for cap in item.captions:
                    refs.add(cap.cref)
        return refs

    @staticmethod
    def _bbox_tuple(
        item, page_height: float | None = None
    ) -> tuple[float, float, float, float] | None:
        prov = getattr(item, "prov", None) or []
        if not prov:
            return None
        bbox = prov[0].bbox
        if page_height:
            return bbox.to_top_left_origin(page_height).as_tuple()
        return bbox.as_tuple()

    @staticmethod
    def _primary_page(item) -> int | None:
        prov = getattr(item, "prov", None) or []
        return int(prov[0].page_no) if prov else None
    
    @staticmethod
    def _cell_box_tuple(cell, page_height: float | None) -> tuple[float, float, float, float] | None:
        bb = cell.to_bounding_box()
        if page_height:
            bb = bb.to_top_left_origin(page_height)
        return bb.as_tuple()

    @staticmethod
    def _lines_in_bbox(parsed, box: tuple, page_height: float | None) -> list:
        if parsed is None or not box or len(box) < 4:
            return []
        x0, y0, x1, y1 = (float(v) for v in box[:4])
        target = BoundingBox(l=x0, t=y0, r=x1, b=y1, coord_origin=CoordOrigin.TOPLEFT)
        out = []
        for cell in parsed.get_cells_in_bbox(TextCellUnit.LINE, target):
            text = clean_for_embeddings((cell.text or "").strip())
            if not text:
                continue
            out.append({
                "text": text,
                "box": PDFExtractor._cell_box_tuple(cell, page_height),
            })
        return out

    @staticmethod
    def _page_bboxes(item, page_heights: dict | None = None) -> list[dict]:
        """One highlight box per Docling provenance (wrapping text has a box on each page)."""
        out = []
        for prov in getattr(item, "prov", None) or []:
            page_no = int(prov.page_no)
            ph = (page_heights or {}).get(page_no)
            bbox = prov.bbox
            box = bbox.to_top_left_origin(ph).as_tuple() if ph else bbox.as_tuple()
            out.append({"page": page_no, "box": box})
        return out

    def _item_content(self, item, doc) -> str:
        if isinstance(item, PictureItem):
            return item.caption_text(doc).strip()
        if getattr(item, "label", None) == DocItemLabel.FORMULA:
            return (getattr(item, "orig", None) or getattr(item, "text", None) or "").strip()
        return clean_for_embeddings((getattr(item, "text", None) or "").strip())

    def _item_to_element(
        self, item, doc, page_height: float | None = None, page_heights: dict | None = None, parsed_pages: dict | None = None,
    ) -> tuple[dict, int] | None:
        label = getattr(item, "label", None)
        if label in _SKIP_LABELS:
            return None

        content = self._item_content(item, doc)
        if not content:
            return None

        page_no = self._primary_page(item)
        if page_no is None:
            return None

        tag = label.value if label is not None else type(item).__name__
        level = int(item.level) if isinstance(item, SectionHeaderItem) else 0
        page_bboxes = self._page_bboxes(item, page_heights)
        lines = []
        for entry in page_bboxes:
            p = entry["page"]
            ph = (page_heights or {}).get(p)
            parsed = (parsed_pages or {}).get(p)
            for line in self._lines_in_bbox(parsed, entry.get("box"), ph):
                lines.append({**line, "page": p})

        element = {
            "content": content,
            "level": level,
            "tag": tag,
            "type": tag,
            "bbox": self._bbox_tuple(item, page_height),
            "page_bboxes": self._page_bboxes(item, page_heights),
            "lines": lines,
        }
        return element, page_no

    def _table_to_element(
        self, item: TableItem, doc, page_height: float | None = None
    ) -> dict | None:
        content = (item.export_to_markdown(doc=doc) or "").strip()
        if not content:
            return None
        page_no = self._primary_page(item)
        if page_no is None:
            return None
        return {
            "content": content,
            "level": 0,
            "tag": "table",
            "type": "table",
            "bbox": self._bbox_tuple(item, page_height),
            "page": page_no,
        }

    def _code_to_element(
        self, item: CodeItem, page_height: float | None = None
    ) -> dict | None:
        content = (getattr(item, "text", None) or getattr(item, "orig", None) or "").strip()
        if not content:
            return None
        page_no = self._primary_page(item)
        if page_no is None:
            return None
        return {
            "content": content,
            "level": 0,
            "tag": "code",
            "type": "code",
            "bbox": self._bbox_tuple(item, page_height),
            "page": page_no,
        }

    def extract(self, filepath):
        try:
            logger.info("Extracting PDF with Docling: %s", filepath)
            doc_title = os.path.basename(filepath)
            max_pages = admin.rag.max_pdf_pages

            kwargs = {}
            if max_pages > 0:
                kwargs["page_range"] = (1, max_pages)

            result = self._converter().convert(filepath, **kwargs)
            doc = result.document
            skip_caption_refs = self._caption_refs_to_skip(doc)

            page_data = defaultdict(lambda: {"elements": []})
            page_heights: dict[int, float] = {}
            parsed_pages = {}
            for page in result.pages:
                if page.size:
                    page_heights[page.page_no] = float(page.size.height)
                    page_data[page.page_no]["page_dimensions"] = {
                        "width": float(page.size.width),
                        "height": float(page.size.height),
                        "rotation": 0,
                    }
                parsed = getattr(page, "parsed_page", None)
                if parsed is not None:
                    parsed_pages[page.page_no] = parsed
                    
            for item, _level in doc.iterate_items():
                page_no = self._primary_page(item)
                page_height = page_heights.get(page_no)

                if isinstance(item, TableItem):
                    table = self._table_to_element(item, doc, page_height)
                    if table:
                        page_data[page_no]["elements"].append(table)
                    continue
                if isinstance(item, CodeItem):
                    code = self._code_to_element(item, page_height)
                    if code:
                        page_data[page_no]["elements"].append(code)
                    continue
                if getattr(item, "self_ref", None) in skip_caption_refs:
                    continue

                parsed = self._item_to_element(item, doc, page_height, page_heights, parsed_pages)
                if not parsed:
                    continue
                element, page_no = parsed
                page_data[page_no]["elements"].append(element)

            return {
                "page_data": dict(page_data),
                "title": doc_title,
                "metadata": {
                    "file_type": "pdf",
                    "source": filepath,
                },
            }
        except Exception as e:
            logger.error("PDF extraction failed for %s: %s", filepath, e, exc_info=True)
            return None
