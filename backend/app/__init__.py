import os
import logging
from contextlib import asynccontextmanager
import httpx

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
log_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app_errors.log')
_DEFAULT_CORS_ORIGINS = (
    "http://127.0.0.1:5000,http://localhost:5000,http://localhost:3000,http://localhost:5173"
)


def _cors_allow_origins() -> list[str]:
    """Comma-separated `CORS_ORIGINS` env; falls back to local dev URLs."""
    raw = (os.getenv("CORS_ORIGINS") or _DEFAULT_CORS_ORIGINS).strip()
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    if not origins:
        origins = [o.strip() for o in _DEFAULT_CORS_ORIGINS.split(",") if o.strip()]
    return origins

logging.basicConfig(
    level=logging.ERROR,
    format="%(asctime)s - %(levelname)s - %(message)s",
    filename=log_file,
    filemode="a"
)

logger = logging.getLogger("ChatLogger")
logger.setLevel(logging.DEBUG)

from fastapi import FastAPI
from app.core.config import config
from app.core.init_db import ensure_local_db
from app.services.rag_service.rag_factory import RAGProviderFactory
from app.services.scholar_research.scholar_exec_service import ScholarExecutionService
from app.services.citations_service.execution_service import CitationsExecutionService
from starlette.middleware.sessions import SessionMiddleware
from fastapi.middleware.cors import CORSMiddleware
from app.services.rag_service.rag_execution_service import RAGExecutionService
from app.services.summarizer_service.summarizer_execution import SummarizerExecutionService

rag_pipeline = RAGProviderFactory.get_provider()

def create_app() -> FastAPI:
    
    ensure_local_db()
    from app.services.state_manager.local_history_store import LocalHistoryStore
    history_store = LocalHistoryStore()
    http_client = httpx.AsyncClient(timeout=config.HTTP_TIMEOUT)
    rag_service = RAGExecutionService(pipeline=rag_pipeline)
    summarizer_service = SummarizerExecutionService(pipeline=rag_pipeline, history_store=history_store)
    scholar_service = ScholarExecutionService(http_client=http_client)
    citations_service = CitationsExecutionService(http_client=http_client)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        try:
            yield
        finally:
            await http_client.aclose()

    app = FastAPI(lifespan=lifespan)
    cors_origins = _cors_allow_origins()
    if "*" in cors_origins:
        raise RuntimeError(
            "CORS_ORIGINS cannot include '*' while allow_credentials is True. "
            "List explicit origins (e.g. https://app.example.com,https://www.example.com)."
        )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(
            SessionMiddleware, 
            secret_key=os.getenv("SESSION_SECRET_KEY", "change-me-in-production")
        )
    from app.routes.chatbot_routes import init_chatbot_routes
    from app.routes.ingest_routes import init_ingest_routes
    init_ingest_routes(app, history_store, citations_service, rag_service, http_client)
    init_chatbot_routes(app, config.system_prompt, history_store, http_client, rag_service, summarizer_service, scholar_service, citations_service)
    return app

__all__ = ["create_app", "logger"]
