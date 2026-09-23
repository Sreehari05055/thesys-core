from app import logger
from typing import Any, Dict, List
from app.core.config import config
from app.services.jev_service import classify_pairs


def _chunk_without_embedding(chunk: Dict[str, Any]) -> Dict[str, Any]:
    """Drop vector / internal keys from a corpus chunk dict."""
    return {k: v for k, v in chunk.items() if k not in ("embedding", "parent_id")}


class RAGExecutionService:
    def __init__(self, pipeline=None):
        self.rag_pipeline = pipeline

    async def init_index(self, session_id: str):
        """Initial load of the index for a session."""
        await self.rag_pipeline._load_index(session_id)

    async def rebuild_index(self, session_id: str):
        """Full wipe and rebuild of the index for a specific session."""
        await self.rag_pipeline._build_index(session_id)

    async def add_to_index(self, session_id: str, file_paths: list[str]):
        """Incrementally add new files to an existing index without rebuilding."""
        await self.rag_pipeline._add_to_index(session_id, file_paths)

    async def clear_session_vectors(self, session_id: str) -> None:
        """Delete all embedding rows for a session (no-op if pipeline lacks delete support)."""
        if self.rag_pipeline and hasattr(self.rag_pipeline, "delete_session_vectors"):
            await self.rag_pipeline.delete_session_vectors(session_id)

    async def fetch_file_regions(self, session_id: str, doc_id: str) -> List[Dict[str, Any]]:
        if self.rag_pipeline and hasattr(self.rag_pipeline, "fetch_file_regions"):
            return await self.rag_pipeline.fetch_file_regions(session_id, doc_id)
        return []

    @staticmethod
    def format_context(context_list: List[dict]) -> str:
        """Format a list of chunks into a string for the LLM."""
        return "\n\n".join([
            f"Source ID: [{n['id']}]\n"
            f"Title: {n['title']} (Pages {', '.join(map(str, n.get('pages', [])))})\n"
            f"CONTENT: {n['content']}"
            for n in context_list
        ])

    async def _chunks_for_doc(self, queries, user_query, session_id, search_params, doc_id):
        params = dict(search_params)
        params["doc_ids"] = [doc_id]
        params["top_n"] = config.COMPARE_TOP_N
        return await self.rag_pipeline._get_corpus_data(
            queries, user_query, session_id, search_params=params
        )

    async def get_info(self, queries: list[str], user_query: str, session_id: str, search_params=None):
        logger.info(f"Fetching quick knowledge for session {session_id} using keywords: {queries}")
        context_list = await self.rag_pipeline._get_corpus_data(queries, user_query, session_id, search_params=search_params)
        sources = [_chunk_without_embedding(c) for c in context_list]
        return {
            "type": "search_research",
            "context_text": self.format_context(context_list),
            "sources": sources,
        }
