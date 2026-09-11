from typing import List
from app.core.config import config
from app.core.tokenizer import tokenizer_manager
from app.utils.bbox_utils import is_valid_highlight_bbox
from app.utils.reference_section import (
    is_other_section_heading,
    is_reference_section_heading,
)


def _box(page, box, dims, tag=None):
    if not box or not is_valid_highlight_bbox(box, dims.get("width"), dims.get("height")):
        return None
    return {
        "page": page,
        "box": box,
        "page_width": dims.get("width"),
        "page_height": dims.get("height"),
        "page_rotation": dims.get("rotation", 0),
        "tag": tag,
    }


def _paint(line):
    return {
        "page": line["page"],
        "box": line["box"],
        "page_width": line["page_width"],
        "page_height": line["page_height"],
        "page_rotation": line.get("page_rotation", 0),
        "tag": line.get("tag"),
    }


class ChunkingService:
    """Token-budget PDF chunking; each chunk stays under ``config.PARENT_CHUNK_SIZE`` tokens."""

    def __init__(self):
        self.CHUNK_SIZE = config.PARENT_CHUNK_SIZE
        self.CHILD_CHUNK_SIZE = config.CHILD_CHUNK_SIZE 
        self.SMALL_CHUNK_MAX_TOKENS = self.CHUNK_SIZE // 4
        self.SEP = " "

    def chunk_pdf_elements(self, pdf_page_data: dict, doc_id: str, doc_title: str) -> List[dict]:
        parents = []
        buf = {"content": [], "bboxes": [], "pages": set(), "lines": []}
        in_refs = False

        def reset():
            buf["content"].clear()
            buf["bboxes"].clear()
            buf["pages"].clear()
            buf["lines"].clear()

        def ntok(parts):
            text = self.SEP.join(parts)
            return tokenizer_manager.count_tokens(text) if text else 0

        def flush(into_last=False):
            if not buf["content"]:
                return
            if into_last and parents:
                last = parents[-1]
                extra = self.SEP.join(buf["content"])
                if extra:
                    last["content"] = f"{last['content']}{self.SEP}{extra}" if last["content"] else extra
                meta = last["metadata"]
                meta["pages"] = sorted(set(meta.get("pages") or []) | buf["pages"])
                meta["bboxes"] = (meta.get("bboxes") or []) + buf["bboxes"]
                last.setdefault("lines", []).extend(buf["lines"])
                reset()
                return
            meta = {
                "title": doc_title,
                "pages": sorted(buf["pages"]),
                "bboxes": list(buf["bboxes"]),
                "file_type": "pdf",
            }
            if in_refs:
                meta["reference_section"] = True
            parents.append({
                "content": self.SEP.join(buf["content"]),
                "metadata": meta,
                "lines": list(buf["lines"]),
            })
            reset()

        for page_no in sorted(pdf_page_data.keys()):
            page_info = pdf_page_data[page_no]
            page_dims = page_info.get("page_dimensions", {})
            for element in page_info.get("elements", []):
                text = element.get("content", "")
                tokens = element.get("tokens", 0)
                bbox = element.get("bbox")
                tag = element.get("tag")

                if tag in ("table", "code"):
                    save_chunk()
                    standalone = _standalone_block_chunk(
                        page_no=page_no,
                        page_dims=page_dims,
                        text=text,
                        bbox=bbox,
                        tag=tag,
                    )
                    if standalone["content"]:
                        chunks.append(standalone)
                    continue

                if not in_reference_section and tag == "section_header" and is_reference_section_heading(text):
                    append_buffer_to_last_chunk()
                    in_reference_section = True

                elif in_reference_section and is_other_section_heading(text, tag):
                    save_chunk()
                    in_reference_section = False

                space_needed = tokens + (self.JOIN_COST if chunk["content"] else 0)
                
                if tokens > self.CHUNK_SIZE:
                    save_chunk()
                    chunk["content"].append(text)
                    chunk["tokens"] += tokens
                    _add_text_geometry(element, page_no, bbox, page_dims, tag)
                    save_chunk()

                elif chunk["tokens"] + space_needed > self.CHUNK_SIZE:
                    save_chunk()
                    chunk["content"].append(text)
                    chunk["tokens"] += tokens
                    _add_text_geometry(element, page_no, bbox, page_dims, tag)

                else:
                    chunk["content"].append(text)
                    chunk["tokens"] += space_needed
                    _add_text_geometry(element, page_no, bbox, page_dims, tag)

        save_chunk()
        merge_small_chunks()
        return chunks