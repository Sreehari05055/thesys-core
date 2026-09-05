from app import logger
from dotenv import load_dotenv
import os
from dataclasses import dataclass, field
from app.prompts.prompts import get_system_prompt
from app.core.hardware import HardwareDetector

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ENV_PATH = os.path.join(BACKEND_ROOT, ".env")

load_dotenv(dotenv_path=ENV_PATH)

@dataclass
class ModelConfig:
    temperature: float = 0.7
    max_tokens: int = 4096
    top_p: float = 0.9


@dataclass
class RAGConfig:
    child_chunk_size: int = 64
    parent_chunk_size: int = 448
    top_k: int = 5
    top_n: int = 8
    max_pdf_pages: int = 40


@dataclass
class AdminConfig:
    """User-configurable settings - modify values here directly"""
    model: ModelConfig = field(default_factory=ModelConfig)
    rag: RAGConfig = field(default_factory=RAGConfig)
    max_conversation_turns: int = 10

# ============================================
# EDIT YOUR SETTINGS HERE
# ============================================
admin = AdminConfig(
    model=ModelConfig(
        temperature=0.7,
        max_tokens=4096,
        top_p=0.9
    ),
    rag=RAGConfig(
        child_chunk_size=64,
        parent_chunk_size=448,
        top_k=30,
        top_n=8,
        max_pdf_pages=150,
    ),
    max_conversation_turns=10
)

class Config:
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    OPENALEX_API_KEY = os.getenv("OPENALEX_API_KEY")
    EMAIL = os.getenv("EMAIL")  # For citeas.org, we use email as the identifier
    try:
        system_prompt = get_system_prompt()

        # Model settings (from AdminConfig)
        TEMPERATURE = admin.model.temperature
        MAX_TOKENS = admin.model.max_tokens
        TOP_P = admin.model.top_p

        EMBED_DIM = 1536

        # RAG defaults (child = embed/retrieve; parent = LLM context / summarizer)
        CHILD_CHUNK_SIZE = admin.rag.child_chunk_size
        PARENT_CHUNK_SIZE = admin.rag.parent_chunk_size
        TOP_K = admin.rag.top_k
        TOP_N = admin.rag.top_n

        USE_GPU_ACCELERATION = HardwareDetector.should_use_acceleration()
        
        # Conversation settings
        MAX_CONVERSATION_TURNS = admin.max_conversation_turns
        HTTP_TIMEOUT = float(os.getenv("HTTP_TIMEOUT", 30.0))  # seconds
    except Exception as e:
        logger.error(f"Error in configuration: {e}")
        raise RuntimeError(f"Error in configuration: {e}") from e

config = Config()