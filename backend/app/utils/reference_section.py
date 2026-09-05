"""Reference-section detection."""

import re
from typing import Optional

_REF_PHRASES = frozenset(
    {
        "reference",
        "references",
        "bibliography",
        "works cited",
        "literature cited",
        "reference list",
        "references and notes",
        "list of references",
    }
)

_SECTION_PREFIX = re.compile(r"^\s*(?:\d+|[ivxlcdm]+)[\.\)\:\-\s]+", re.IGNORECASE)
_MAX_HEADING_CHARS = 40


def _normalize_heading(text: str) -> str:
    line = (text or "").strip().lower()
    line = _SECTION_PREFIX.sub("", line)
    line = re.sub(r"[^\w\s]", " ", line)
    return re.sub(r"\s+", " ", line).strip()


def is_reference_section_heading(text: str) -> bool:
    """True when a line is a References/Bibliography section title."""
    raw = (text or "").strip()
    if not raw or len(raw) > _MAX_HEADING_CHARS:
        return False
    return _normalize_heading(raw) in _REF_PHRASES


def is_other_section_heading(text: str, tag: Optional[str] = None) -> bool:
    """True when a line looks like a post-references section heading."""
    if tag != "section_header":
        return False
    raw = (text or "").strip()
    if not raw or len(raw) > _MAX_HEADING_CHARS:
        return False
    return not is_reference_section_heading(raw)
