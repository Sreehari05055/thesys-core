import os
from typing import Any, Dict, List, Optional
from app import logger
from app.services.summarizer_service.summarizer_service import SummarizerService

class SummaryPersistError(Exception):
    """Summarization succeeded but saving to ``document_summaries`` failed."""

class SummarizerExecutionService:
    def __init__(self, pipeline, history_store):
        self.summarizer = SummarizerService(pipeline=pipeline)
        self._history_store = history_store

    async def summarize(
        self,
        session_id: str,
        filenames: Optional[List[str]] = None,
        *,
        provider: str | None = None,
        model_name: str | None = None,
        doc_id: Optional[str] = None,
    ) -> Dict[str, Any] | str:
        """Summarize content from KB or specific files.

        On success returns ``{"summary": "...", "sources": [...]}`` (plus ``summary_id`` /
        ``created_at`` when persisted). When exactly one file is summarized, appends a
        row to ``document_summaries`` (multiple runs per doc are allowed).
        """
        result = await self.summarizer.summarize(
            session_id,
            filenames,
            provider=provider,
            model_name=model_name,
        )
        if not isinstance(result, dict):
            return result

        names = [os.path.basename((n or "").strip()) for n in (filenames or []) if (n or "").strip()]
        if len(names) != 1:
            return result

        filename = names[0]
        resolved_doc_id = (doc_id or "").strip()
        summary_text = result.get("summary") or ""
        sources = result.get("sources") or []
        try:
            saved = await self._history_store.insert_document_summary(
                chat_id=session_id,
                doc_id=resolved_doc_id,
                filename=filename,
                chunks=[{"summary": summary_text, "sources": sources}],
            )
            result["summary_id"] = saved["id"]
            result["created_at"] = saved["created_at"]
        except Exception as e:
            logger.error(
                "document_summaries insert failed chat_id=%s doc_id=%s: %s",
                session_id,
                resolved_doc_id,
                e,
                exc_info=True,
            )
            raise SummaryPersistError(
                "Summary generated but could not be saved."
            ) from e
        return result
