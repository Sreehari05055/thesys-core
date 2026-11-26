from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from app.core.config import config
from app.routes.session_guard import SessionId
from app.schemas.schemas import SettingsRequest

router = APIRouter()


@router.get("/api/conversations")
async def list_conversations(request: Request):
    """Get all conversation sessions."""
    sessions = await request.app.state.history_store.list_sessions()
    return JSONResponse(content={"conversations": sessions})


@router.get("/api/conversations/messages")
async def load_conversation(request: Request, session_id: SessionId):
    """Get conversation messages. Requires ``X-Session-ID``."""
    store = request.app.state.history_store
    messages = await store.get_messages(session_id)
    title = await store.get_session_title(session_id)
    settings = await store.get_settings(session_id)
    return JSONResponse(content={
        "session_id": session_id,
        "title": title,
        "offline": bool(settings.get("offline")),
        "model": settings.get("model") or "",
        "messages": messages,
    })


@router.delete("/api/conversations")
async def delete_conversation(request: Request, session_id: SessionId):
    """Delete session: messages, sources, summaries, vectors, bucket files, and chat row."""
    await request.app.state.rag_service.rag_pipeline.delete_session_vectors(session_id)
    await request.app.state.history_store.clear_session(session_id)
    return JSONResponse(content={
        "message": "Conversation deleted successfully",
        "session_id": session_id,
    })


@router.post("/api/conversations/new")
async def new_conversation(request: Request):
    """Create a session. Body may include ``offline``. No API key forces offline."""
    offline = False
    try:
        body = await request.json()
        if isinstance(body, dict):
            offline = bool(body.get("offline"))
    except Exception:
        pass
    if not config.OPENAI_API_KEY:
        offline = True
    store = request.app.state.history_store
    session_id = await store.create_session(offline=offline)
    settings = await store.get_settings(session_id)
    return JSONResponse(content={
        "session_id": session_id,
        "offline": offline,
        "model": settings.get("model") or "",
        "message": "New conversation created",
    })


@router.get("/api/models")
async def list_models(request: Request):
    """Active chat models for the session dropdown."""
    models = await request.app.state.history_store.list_llm_models()
    return JSONResponse(content={"models": models})


@router.post("/api/settings")
async def save_settings(request: Request, session_id: SessionId, settings_request: SettingsRequest):
    """Save per-conversation settings. Requires ``X-Session-ID``."""
    store = request.app.state.history_store
    settings = settings_request.model_dump(exclude_unset=True)
    title = settings.pop("title", None)
    current = await store.get_settings(session_id)
    if (
        "model" in settings
        and settings.get("model") != current.get("model")
        and await store.has_messages(session_id)
    ):
        raise HTTPException(status_code=400, detail="Model is fixed once a question has been asked")
    model_row = await store.get_llm_model(settings.get("model"))
    if not model_row:
        raise HTTPException(status_code=400, detail="Unsupported model")
    settings["provider"] = model_row["provider"]
    await store.save_settings(session_id, settings)
    await store.set_session_title(session_id, title)
    return JSONResponse(content={"message": "Settings saved successfully", "session_id": session_id})
