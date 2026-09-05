from typing import List
from app.core.config import config
from app.core.tokenizer import tokenizer_manager
from app.utils.bbox_utils import is_valid_highlight_bbox
from app.utils.reference_section import (
    is_other_section_heading,
    is_reference_section_heading,
)

class ChunkingService:
    """Token-budget PDF chunking; each chunk stays under ``config.PARENT_CHUNK_SIZE`` tokens."""

    def __init__(self, chunk_size: int | None = None):
        self.CHUNK_SIZE = chunk_size if chunk_size is not None else config.PARENT_CHUNK_SIZE
        if self.CHUNK_SIZE <= 0:
            raise ValueError("chunk_size must be a positive integer")
        self.SMALL_CHUNK_MAX_TOKENS = self.CHUNK_SIZE // 4
        self.JOIN_SEPARATOR = " "
        self.JOIN_COST = tokenizer_manager.count_tokens(self.JOIN_SEPARATOR)

    def chunk_pdf_elements(self, pdf_page_data: dict, doc_id: str, doc_title: str) -> List[dict]:
        """
        Chunk PDF in reading order: body text by token budget; each table/code is its own chunk.
        A table/code flushes the in-progress body chunk so later paragraphs start a new chunk.
        """
        chunks = []
        chunk = {"content": [], "bboxes": [], "pages": set(), "tokens": 0}
        in_reference_section = False

        def save_chunk():
            """Save current chunk and reset."""
            if chunk["tokens"] == 0:
                return
            metadata = {
                "title": doc_title,
                "pages": sorted(chunk["pages"]),
                "bboxes": [
                    b
                    for b in chunk["bboxes"]
                    if is_valid_highlight_bbox(
                        b.get("box"),
                        b.get("page_width"),
                        b.get("page_height"),
                    )
                ],
                "file_type": "pdf",
            }
            if in_reference_section:
                metadata["reference_section"] = True
            chunks.append(
                {
                    "content": self.JOIN_SEPARATOR.join(chunk["content"]),
                    "metadata": metadata,
                }
            )
            chunk["content"].clear()
            chunk["bboxes"].clear()
            chunk["pages"].clear()
            chunk["tokens"] = 0

        def append_buffer_to_last_chunk():
            if chunk["tokens"] == 0:
                return
            if not chunks:
                save_chunk()
                return
            last = chunks[-1]
            extra = self.JOIN_SEPARATOR.join(chunk["content"])
            if extra:
                last["content"] = (
                    f"{last['content']}{self.JOIN_SEPARATOR}{extra}"
                    if last["content"]
                    else extra
                )
            meta = last["metadata"]
            meta["pages"] = sorted(set(meta.get("pages") or []) | chunk["pages"])
            valid_new_bboxes = [
                b
                for b in chunk["bboxes"]
                if is_valid_highlight_bbox(
                    b.get("box"),
                    b.get("page_width"),
                    b.get("page_height"),
                )
            ]
            meta["bboxes"] = (meta.get("bboxes") or []) + valid_new_bboxes
            chunk["content"].clear()
            chunk["bboxes"].clear()
            chunk["pages"].clear()
            chunk["tokens"] = 0

        def merge_small_chunks() -> None:
            """
            Merge small text chunks into adjacent text chunks.
            """
            if len(chunks) < 2:
                return

            def is_region(meta: dict) -> bool:
                return meta.get("tag") in ("table", "code")

            out: List[dict] = []
            last_text_idx = -1

            for c in chunks:
                c_meta = c["metadata"]

                if is_region(c_meta):
                    out.append(c)
                    continue

                tokens = tokenizer_manager.count_tokens(c["content"])
                if tokens >= self.SMALL_CHUNK_MAX_TOKENS:
                    out.append(c)
                    last_text_idx = len(out) - 1
                    continue

                if last_text_idx < 0:
                    out.append(c)
                    continue

                dst = out[last_text_idx]
                dst_meta = dst["metadata"]

                src_text = c["content"].strip()
                dst_text = dst["content"].strip()
                if src_text:
                    dst["content"] = (
                        f"{dst_text}{self.JOIN_SEPARATOR}{src_text}" if dst_text else src_text
                    )

                dst_meta["pages"] = sorted(
                    set(dst_meta.get("pages") or []) | set(c_meta.get("pages") or [])
                )
                dst_meta["bboxes"] = (dst_meta.get("bboxes") or []) + (c_meta.get("bboxes") or [])
                if c_meta.get("reference_section"):
                    dst_meta["reference_section"] = True

            chunks[:] = out

        def _append_bbox(page_no: int, bbox, page_dims: dict, tag: str | None = None) -> None:
            if bbox and is_valid_highlight_bbox(
                bbox,
                page_dims.get("width"),
                page_dims.get("height"),
            ):
                chunk["bboxes"].append(
                    {
                        "page": page_no,
                        "box": bbox,
                        "page_width": page_dims.get("width"),
                        "page_height": page_dims.get("height"),
                        "page_rotation": page_dims.get("rotation", 0),
                        "tag": tag,
                    }
                )

        def _standalone_block_chunk(*, page_no: int, page_dims: dict, text: str, bbox, tag: str) -> dict:
            bboxes = []
            if bbox and is_valid_highlight_bbox(
                bbox,
                page_dims.get("width"),
                page_dims.get("height"),
            ):
                bboxes.append(
                    {
                        "page": page_no,
                        "box": bbox,
                        "page_width": page_dims.get("width"),
                        "page_height": page_dims.get("height"),
                        "page_rotation": page_dims.get("rotation", 0),
                        "tag": tag,
                    }
                )
            return {
                "content": (text or "").strip(),
                "metadata": {
                    "title": doc_title,
                    "pages": [page_no],
                    "bboxes": bboxes,
                    "file_type": "pdf",
                    "tag": tag,
                },
            }

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
                    chunk["pages"].add(page_no)
                    _append_bbox(page_no, bbox, page_dims, tag)
                    save_chunk()

                elif chunk["tokens"] + space_needed > self.CHUNK_SIZE:
                    save_chunk()
                    chunk["content"].append(text)
                    chunk["tokens"] += tokens
                    chunk["pages"].add(page_no)
                    _append_bbox(page_no, bbox, page_dims, tag)

                else:
                    chunk["content"].append(text)
                    chunk["tokens"] += space_needed
                    chunk["pages"].add(page_no)
                    _append_bbox(page_no, bbox, page_dims, tag)

        save_chunk()
        merge_small_chunks()
        return chunks