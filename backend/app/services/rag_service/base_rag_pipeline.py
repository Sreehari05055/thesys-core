from abc import ABC, abstractmethod
from typing import List, Dict, Any
import asyncio
import hashlib
from app import logger
from app.core.config import config
from llama_index.core import QueryBundle
from llama_index.core.schema import MetadataMode
from llama_index.core.vector_stores.types import MetadataFilters, MetadataFilter, FilterOperator
from app.utils.bbox_utils import as_list, filter_highlight_bboxes


class BaseRAGPipeline(ABC):
    """
    Shared RAG orchestration: embed/rerank hooks (abstract) + dedupe/rerank + vector retrieval
    when a LlamaIndex index is already in ``session_indices``.
    """
    session_indices = {}

    def __init__(self):
        self.config = config

    @abstractmethod
    def get_doc_embed_model(self):
        """Return the embedding model for document indexing."""
        ...

    @abstractmethod
    def get_query_embed_model(self):
        """Return the embedding model for query retrieval."""
        ...

    @abstractmethod
    def get_reranker(self):
        """Return the reranker model."""
        ...

    @abstractmethod
    def create_reranker(self, top_n: int | None = None):
        """Return a fresh per-request reranker (must not mutate the shared singleton)."""
        ...

    @abstractmethod
    async def _load_index(self, session_id: str):
        """Load or establish an in-memory index handle for the session."""
        ...

    @abstractmethod
    async def _add_to_index(self, session_id: str, file_paths: List[str]):
        """Incrementally index new files."""
        ...

    @abstractmethod
    async def _build_index(self, session_id: str):
        """Full rebuild of the session index."""
        ...

    @abstractmethod
    async def _get_corpus_data(
        self, questions: List[str], user_query: str, session_id: str, search_params=None
    ) -> list:
        """Retrieve ranked context chunks for retrieval/RAG."""
        ...

    @staticmethod
    def _node_is_reference_section(node) -> bool:
        return bool(node.node.metadata.get("reference_section"))

    def _remove_reference_sections(self, nodes: list) -> list:
        """Exclude bibliography/reference chunks from reranking candidates."""
        return [n for n in nodes if not self._node_is_reference_section(n)]

    async def _retrieve_from_session_index(
        self,
        questions: List[str],
        user_query: str,
        session_id: str,
        search_params: Dict[str, Any],
    ) -> list:
        """
        Vector search + rerank using ``session_indices[session_id]`` (caller must set index).
        """
        top_k = search_params.get("top_k") or self.config.TOP_K
        top_n = search_params.get("top_n") or self.config.TOP_N
        doc_ids = search_params.get("doc_ids") or []

        index = BaseRAGPipeline.session_indices[session_id]
        sem = asyncio.Semaphore(getattr(self.config, "MAX_CONCURRENT_QUERIES", 8))

        filter_list = [
            MetadataFilter(key="role", value="child", operator=FilterOperator.EQ),
        ]
        if doc_ids:
            logger.info(f"Doc-scoped retrieval for doc_ids={doc_ids} (global top_n={top_n})")
            filter_list.append(
                MetadataFilter(key="doc_id", value=list(doc_ids), operator=FilterOperator.IN)
            )
        filters = MetadataFilters(filters=filter_list)

        retriever = index.as_retriever(
            similarity_top_k=top_k,
            embed_model=self.get_query_embed_model(),
            filters=filters,
        )

        async def _retrieve(q: str):
            async with sem:
                return await retriever.aretrieve(q)

        all_results = await asyncio.gather(*[asyncio.create_task(_retrieve(q)) for q in questions])
        flattened_results = [item for sublist in all_results for item in sublist]

        if not flattened_results:
            logger.warning(f"No results retrieved from RAG index for session {session_id}.")
            return []

        unique_results = await self._remove_duplicates(flattened_results)
        diverse = self._best_child_per_parent(unique_results)
        candidates = self._remove_reference_sections(diverse)
        final_results = await self._global_reranker(candidates, user_query, top_n=top_n)
        return [self._node_to_corpus_dict(n) for n in final_results]

    @staticmethod
    def _corpus_display_fields(meta: dict, child_text: str) -> tuple[str, list, list, list]:
        """Child hit fields; content is replaced with parent text after get(ids=parent_id)."""
        pages = as_list(meta["parent_pages"])
        bboxes = filter_highlight_bboxes(as_list(meta["parent_bboxes"]))
        precise_bboxes = filter_highlight_bboxes(as_list(meta.get("bboxes")))
        return child_text.strip(), pages, bboxes, precise_bboxes

    @staticmethod
    def chunk_dict_from_row(
        node_id: str,
        child_text: str,
        meta: dict,
        *,
        score: float = 0.0,
    ) -> dict:
        """Build a corpus/source dict from a child chunk row + metadata."""
        content, pages, bboxes, precise_bboxes = BaseRAGPipeline._corpus_display_fields(
            meta, child_text
        )
        return {
            "content": content,
            "id": node_id,
            "parent_id": meta["parent_id"],
            "doc_id": meta.get("doc_id") or "",
            "filename": meta.get("filename") or "",
            "title": meta.get("title", ""),
            "pages": pages,
            "bboxes": bboxes,
            "precise_bboxes": precise_bboxes,
            "score": score,
            "reference_section": bool(meta.get("reference_section")),
        }

    def _node_to_corpus_dict(self, n) -> dict:
        return self.chunk_dict_from_row(
            n.node.id_,
            n.get_content(MetadataMode.NONE),
            n.node.metadata,
            score=n.score,
        )

    def _compute_relevance_threshold(self, reranked_nodes: list) -> float:
        """Threshold from score spread (Cohere-style vs wider ranges)."""
        max_score = reranked_nodes[0].score
        min_score = reranked_nodes[-1].score
        score_range = max_score - min_score

        if score_range > 0.3:
            return max_score - (score_range * 0.6)
        return 0.10

    async def _global_reranker(self, content: list, user_query: str, top_n: int = None):
        """Rerank retrieved nodes; shared across backends."""
        if top_n is None:
            top_n = self.config.TOP_N
        reranker = self.create_reranker(top_n=top_n)
        reranked_nodes = await asyncio.to_thread(
            reranker.postprocess_nodes,
            content,
            QueryBundle(query_str=user_query),
        )
        threshold = self._compute_relevance_threshold(reranked_nodes)
        filtered_nodes = [node for node in reranked_nodes if node.score >= threshold]
        logger.info(
            f"Reranking filtered: {len(content)} → {len(reranked_nodes)} → {len(filtered_nodes)} "
            f"(threshold: {threshold:.4f})"
        )
        return filtered_nodes

    @staticmethod
    def _best_child_per_parent(nodes: list) -> list:
        """Drop extra children of the same parent; keep the highest retrieval score."""
        best: dict = {}
        for n in nodes:
            pid = n.node.metadata["parent_id"]
            score = n.score if n.score is not None else float("-inf")
            prev = best.get(pid)
            if prev is None or score > (prev.score if prev.score is not None else float("-inf")):
                best[pid] = n
        ranked = list(best.values())
        ranked.sort(key=lambda n: n.score if n.score is not None else float("-inf"), reverse=True)
        return ranked

    async def _remove_duplicates(self, content: list):
        """Deduplicate nodes by content hash."""
        seen_hashes = set()
        unique_docs = []
        for doc in content:
            content_hash = hashlib.md5(doc.get_content(MetadataMode.NONE).encode("utf-8")).hexdigest()
            if content_hash not in seen_hashes:
                unique_docs.append(doc)
                seen_hashes.add(content_hash)
        return unique_docs
