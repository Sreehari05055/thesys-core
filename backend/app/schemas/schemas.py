from typing import Optional
from pydantic import BaseModel, Field

class ActiveDocument(BaseModel):
    """Pinned corpus file for the current chat message."""
    doc_id: str = Field(..., min_length=1, description="From GET /api/ingest/files.")
    filename: str = Field(..., min_length=1, description="Basename of the file (same as ingest list).")

class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, description="User message; token limit enforced in POST /api/chat.")
    research_mode: bool = False
    source_ids: list[str] = Field(default_factory=list)
    active_documents: list[ActiveDocument] = Field(
        default_factory=list,
        description="Pinned files for this message as doc_id + filename pairs.",
    )
    doc_ids: list[str] = Field(
        default_factory=list,
        description="Legacy: use active_documents instead. Ignored when active_documents is non-empty.",
    )

    def resolved_doc_ids(self) -> list[str]:
        if self.active_documents:
            return [d.doc_id for d in self.active_documents]
        return list(self.doc_ids)

    def active_documents_dicts(self) -> list[dict[str, str]]:
        return [{"doc_id": d.doc_id, "filename": d.filename} for d in self.active_documents]

class SettingsRequest(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None

class CiteRequest(BaseModel):
    citation_inputs: list[str] = Field(
        ...,
        min_length=1,
        description="DOI, arXiv ID, or title per item. One element for a single citation.",
    )

class CiteExportRequest(CiteRequest):
    export_format: str = Field(..., description="bibtex, ris, enw, or csv")
