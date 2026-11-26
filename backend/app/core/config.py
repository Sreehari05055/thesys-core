from dotenv import load_dotenv
import os
from app.prompts import get_system_prompt
from app.core.hardware import should_use_acceleration

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ENV_PATH = os.path.join(BACKEND_ROOT, ".env")

load_dotenv(dotenv_path=ENV_PATH)


class Config:
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    OPENALEX_API_KEY = os.getenv("OPENALEX_API_KEY")
    TYPESAFE_API_KEY = os.getenv("TYPESAFE_API_KEY")
    EMAIL = os.getenv("EMAIL")  # For citeas.org, we use email as the identifier
    system_prompt = get_system_prompt()

    MAX_TOKENS = 4096

    # child = embed/retrieve; parent = LLM context / summarizer
    CHILD_CHUNK_SIZE = 64
    PARENT_CHUNK_SIZE = 512
    TOP_K = 30
    TOP_N = 8
    COMPARE_TOP_N = 4
    COMPARE_MIN_CONF = 0.70
    MAX_PDF_PAGES = 150

    USE_GPU_ACCELERATION = should_use_acceleration()
    MAX_CONVERSATION_TURNS = 10
    HTTP_TIMEOUT = float(os.getenv("HTTP_TIMEOUT", 30.0))  # seconds
    DO_OCR = os.getenv("DO_OCR", "false").strip().lower() == "true"


config = Config()
