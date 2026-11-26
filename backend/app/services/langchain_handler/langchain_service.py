from langchain_openai import ChatOpenAI
from langchain_core.language_models.chat_models import BaseChatModel
from app.core.config import config

def get_llm(provider: str = None, model_name: str = None) -> BaseChatModel:
    provider = (provider or "").strip().lower()
    model_name = (model_name or "").strip()
    if provider != "openai":
        raise ValueError(f"Unsupported provider: {provider}")
    return ChatOpenAI(
        model=model_name,
        api_key=config.OPENAI_API_KEY,
        max_tokens=config.MAX_TOKENS,
        use_responses_api=True,
        reasoning_effort="low",
    )
