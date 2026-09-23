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
    async def compare_research(self, queries: list[str], user_query: str, session_id: str, search_params=None):
        """Retrieve COMPARE_TOP_N chunks per selected paper, classify pairs with Jev, keep confident relations."""
        search_params = dict(search_params or {})
        doc_ids = [d for d in (search_params.get("doc_ids") or []) if d]
        if len(doc_ids) != 2:
            return {
                "type": "compare_research",
                "context_text": "CompareResearch needs exactly two selected documents.",
                "sources": [],
            }
        queries = queries or [user_query]
        chunks_a = await self._chunks_for_doc(queries, user_query, session_id, search_params, doc_ids[0])
        chunks_b = await self._chunks_for_doc(queries, user_query, session_id, search_params, doc_ids[1])
        if not chunks_a or not chunks_b:
            return {
                "type": "compare_research",
                "context_text": "Not enough retrieved chunks in both papers to compare.",
                "sources": [],
            }

        logger.info(
            "CompareResearch session %s: %d vs %d chunks",
            session_id, len(chunks_a), len(chunks_b),
        )
        labels = await classify_pairs(chunks_a, chunks_b, user_query)

        kept = []
        used = {}
        for qid, ans in labels.items():
            if (ans.get("confidence") or 0) <= config.COMPARE_MIN_CONF:
                continue
            left, right = qid.split("_")
            i, j = int(left[1:]), int(right[1:])
            a, b = chunks_a[i], chunks_b[j]
            kept.append((a, b, ans))
            used[a["id"]] = a
            used[b["id"]] = b

        sources = [
            {
                "choice": ans["choice"],
                "confidence": ans["confidence"],
                "chunk_a": _chunk_without_embedding(a),
                "chunk_b": _chunk_without_embedding(b),
            }
            for a, b, ans in kept
        ]
        unique = [_chunk_without_embedding(c) for c in used.values()]
        lines = []
        if unique:
            lines.append(self.format_context(unique))
        lines.append(f"Relations (confidence > {config.COMPARE_MIN_CONF}):")
        if not kept:
            lines.append("None.")
        else:
            for a, b, ans in kept:
                lines.append(
                    f"[{a['id']}] {ans['choice']} [{b['id']}] confidence_score={ans['confidence']}"
                )
        logger.info(f"Context Text: {"\n".join(lines)}")
        return {
            "type": "compare_research",
            "context_text": "\n".join(lines),
            "sources": sources,
        }
