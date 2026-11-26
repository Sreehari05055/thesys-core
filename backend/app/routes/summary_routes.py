from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from app import logger
from app.routes.file_routes import filename_for_doc_id
from app.routes.session_guard import SessionId

router = APIRouter()


@router.get("/api/summarize/saved/{summary_id}")
async def get_saved_summary(request: Request, summary_id: str, session_id: SessionId):
    """Load one saved summary by ``summary_id``. Requires ``X-Session-ID``."""
    row = await request.app.state.history_store.get_document_summary(session_id, summary_id)
    if not row:
        raise HTTPException(status_code=404, detail="Summary not found")
    return JSONResponse(content=row)


@router.get("/api/summarize")
async def list_session_summaries(request: Request, session_id: SessionId):
    """List saved summarize runs (metadata only). Requires ``X-Session-ID``."""
    summaries = await request.app.state.history_store.list_document_summaries(session_id)
    return JSONResponse(content={"summaries": summaries})


@router.post("/api/summarize/{doc_id}")
async def summarize_session_file(request: Request, doc_id: str, session_id: SessionId):
    """Summarize one indexed file by ``doc_id``. Requires ``X-Session-ID``."""
    store = request.app.state.history_store
    resolved_doc_id = unquote(doc_id.strip()).lower()
    filename = await filename_for_doc_id(store, session_id, resolved_doc_id)
    if not filename:
        raise HTTPException(status_code=404, detail="Document not found in this session")

    session_settings = await store.get_settings(session_id)
    result = await request.app.state.summarizer_service.summarize(
        session_id,
        [filename],
        provider=session_settings.get("provider"),
        model_name=session_settings.get("model"),
    )

    if isinstance(result, str):
        if result.startswith("No content found"):
            raise HTTPException(
                status_code=404,
                detail={"error": "nothing_to_summarize", "message": result},
            )
        logger.error("summarize_session_file: %s", result)
        return JSONResponse(content={"error": result}, status_code=500)

    try:
        saved = await store.insert_document_summary(
            chat_id=session_id,
            doc_id=resolved_doc_id,
            filename=filename,
            chunks=[{"summary": result["summary"], "sources": result.get("sources", [])}],
        )
    except Exception as e:
        logger.error(
            "document_summaries insert failed chat_id=%s doc_id=%s: %s",
            session_id,
            resolved_doc_id,
            e,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail={"error": "summary_save_failed", "message": "Summary generated but could not be saved."},
        ) from e

    return JSONResponse(content={
        "doc_id": resolved_doc_id,
        "filename": filename,
        "summary": result["summary"],
        "sources": result.get("sources", []),
        "summary_id": saved["id"],
        "created_at": saved["created_at"],
    })
