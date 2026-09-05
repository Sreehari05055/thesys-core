import json
import os
from typing import Any, List
from urllib.parse import unquote
import chromadb
from llama_index.core import Document, StorageContext, VectorStoreIndex
from llama_index.core.schema import NodeRelationship, RelatedNodeInfo, TextNode
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.postprocessor.flag_embedding_reranker import FlagEmbeddingReranker
from llama_index.vector_stores.chroma import ChromaVectorStore
from app.core.init_db import DEFAULT_DB_PATH
from app.services.parser import iter_documents
from app.services.rag_service.base_rag_pipeline import BaseRAGPipeline
from app.services.rag_service.chunking_service import ChunkingService
from app.utils.bbox_utils import as_list, filter_highlight_bboxes
from app.core.config import config

_REGION_TAGS = frozenset({"table", "code"})
_CHROMA_DIR = os.path.join(os.path.dirname(DEFAULT_DB_PATH), "chroma")
_EMBED_MODEL = "BAAI/bge-small-en-v1.5"
_RERANK_MODEL = "BAAI/bge-reranker-base"
_EXCLUDE_EMBED = [
    "bboxes",
    "pages",
    "file_type",
    "title",
    "reference_section",
    "parent_id",
    "parent_text",
    "parent_child_index",
    "parent_pages",
    "parent_bboxes",
    "parent_reference_section",
]
_EXCLUDE_LLM = ["bboxes", "pages", "file_type", "reference_section"]

def _chroma_safe(meta: dict) -> dict:
    """Chroma metadata values must be str/int/float/bool."""
    out = {}
    for k, v in meta.items():
        if isinstance(v, (list, dict)):
            out[k] = json.dumps(v)
        elif isinstance(v, (str, int, float, bool)):
            out[k] = v
    return out

def _pdf_docs_to_nodes(pdf_docs, session_id: str) -> list:
    """Chunk PDFs and build TextNodes (``doc_id`` in metadata)."""
    nodes = []
    chunking_service = ChunkingService()
    for doc in pdf_docs:
        doc_id = doc["id"]
        chunks = chunking_service.chunk_pdf_elements(
            pdf_page_data=doc["page_data"],
            doc_id=doc_id,
            doc_title=doc["title"],
        )
        for idx, chunk in enumerate(chunks):
            chunk_metadata = _chroma_safe({
                **doc["metadata"],
                **chunk["metadata"],
                "doc_id": doc_id,
                "session_id": session_id,
            })
            nodes.append(
                TextNode(
                    text=chunk["content"],
                    id_=f"{doc_id}_c{idx}",
                    metadata=chunk_metadata,
                    relationships={
                        NodeRelationship.SOURCE: RelatedNodeInfo(node_id=doc_id),
                    },
                    excluded_embed_metadata_keys=_EXCLUDE_EMBED,
                    excluded_llm_metadata_keys=_EXCLUDE_LLM,
                )
            )
    return nodes


def _region_from_row(node_id, text, meta_raw) -> dict | None:
    """Map a table/code chunk to a reader overlay region."""
    meta = meta_raw if isinstance(meta_raw, dict) else {}
    tag = (meta.get("tag") or "").lower()
    if tag not in _REGION_TAGS:
        return None
    pages = as_list(meta.get("pages"))
    bboxes = filter_highlight_bboxes(as_list(meta.get("bboxes")))
    content = (text or "").strip()
    return {
        "id": str(node_id),
        "tag": tag,
        "page": pages[0] if pages else None,
        "pages": pages,
        "bboxes": bboxes,
        "content": content,
        "preview": content.split("\n", 1)[0][:160],
    }


class LocalRAGPipeline(BaseRAGPipeline):
    """Per-session Chroma collections + BGE embed / BAAI rerank."""

    def __init__(self):
        super().__init__()
        os.makedirs(_CHROMA_DIR, exist_ok=True)
        self._client = chromadb.PersistentClient(path=_CHROMA_DIR)
        
        self.doc_embed_model = HuggingFaceEmbedding(
            model_name=_EMBED_MODEL,
            device = "cuda" if config.USE_GPU_ACCELERATION else "cpu",
            query_instruction="Represent this sentence for searching relevant passages: ",
        )
        self.query_embed_model = self.doc_embed_model
        self.reranker = self.create_reranker()

    def get_doc_embed_model(self):
        return self.doc_embed_model

    def get_query_embed_model(self):
        return self.query_embed_model

    def get_reranker(self):
        return self.reranker

    def create_reranker(self, top_n: int | None = None):
        return FlagEmbeddingReranker(
            model=_RERANK_MODEL,
            top_n=top_n or self.config.TOP_N,
        )

    def _files_dir(self, session_id: str) -> str:
        return os.path.join(os.path.dirname(DEFAULT_DB_PATH), "sessions", session_id, "source_files")

    def _collection(self, session_id: str):
        return self._client.get_or_create_collection(name=session_id)

    def _vector_store(self, session_id: str) -> ChromaVectorStore:
        return ChromaVectorStore(chroma_collection=self._collection(session_id))

    def _fresh_index(self, session_id: str) -> VectorStoreIndex:
        storage_context = StorageContext.from_defaults(vector_store=self._vector_store(session_id))
        return VectorStoreIndex.from_vector_store(
            storage_context.vector_store,
            embed_model=self.doc_embed_model,
        )

    def _index_nodes(self, session_id: str, nodes: list) -> VectorStoreIndex:
        index = self._fresh_index(session_id)
        index.insert_nodes(nodes)
        BaseRAGPipeline.session_indices[session_id] = index
        return index

    async def _load_index(self, session_id: str):
        BaseRAGPipeline.session_indices[session_id] = self._fresh_index(session_id)

    async def _add_to_index(self, session_id: str, file_paths: List[str]):
        nodes = _pdf_docs_to_nodes(
            list(iter_documents(self._files_dir(session_id), file_paths)),
            session_id,
        )
        index = self._fresh_index(session_id)
        index.insert_nodes(nodes)
        BaseRAGPipeline.session_indices[session_id] = index

    async def _build_index(self, session_id: str):
        await self.delete_session_vectors(session_id)
        data_dir = self._files_dir(session_id)
        os.makedirs(data_dir, exist_ok=True)
        nodes = _pdf_docs_to_nodes(list(iter_documents(data_dir)), session_id)
        self._index_nodes(session_id, nodes)

    async def delete_session_vectors(self, session_id: str) -> None:
        BaseRAGPipeline.session_indices.pop(session_id, None)
        try:
            self._client.delete_collection(session_id)
        except Exception:
            pass

    async def _fetch_embeddings(self, session_id: str, chunk_ids: list) -> dict:
        chunk_ids = [cid for cid in chunk_ids if cid]
        if not chunk_ids:
            return {}
        data = self._collection(session_id).get(ids=chunk_ids, include=["embeddings"])
        return {
            nid: emb
            for nid, emb in zip(data["ids"], data["embeddings"])
            if emb is not None
        }

    def _chunks_by_ids(self, session_id: str, chunk_ids: list) -> list:
        data = self._collection(session_id).get(
            ids=list(chunk_ids),
            include=["documents", "metadatas", "embeddings"],
        )
        return [
            self.chunk_dict_from_row(
                nid,
                text or "",
                meta or {},
                embedding=emb,
            )
            for nid, text, meta, emb in zip(
                data["ids"], data["documents"], data["metadatas"], data["embeddings"]
            )
        ]

    async def _get_corpus_data(
        self, questions: List[str], user_query: str, session_id: str, search_params=None
    ) -> list:
        search_params = search_params or {}
        source_ids = search_params.get("source_ids")
        if source_ids:
            return self._chunks_by_ids(session_id, source_ids)
        await self._load_index(session_id)
        return await self._retrieve_from_session_index(
            questions, user_query, session_id, search_params
        )

    async def fetch_texts_for_summarizer(
        self, session_id: str, filenames: list | None = None
    ) -> list:
        data = self._collection(session_id).get(include=["documents", "metadatas"])
        wanted = set(filenames) if filenames else None
        rows = []
        for nid, text, meta in zip(data["ids"], data["documents"], data["metadatas"]):
            meta = meta or {}
            if meta.get("reference_section"):
                continue
            if wanted and (meta.get("filename") or meta.get("title")) not in wanted:
                continue
            rows.append({
                "chunk_id": nid,
                "text": text or "",
                "doc_id": meta.get("doc_id") or "",
                "filename": meta.get("filename") or "",
                "title": meta.get("title") or "",
                "pages": as_list(meta.get("pages")),
                "bboxes": as_list(meta.get("bboxes")),
            })
        return rows

    async def fetch_file_regions(self, session_id: str, doc_id: str) -> List[dict[str, Any]]:
        needle = unquote(doc_id or "").strip().lower()
        data = self._collection(session_id).get(include=["documents", "metadatas"])
        regions = []
        for nid, text, meta in zip(data["ids"], data["documents"], data["metadatas"]):
            meta = meta or {}
            if (meta.get("doc_id") or "").strip().lower() != needle:
                continue
            region = _region_from_row(nid, text, meta)
            if region:
                regions.append(region)
        regions.sort(key=lambda r: (r.get("page") or 0, r.get("id") or ""))
        return regions