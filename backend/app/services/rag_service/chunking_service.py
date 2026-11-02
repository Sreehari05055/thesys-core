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
    """Pack items into ~448-token parents, then embed ~64-token line children."""

    def __init__(self):
        self.CHUNK_SIZE = config.PARENT_CHUNK_SIZE
        self.CHILD_CHUNK_SIZE = config.CHILD_CHUNK_SIZE 
        self.SMALL_CHUNK_MAX_TOKENS = self.CHUNK_SIZE // 4
        self.SEP = " "

    def _piece_tokens(self, text: str, *, leading_sep: bool) -> int:
        if not text:
            return 0
        return tokenizer_manager.count_tokens((self.SEP + text) if leading_sep else text)

    def chunk_pdf_elements(self, pdf_page_data: dict, doc_id: str, doc_title: str) -> List[dict]:
        parents = []
        buf = {"content": [], "bboxes": [], "pages": set(), "lines": [], "tokens": 0}
        in_refs = False

        def reset():
            buf["content"].clear()
            buf["bboxes"].clear()
            buf["pages"].clear()
            buf["lines"].clear()
            buf["tokens"] = 0

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

        def add(element, page_no, bbox, page_dims, tag):
            for entry in element.get("page_bboxes") or [{"page": page_no, "box": bbox}]:
                p = entry.get("page", page_no)
                dims = pdf_page_data.get(p, {}).get("page_dimensions") or page_dims
                buf["pages"].add(p)
                rec = _box(p, entry.get("box"), dims, tag)
                if rec:
                    buf["bboxes"].append(rec)
            for line in element.get("lines") or []:
                p = line.get("page", page_no)
                dims = pdf_page_data.get(p, {}).get("page_dimensions") or page_dims
                rec = _box(p, line.get("box"), dims, tag)
                text = (line.get("text") or "").strip()
                if rec and text:
                    buf["lines"].append({**rec, "text": text})

        for page_no in sorted(pdf_page_data):
            page_info = pdf_page_data[page_no]
            page_dims = page_info.get("page_dimensions", {})
            for element in page_info.get("elements", []):
                text = element.get("content", "")
                bbox = element.get("bbox")
                tag = element.get("tag")

                if tag in ("table", "code", "picture", "chart"):
                    flush()
                    rec = _box(page_no, bbox, page_dims, tag)
                    body = (text or "").strip()
                    if body:
                        parents.append({
                            "content": body,
                            "metadata": {
                                "title": doc_title,
                                "pages": [page_no],
                                "bboxes": [rec] if rec else [],
                                "file_type": "pdf",
                                "tag": tag,
                            },
                            "lines": [],
                        })
                    continue

                if not in_refs and tag == "section_header" and is_reference_section_heading(text):
                    flush(into_last=True)
                    in_refs = True
                elif in_refs and is_other_section_heading(text, tag):
                    flush()
                    in_refs = False

                extra = self._piece_tokens(text, leading_sep=bool(buf["content"]))
                if buf["content"] and buf["tokens"] + extra > self.CHUNK_SIZE:
                    flush()
                    extra = self._piece_tokens(text, leading_sep=False)
                buf["content"].append(text)
                buf["tokens"] += extra
                add(element, page_no, bbox, page_dims, tag)
                if buf["tokens"] > self.CHUNK_SIZE:
                    flush()

        flush()
        self._merge_small(parents)
        return self._to_children(parents, doc_id, doc_title)

    def _merge_small(self, parents: list) -> None:
        if len(parents) < 2:
            return
        out, last_text = [], -1
        for parent in parents:
            meta = parent["metadata"]
            if meta.get("tag") in ("table", "code", "picture", "chart"):
                out.append(parent)
                continue
            tokens = tokenizer_manager.count_tokens(parent["content"])
            if tokens >= self.SMALL_CHUNK_MAX_TOKENS:
                out.append(parent)
                last_text = len(out) - 1
                continue
            if last_text < 0:
                out.append(parent)
                continue
            dst = out[last_text]
            src = parent["content"].strip()
            if src:
                dst["content"] = f"{dst['content'].strip()}{self.SEP}{src}" if dst["content"].strip() else src
            dst_meta, src_meta = dst["metadata"], parent["metadata"]
            dst_meta["pages"] = sorted(set(dst_meta.get("pages") or []) | set(src_meta.get("pages") or []))
            dst_meta["bboxes"] = (dst_meta.get("bboxes") or []) + (src_meta.get("bboxes") or [])
            dst["lines"] = (dst.get("lines") or []) + (parent.get("lines") or [])
            if src_meta.get("reference_section"):
                dst_meta["reference_section"] = True
        parents[:] = out

    def _pack_lines(self, lines: list) -> list:
        groups, texts, boxes, pages = [], [], [], set()
        tokens = 0
        def emit():
            nonlocal tokens
            if not texts:
                return
            groups.append({"text": self.SEP.join(texts), "bboxes": list(boxes), "pages": sorted(pages)})
            texts.clear()
            boxes.clear()
            pages.clear()
            tokens = 0
        for line in lines:
            extra = self._piece_tokens(line["text"], leading_sep=bool(texts))
            if texts and tokens + extra > self.CHILD_CHUNK_SIZE:
                emit()
                extra = self._piece_tokens(line["text"], leading_sep=False)
            texts.append(line["text"])
            tokens += extra
            boxes.append(_paint(line))
            pages.add(line["page"])
        emit()
        return groups

    def _to_children(self, parents: list, doc_id: str, doc_title: str) -> list:
        rows = []
        child_i = 0
        for idx, parent in enumerate(parents):
            text = parent["content"].strip()
            if not text:
                continue
            meta = parent["metadata"]
            lines = parent.get("lines") or []
            parent_boxes = meta.get("bboxes") or []
            parent_id = f"{doc_id}_p{idx}"
            parent_meta = {
                "title": doc_title,
                "file_type": "pdf",
                "pages": meta.get("pages") or [],
                "bboxes": parent_boxes,
                "role": "parent",
            }
            if meta.get("reference_section"):
                parent_meta["reference_section"] = True
            if meta.get("tag"):
                parent_meta["tag"] = meta["tag"]
            rows.append({"id": parent_id, "content": text, "metadata": parent_meta})

            keep = (
                tokenizer_manager.count_tokens(text) <= self.CHILD_CHUNK_SIZE
                or meta.get("tag") in ("table", "code", "picture", "chart")
                or not lines
            )
            pieces = (
                [{"text": text, "bboxes": [_paint(ln) for ln in lines] or parent_boxes, "pages": meta.get("pages") or []}]
                if keep else self._pack_lines(lines)
            )
            for g in pieces:
                row = {
                    "title": doc_title,
                    "file_type": "pdf",
                    "pages": g["pages"],
                    "bboxes": g["bboxes"],
                    "role": "child",
                    "parent_id": parent_id,
                    "parent_pages": meta.get("pages") or [],
                    "parent_bboxes": parent_boxes,
                }
                if meta.get("reference_section"):
                    row["reference_section"] = True
                if meta.get("tag"):
                    row["tag"] = meta["tag"]
                rows.append({"id": f"{doc_id}_c{child_i}", "content": g["text"], "metadata": row})
                child_i += 1
        return rows