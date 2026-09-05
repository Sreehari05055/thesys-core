import asyncio
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage

from app import logger
from app.core.config import config
from app.prompts.prompts import get_session_title_prompt
from app.services.langchain_handler.langchain_service import LangChainService


class SessionTitleService:
    """LLM title from the first user message; persistence + cleanup live in the history store."""

    async def generate_and_set_first_title(
        self,
        store,
        session_id: str,
        first_message: str,
        *,
        provider: Optional[str] = None,
        model_name: Optional[str] = None,
    ) -> Optional[str]:
        provider = (provider or "").strip()
        model_name = (model_name or "").strip()
        text = (first_message or "").strip()
        if not provider or not model_name or not text:
            return None

        try:
            llm = LangChainService.get_llm(provider=provider, model_name=model_name)
            try:
                llm = llm.bind(max_tokens=32, temperature=0.3)
            except Exception:
                pass
            response = await asyncio.wait_for(
                llm.ainvoke([
                    SystemMessage(content=get_session_title_prompt()),
                    HumanMessage(content=text),
                ]),
                timeout=config.HTTP_TIMEOUT,
            )
            content = response.content
            if isinstance(content, list):
                content = " ".join(
                    c.get("text", "") if isinstance(c, dict) else str(c) for c in content
                )
            raw_title = str(content).strip()
            if not raw_title:
                return None
            saved = await store.set_title_if_default(session_id, raw_title)
            if saved:
                logger.info("Set session title for %s: %s", session_id, saved)
            return saved
        except Exception as e:
            logger.warning("Session title generation failed for %s: %s", session_id, e)
            return None
