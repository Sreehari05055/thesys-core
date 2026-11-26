from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.responses import StreamingResponse
from app import logger
from app.routes.session_guard import SESSION_HEADER, SessionId
from app.schemas.schemas import ChatRequest
from app.core.config import config

router = APIRouter()


@router.get("/api/status")
async def api_status():
    return JSONResponse(content={"openai_configured": bool(config.OPENAI_API_KEY)})


@router.post("/api/chat", response_class=StreamingResponse)
async def get_bot_response(
    request: Request,
    chat_request: ChatRequest,
    session_id: SessionId,
):
    history_store = request.app.state.history_store
    session_settings = await history_store.get_settings(session_id)
    question = chat_request.question
    source_ids = chat_request.source_ids
    doc_ids = chat_request.resolved_doc_ids()
    active_documents = chat_request.active_documents_dicts()
    logger.info(f"Sources received: {source_ids}")
    logger.info(f"active_documents received: {active_documents}")
    settings = {
        **session_settings,
        "source_ids": source_ids,
        "doc_ids": doc_ids,
        "active_documents": active_documents,
        "research_mode": chat_request.research_mode,
        "compare_mode": chat_request.compare_mode,
    }

    async def event_stream():
        async for chunk in request.app.state.chatbot_service._generate_response(
            session_id=session_id, query=question, settings=settings
        ):
            yield chunk

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            SESSION_HEADER: session_id,
        },
    )
