import json
from typing import Any, List, Optional, Sequence

# ponytail: reject near-full-page Docling boxes (watermarks); upgrade path = content_layer filter
_MAX_HEIGHT_RATIO = 0.92
_MAX_AREA_RATIO = 0.65


def as_list(raw: Any) -> List[Any]:
    """Return metadata list fields as a list (``[]`` if missing or wrong type)."""
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return []
        return parsed if isinstance(parsed, list) else []
    return []


def is_valid_highlight_bbox(
    box: Optional[Sequence[float]],
    page_width: Optional[float] = None,
    page_height: Optional[float] = None,
) -> bool:
    """Basic geometry check; drop boxes that cover most of the page."""
    if not box or len(box) != 4:
        return False
    x0, y0, x1, y1 = (float(v) for v in box)
    w, h = x1 - x0, y1 - y0
    if w <= 0 or h <= 0:
        return False

    if page_width and page_height and page_width > 0 and page_height > 0:
        if h / page_height > _MAX_HEIGHT_RATIO:
            return False
        page_area = page_width * page_height
        if page_area > 0 and (w * h) / page_area > _MAX_AREA_RATIO:
            return False
        return True


def page_dimensions_from_bboxes(
    pages: Optional[List[Any]], bboxes: Optional[List[Any]]
) -> List[dict]:
    """Per-page width/height/rotation from chunk ``bboxes`` (same fields as ingest chunking)."""
    dims_by_page: dict[Any, dict] = {}
    for entry in bboxes or []:
        if not isinstance(entry, dict):
            continue
        page = entry.get("page")
        if page is None or page in dims_by_page:
            continue
        dims_by_page[page] = {
            "page": page,
            "page_width": entry.get("page_width"),
            "page_height": entry.get("page_height"),
            "page_rotation": entry.get("page_rotation", 0),
        }
    ordered_pages = list(pages) if pages else sorted(
        dims_by_page.keys(), key=lambda x: (not isinstance(x, (int, float)), x)
    )
    out: List[dict] = []
    seen: set[Any] = set()
    for p in ordered_pages:
        if p in dims_by_page and p not in seen:
            out.append(dims_by_page[p])
            seen.add(p)
    for p in sorted(dims_by_page.keys(), key=lambda x: (not isinstance(x, (int, float)), x)):
        if p not in seen:
            out.append(dims_by_page[p])
    return out


def primary_page_fields(page_dimensions: List[dict]) -> tuple[Any, Any, Any]:
    """Top-level ``page`` / ``page_width`` / ``page_height`` when the chunk spans one page."""
    if len(page_dimensions) == 1:
        d = page_dimensions[0]
        return d.get("page"), d.get("page_width"), d.get("page_height")
    return None, None, None


def filter_highlight_bboxes(bboxes: Optional[List[Any]]) -> List[Any]:
    """Drop invalid or near-full-page boxes before returning to the client."""
    if not bboxes:
        return []
    kept: List[Any] = []
    for entry in bboxes:
        if isinstance(entry, dict):
            box = entry.get("box")
            if is_valid_highlight_bbox(
                box,
                entry.get("page_width"),
                entry.get("page_height"),
            ):
                kept.append(entry)
        elif isinstance(entry, (list, tuple)) and len(entry) >= 4:
            if is_valid_highlight_bbox(entry):
                kept.append(entry)
    return kept
