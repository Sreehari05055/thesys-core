from langchain_openai import ChatOpenAI
from langchain_core.language_models.chat_models import BaseChatModel
from app.core.config import config

class LangChainService:
    @staticmethod
    def get_llm(provider: str = None, model_name: str = None) -> BaseChatModel:
        """
        Factory to get the appropriate LangChain chat model based on provider.
        """
        provider = (provider or "").strip().lower()
        model_name = (model_name or "").strip()
        max_tokens = config.MAX_TOKENS

        if provider == "openai":
            return ChatOpenAI(
                model=model_name,
                api_key=config.OPENAI_API_KEY,
                max_tokens=max_tokens,
                use_responses_api=True,
                reasoning_effort="low",
            )
        else:
            raise ValueError(f"Unsupported provider: {provider}")
