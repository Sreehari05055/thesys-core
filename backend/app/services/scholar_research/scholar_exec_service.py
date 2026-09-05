import asyncio
from app.core.config import config
from app.services.scholar_research.arxiv_service import ArxivResearchService
from app.services.scholar_research.base_research import BaseResearchService
from app.services.scholar_research.node_processing import deduplicate_papers, rerank_papers
from app.services.scholar_research.openalex_service import OpenAlexResearchService
from app import logger

class ScholarExecutionService(BaseResearchService):
    """Orchestrates external scholarly search providers for FetchResearch."""

    def __init__(self, http_client=None):
        self.http_client = http_client
        self._openalex = (
            OpenAlexResearchService(http_client=http_client)
            if getattr(config, "OPENALEX_API_KEY", None)
            else None
        )
        self._arxiv = ArxivResearchService(http_client=http_client)

    async def semantic_scholar_search(self, query=None, **kwargs):
        if kwargs.get("arxiv_id"):
            return await self._arxiv.semantic_scholar_search(query=query, **kwargs)

        openalex_kwargs = {k: v for k, v in kwargs.items() if k != "arxiv_id"}

        if kwargs.get("doi") or kwargs.get("pmid"):
            if not self._openalex:
                return "External research service is not configured."
            return await self._openalex.semantic_scholar_search(query=query, **openalex_kwargs)

        tasks = []
        if self._openalex:
            tasks.append(self._openalex.semantic_scholar_search(query=query, **openalex_kwargs))
        tasks.append(self._arxiv.semantic_scholar_search(query=query, **kwargs))

        raw = await asyncio.gather(*tasks)
        merged = []
        errors = []
        for result in raw:
            if isinstance(result, list):
                merged.extend(result)
            elif isinstance(result, str):
                errors.append(result)

        if not merged:
            return errors[0] if errors else "No papers found."

        deduped = deduplicate_papers(merged)
        count = kwargs.get("count") or 10
        reranked = await rerank_papers(
            user_query=query or "",
            papers=deduped,
            top_n=count,
        )
        return reranked

    async def fetch_research(self, query, **kwargs) -> dict:
        results = await self.semantic_scholar_search(query, **kwargs)
        if isinstance(results, str):
            return {"error": results, "papers": [], "context_text": ""}
        papers = [self.paper_to_frontend(r) for r in results]
        context_text = "\n\n".join(self._format_paper_for_llm(r) for r in results)
        return {"papers": papers, "context_text": context_text}

    async def get_formatted_search_results(self, query, **kwargs) -> str:
        payload = await self.fetch_research(query, **kwargs)
        if payload.get("error"):
            return payload["error"]
        return payload.get("context_text") or ""
