import asyncio
from typing import Any, Dict, List, Optional, Union
from langchain_core.messages import HumanMessage, SystemMessage
from app import logger
from app.core.config import config
from app.prompts.prompts import get_summarizer_chunk_extract_prompt, get_summarizer_reduce_prompt
from app.services.langchain_handler.langchain_service import LangChainService

class SummarizerService:
    def __init__(self, pipeline):
        self.pipeline = pipeline

    async def summarize(
        self,
        session_id: str,
        filenames: Optional[List[str]] = None,
        provider: str | None = None,
        model_name: str | None = None,
    ) -> Union[str, Dict[str, Any]]:
        """
        Summarize content from the knowledge base or specific files.
        """
        try:
            chunks_to_summarize: List[dict] = await self.pipeline.fetch_texts_for_summarizer(
                session_id, filenames if filenames else None
            )
            chunks_to_summarize = sorted(chunks_to_summarize, key=self._chunk_sort_key)
            max_concurrent = getattr(config, "MAX_CONCURRENT_QUERIES", 8)
            sem = asyncio.Semaphore(max_concurrent)

            async def _bounded_extract(row: dict) -> str | None:
                async with sem:
                    return await self._extract_chunk(
                        row.get("text") or "",
                        provider=provider,
                        model_name=model_name,
                    )

            extractions = await asyncio.gather(
                *[_bounded_extract(row) for row in chunks_to_summarize]
            )

            joined_extractions = self._join_extractions(chunks_to_summarize, extractions)
            extraction_count = joined_extractions.count("\n\n---\n\n") + 1
            logger.info(
                "Synthesizing paper summary from %d chunk extraction(s) for session %s...",
                extraction_count,
                session_id,
            )
            paper_summary = await self._synthesize_paper_summary(
                joined_extractions,
                provider=provider,
                model_name=model_name,
            )
            if not paper_summary:
                return "An error occurred during summarization: empty paper summary."

            sources = self._rows_to_sources(chunks_to_summarize)
            return {"summary": paper_summary, "sources": sources}
        except Exception as e:
            logger.error(f"Error in SummarizerService.summarize: {e}", exc_info=True)
            return f"An error occurred during summarization: {str(e)}"

    @staticmethod
    def _rows_to_sources(rows: List[dict]) -> List[Dict[str, Any]]:
        """Build chat-compatible source dicts for PDF highlight / citation resolution."""
        sources: List[Dict[str, Any]] = []
        seen_ids: set[str] = set()
        for row in rows:
            chunk_id = row["chunk_id"]
            if chunk_id in seen_ids:
                continue
            seen_ids.add(chunk_id)
            sources.append(
                {
                    "content": row.get("text") or "",
                    "id": chunk_id,
                    "doc_id": row.get("doc_id") or "",
                    "filename": row.get("filename") or "",
                    "title": row.get("title") or "",
                    "pages": row.get("pages") or [],
                    "bboxes": row.get("bboxes") or [],
                    "reference_section": False,
                }
            )
        return sources

    @staticmethod
    def _chunk_sort_key(row: dict) -> tuple:
        pages = row.get("pages") or []
        first_page = min(pages) if pages else 0
        return (first_page, row.get("chunk_id") or "")

    @staticmethod
    def _join_extractions(rows: List[dict], extractions: List[str]) -> str:
        """Attach source_id per extraction in code for the synthesis step."""
        blocks: List[str] = []
        for row, raw in zip(rows, extractions):
            text = (raw or "").strip()
            if not text:
                continue
            chunk_id = row["chunk_id"]
            title = row.get("title") or row.get("filename") or ""
            pages = row.get("pages") or []
            page_label = ", ".join(str(p) for p in pages) if pages else "?"
            blocks.append(
                f"Source ID: [{chunk_id}]\n"
                f"Title: {title} (Pages {page_label})\n"
                f"EXTRACTION:\n{text}"
            )
        return "\n\n---\n\n".join(blocks)

    @staticmethod
    def _response_content_to_str(content: Any) -> str:
        if isinstance(content, list):
            return " ".join(
                c.get("text", "") if isinstance(c, dict) else str(c) for c in content
            ).strip()
        return (content or "").strip()

    async def _extract_chunk(
        self,
        chunk_text: str,
        provider: str | None = None,
        model_name: str | None = None,
    ) -> str | None:
        """Map step: structured JSON extraction from one chunk. ``None`` when the call fails."""
        try:
            messages = [
                SystemMessage(content=get_summarizer_chunk_extract_prompt()),
                HumanMessage(content=chunk_text),
            ]
            llm = LangChainService.get_llm(provider=provider, model_name=model_name)
            response = await llm.ainvoke(messages)
            return self._response_content_to_str(response.content)
        except Exception as e:
            logger.error(f"Error extracting chunk: {e}")
            return None

    async def _synthesize_paper_summary(
        self,
        joined_extractions: str,
        provider: str | None = None,
        model_name: str | None = None,
    ) -> str:
        """Merge per-chunk extractions into one structured academic paper summary."""
        try:
            messages = [
                SystemMessage(content=get_summarizer_reduce_prompt()),
                HumanMessage(content=joined_extractions),
            ]
            llm = LangChainService.get_llm(provider=provider, model_name=model_name)
            response = await llm.ainvoke(messages)
            return self._response_content_to_str(response.content)
        except Exception as e:
            logger.error(f"Error synthesizing paper summary: {e}", exc_info=True)
            return ""
