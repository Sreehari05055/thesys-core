import asyncio
import io
import os
import tempfile
from urllib.parse import quote, unquote

import fitz
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse
from starlette.responses import JSONResponse, StreamingResponse
from app import logger
from app.routes.session_guard import SessionId
from app.services.local_history_store import doc_id_for_filename
from app.utils.pdf_url_verifier import download_pdf_from_url

router = APIRouter()


async def filename_for_doc_id(store, session_id: str, doc_id: str) -> str | None:
    """Resolve ingest ``doc_id`` (md5 of basename filename) to stored ``file_name``."""
    needle = unquote(doc_id.strip()).lower()
    if not needle:
        return None
    for entry in await store.list_rag_files(session_id):
        filename = entry["filename"]
        if doc_id_for_filename(filename) == needle:
            return filename
    return None


async def _resolve_session_file_path(store, session_id: str, filename: str) -> str | None:
    """Return local path for a session file (temp cache or Storage download)."""
    safe_filename = os.path.basename(filename)
    temp_path = os.path.join(tempfile.gettempdir(), "synclair", session_id, "source_files", safe_filename)
    if await asyncio.to_thread(os.path.exists, temp_path):
        return temp_path
    return await store.get_single_file(session_id, safe_filename)


def _pdf_download_error_status(reason: str) -> int:
    return {"timeout": 504}.get(reason, 422)


def _content_disposition(filename: str, *, download: bool = False) -> str:
    kind = "attachment" if download else "inline"
    return f"{kind}; filename*=UTF-8''{quote(filename)}"


def _pdf_bytes_response(pdf_bytes: bytes, download_name: str, *, download: bool = False) -> StreamingResponse:
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition(download_name, download=download)},
    )


def _pdf_page_bytes(src: str | bytes, page_number: int) -> bytes:
    """Extract one 1-indexed page; ``src`` is a file path or PDF bytes."""
    doc = fitz.open(stream=src, filetype="pdf") if isinstance(src, bytes) else fitz.open(src)
    try:
        if page_number > doc.page_count:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid page number. PDF has {doc.page_count} pages.",
            )
        out = fitz.open()
        try:
            out.insert_pdf(doc, from_page=page_number - 1, to_page=page_number - 1)
            return out.tobytes()
        finally:
            out.close()
    finally:
        doc.close()


@router.get("/api/files/{doc_id:path}/regions")
async def get_session_file_regions(request: Request, doc_id: str, session_id: SessionId):
    """Table/code overlay regions for reader mode."""
    resolved = unquote(doc_id.strip()).lower()
    filename = await filename_for_doc_id(request.app.state.history_store, session_id, resolved)
    if not filename:
        raise HTTPException(status_code=404, detail="Document not found in this session")
    regions = await request.app.state.rag_service.rag_pipeline.fetch_file_regions(session_id, resolved)
    return JSONResponse(content={"doc_id": resolved, "regions": regions})


@router.get("/api/files/{doc_id:path}")
async def get_session_file(
    request: Request,
    doc_id: str,
    session_id: SessionId,
    page_number: int | None = Query(
        None,
        ge=1,
        description="1-indexed PDF page. Omit to return the full file.",
    ),
    download: bool = Query(
        False,
        description="If true, return Content-Disposition attachment (save to disk). Default: inline view.",
    ),
):
    """Serve an ingested file by md5 ``doc_id``."""
    store = request.app.state.history_store
    filename = await filename_for_doc_id(store, session_id, doc_id)
    if not filename:
        raise HTTPException(status_code=404, detail="Document not found in this session")

    file_path = await _resolve_session_file_path(store, session_id, filename)
    if not file_path:
        logger.error(f"File not found: {filename} for session {session_id} (doc_id={doc_id})")
        raise HTTPException(status_code=404, detail="File not found")

    is_pdf = filename.lower().endswith(".pdf")
    if page_number is not None:
        if not is_pdf:
            raise HTTPException(status_code=400, detail="page_number is only supported for PDF documents")
        return _pdf_bytes_response(
            _pdf_page_bytes(file_path, page_number),
            f"{filename}_page_{page_number}.pdf",
            download=download,
        )

    return FileResponse(
        file_path,
        media_type="application/pdf" if is_pdf else None,
        filename=filename,
        headers={"Content-Disposition": _content_disposition(filename, download=download)},
    )


@router.get("/api/papers/{paper_id:path}")
async def get_external_paper_pdf(
    request: Request,
    paper_id: str,
    session_id: SessionId,
    url: str = Query(..., min_length=1, description="Verified pdf_url for this paper."),
    page_number: int | None = Query(
        None,
        ge=1,
        description="1-indexed PDF page. Omit to return the full file.",
    ),
    download: bool = Query(False),
):
    """Serve a verified external PDF. Path id is the paper id."""
    stored_url = await request.app.state.history_store.get_verified_external_pdf_url(
        session_id,
        paper_id=paper_id,
        url=url,
    )
    if not stored_url:
        raise HTTPException(status_code=404, detail="Verified PDF not found for this session.")

    body, _final_url, _ctype, reason = await download_pdf_from_url(
        stored_url,
        http_client=request.app.state.http_client,
    )
    if reason != "verified":
        raise HTTPException(
            status_code=_pdf_download_error_status(reason),
            detail={"error": reason, "url": stored_url},
        )

    stem = os.path.basename(paper_id.replace("/", "_")) or "paper"
    if page_number is not None:
        return _pdf_bytes_response(
            _pdf_page_bytes(body, page_number),
            f"{stem}_page_{page_number}.pdf",
            download=download,
        )
    return _pdf_bytes_response(body, f"{stem}.pdf", download=download)
