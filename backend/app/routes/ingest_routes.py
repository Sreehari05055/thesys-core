from typing import Optional
from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import JSONResponse
from app.routes.session_guard import SESSION_HEADER, SessionId
from app.services.local_history_store import doc_id_for_filename
from app.utils.pdf_url_verifier import download_pdf_from_url
from datetime import datetime
import hashlib
import os
import re
from urllib.parse import urlparse

router = APIRouter()

def _allocate_unique_filename(reserved: set[str], desired: str) -> str:
    """Pick a ``file_name`` not in ``reserved`` (e.g. ``report.pdf`` → ``report (1).pdf``)."""
    base = os.path.basename(desired.strip()) or "upload"
    stem, ext = os.path.splitext(base)
    candidate = base
    n = 1
    while candidate in reserved:
        candidate = f"{stem} ({n}){ext}"
        n += 1
    return candidate


def _filename_from_pdf_title(title: str) -> str:
    stem = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", title)[:120].strip(" .") or "download"
    return f"{stem}.pdf"


def _filename_from_url_source(source: dict, url: str, content_sha: str) -> str:
    title = (source.get("title") or "").strip()
    if title:
        return _filename_from_pdf_title(title)

    fname = (source.get("filename") or "").strip()
    if fname:
        base = os.path.basename(fname)
        stem, _ = os.path.splitext(base)
        for prefix in ("downloaded_", "download_"):
            if stem.lower().startswith(prefix):
                rem = stem[len(prefix):].strip()
                if rem:
                    return _filename_from_pdf_title(rem)
        return base if base.lower().endswith(".pdf") else f"{base}.pdf"

    path_base = os.path.basename(urlparse(url).path or "")
    if path_base.lower().endswith(".pdf") and path_base != ".pdf":
        return path_base
    return f"download_{content_sha[:8]}.pdf"

@router.get("/api/ingest/files")
async def list_ingest_files(
    request: Request,
    session_id: Optional[str] = Query(None),
):
    """List RAG corpus files for a session, or all files if no session is given."""
    history_store = request.app.state.history_store
    sid = (session_id or request.headers.get(SESSION_HEADER) or "").strip() or None

    files = await history_store.list_rag_files(sid)
    for f in files:
        name = os.path.basename(str(f.get("filename") or "").strip())
        f["filename"] = name
        f["doc_id"] = doc_id_for_filename(name)
        f["metadata"] = {
            "identifier": None,
            "verified": False,
            **(f.pop("metadata", None) or {}),
        }
    return JSONResponse(content={"files": files, "session_id": sid})


@router.post("/api/ingest")
async def ingest_files(
    request: Request,
    session_id: SessionId,
):
    """Upload files to the session RAG corpus. Requires ``X-Session-ID``."""
    history_store = request.app.state.history_store
    ctype = (request.headers.get("content-type") or "").split(";", 1)[0].lower()
    prepared = []
    session_settings = await history_store.get_settings(session_id)
    offline = bool(session_settings.get("offline"))

    if ctype == "application/json":
        payload = await request.json()
        sources = [
            s for s in (payload.get("sources") or [])
            if (s.get("url") or "").strip()
        ]
        for s in sources:
            url = (s.get("url") or "").strip()
            body, final, mime, reason = await download_pdf_from_url(
                url, http_client=request.app.state.http_client
            )
            if reason != "verified":
                raise HTTPException(status_code=422, detail={"error": reason, "url": url})
            sha = hashlib.sha256(body).hexdigest()
            prepared.append({
                "filename": _filename_from_url_source(s, final or url, sha),
                "content": body,
                "mime": mime or "application/pdf",
                "sha": sha,
                "paper_id": (s.get("paper_id") or "").strip() or None,
            })
    else:
        form = await request.form()
        files = [
            v for k, v in form.multi_items()
            if k in ("files", "file") and os.path.basename(getattr(v, "filename", "").strip())
        ]
        for f in files:
            name = os.path.basename(getattr(f, "filename", "").strip())
            content = await f.read()
            prepared.append({
                "filename": name,
                "content": content,
                "mime": getattr(f, "content_type", None) or "application/octet-stream",
                "sha": hashlib.sha256(content).hexdigest(),
            })

    if not prepared:
        raise HTTPException(status_code=400, detail="No files provided")

    existing_by_sha = await history_store.map_session_content_sha256_to_filename(session_id)
    to_ingest, skipped, seen_sha = [], [], {}
    for item in prepared:
        sha, fname = item["sha"], item["filename"]
        if sha in existing_by_sha:
            skipped.append({
                "filename": fname,
                "content_sha256": sha,
                "matches_existing": existing_by_sha[sha],
            })
        elif sha in seen_sha:
            skipped.append({
                "filename": fname,
                "content_sha256": sha,
                "matches_upload": seen_sha[sha],
            })
        else:
            seen_sha[sha] = fname
            to_ingest.append(item)

    if not to_ingest:
        raise HTTPException(
            status_code=409,
            detail={"error": "duplicate_content", "files": skipped},
        )

    existing = await history_store.list_rag_files(session_id)
    reserved = {e["filename"] for e in existing if e.get("filename")}
    for item in to_ingest:
        item["filename"] = _allocate_unique_filename(reserved, item["filename"])
        reserved.add(item["filename"])

    saved_paths = []
    citations_service = request.app.state.citations_service
    for item in to_ingest:
        path = await history_store.save_rag_file_bytes(
            session_id, item["filename"], item["content"], mime_type=item["mime"]
        )
        saved_paths.append(path)
        if item["filename"].lower().endswith(".pdf"):
            paper_id = item.get("paper_id")
            identifier = paper_id or await citations_service._extract_identifier_from_pdf(path)
            await history_store.save_file_metadata(
                session_id,
                item["filename"],
                {
                    "identifier": identifier,
                    "verified": bool(identifier),
                    "uploaded_at": datetime.now().isoformat(),
                },
            )

    saved_paths = list(dict.fromkeys(saved_paths))
    await request.app.state.rag_service.rag_pipeline.add_to_index(session_id, saved_paths, offline=offline)

    names = sorted({os.path.basename(p) for p in saved_paths})
    await history_store.add_message(session_id, {
        "role": "system",
        "content": (
            "The user uploaded and indexed the following file(s) in this conversation: "
            + ", ".join(names)
            + "."
        ),
    })

    return JSONResponse(content={
        "message": f"Successfully ingested {len(saved_paths)} file(s) and updated session index.",
        "ingested": names,
        "files": [{"filename": n, "doc_id": doc_id_for_filename(n)} for n in names],
        "skipped_duplicate_content": skipped,
    })


@router.delete("/api/ingest/files")
async def delete_ingest_files(
    request: Request,
    session_id: SessionId,
):
    """Delete file(s) from the session RAG corpus. Requires ``X-Session-ID``.

    Body: ``{"doc_ids": ["...", "..."]}`` or ``{"doc_id": "..."}`` for one file.
    """
    payload = await request.json()
    raw = payload.get("doc_ids") if "doc_ids" in payload else payload.get("doc_id")
    doc_ids = [raw] if isinstance(raw, str) else list(raw or [])

    history_store = request.app.state.history_store
    deleted_chunk_ids = await history_store.delete_rag_file(session_id, doc_ids)
    await request.app.state.rag_service.rag_pipeline.build_index(session_id)
    deleted = list(dict.fromkeys(d.strip().lower() for d in doc_ids if (d or "").strip()))
    return JSONResponse(content={
        "message": f"Deleted {len(deleted)} file(s) and rebuilt session index.",
        "deleted_doc_ids": deleted,
        "deleted_chunk_ids": deleted_chunk_ids or [],
    })
