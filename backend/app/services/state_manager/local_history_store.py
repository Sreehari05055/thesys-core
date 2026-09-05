"""SQLite history store. Schema is applied in ``ensure_local_db``; this only queries."""
from __future__ import annotations
import asyncio
import hashlib
import json
import os
import re
import shutil
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from app.core.init_db import DEFAULT_DB_PATH
from app.services.state_manager.base_history import BaseHistoryStore, DocIdNotFoundError

DEFAULT_TITLE = "New Chat"

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _clean_title(title: str) -> str:
    return re.sub(r"\s+", " ", title).strip().strip("\"'")

def _doc_id(filename: str) -> str:
    return hashlib.md5(os.path.basename(filename).encode()).hexdigest()

def _pack_content(message: dict) -> str:
    packed = {"text": message["content"]}
    if "active_documents" in message:
        packed["active_documents"] = message["active_documents"]
    return json.dumps(packed)

def _dumps(value):
    return json.dumps(value) if value is not None else None

class LocalHistoryStore(BaseHistoryStore):
    def __init__(self, db_path: str | None = None):
        self.db_path = db_path or DEFAULT_DB_PATH
        self.files_root = os.path.join(os.path.dirname(self.db_path), "sessions")
        self._lock = threading.Lock()  
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")

    async def _run(self, fn, *args):
        def _call():
            with self._lock:
                return fn(*args)

        return await asyncio.to_thread(_call)

    def _touch(self, chat_id: str) -> None:
        self._conn.execute("UPDATE chats SET updated_at = ? WHERE id = ?", (_now(), chat_id))

    def _file_path(self, chat_id: str, filename: str) -> str:
        directory = os.path.join(self.files_root, chat_id, "source_files")
        os.makedirs(directory, exist_ok=True)
        return os.path.join(directory, os.path.basename(filename))

    async def create_session(self, user_id=None) -> str:
        return await self._run(self._create_session)

    def _create_session(self) -> str:
        chat_id = str(uuid.uuid4())
        self._conn.execute("INSERT INTO chats (id) VALUES (?)", (chat_id,))
        self._conn.commit()
        return chat_id

    async def list_sessions(self, user_id=None) -> list[dict]:
        return await self._run(self._list_sessions)

    def _list_sessions(self) -> list[dict]:
        rows = self._conn.execute(
            "SELECT id, title, created_at, updated_at FROM chats ORDER BY updated_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    async def get_session_title(self, session_id: str) -> str:
        return await self._run(self._get_session_title, session_id)

    def _get_session_title(self, session_id: str) -> str:
        row = self._conn.execute("SELECT title FROM chats WHERE id = ?", (session_id,)).fetchone()
        return row["title"]

    async def set_session_title(self, session_id: str, title: str):
        if not title:
            return None
        clean = _clean_title(title)
        if not clean:
            return None
        return await self._run(self._set_session_title, session_id, clean)

    def _set_session_title(self, session_id: str, title: str) -> str:
        self._conn.execute(
            "UPDATE chats SET title = ?, updated_at = ? WHERE id = ?",
            (title, _now(), session_id),
        )
        self._conn.commit()
        return title

    async def set_title_if_default(self, session_id: str, title: str):
        clean = _clean_title(title)
        if not clean:
            return None
        return await self._run(self._set_title_if_default, session_id, clean)

    def _set_title_if_default(self, session_id: str, title: str):
        cur = self._conn.execute(
            "UPDATE chats SET title = ?, updated_at = ? WHERE id = ? AND title = ?",
            (title, _now(), session_id, DEFAULT_TITLE),
        )
        self._conn.commit()
        return title if cur.rowcount else None

    async def get_settings(self, session_id: str) -> dict:
        return await self._run(self._get_settings, session_id)

    def _get_settings(self, session_id: str) -> dict:
        row = self._conn.execute("SELECT config FROM chats WHERE id = ?", (session_id,)).fetchone()
        return json.loads(row["config"])

    async def save_settings(self, session_id: str, settings: dict):
        await self._run(self._save_settings, session_id, settings)

    def _save_settings(self, session_id: str, settings: dict) -> None:
        merged = json.loads(
            self._conn.execute("SELECT config FROM chats WHERE id = ?", (session_id,)).fetchone()["config"]
        )
        merged.update(settings)
        self._conn.execute(
            "UPDATE chats SET config = ?, updated_at = ? WHERE id = ?",
            (json.dumps(merged), _now(), session_id),
        )
        self._conn.commit()

    async def get_llm_model(self, model_name: str):
        return await self._run(self._get_llm_model, model_name)

    def _get_llm_model(self, model_name: str):
        row = self._conn.execute(
            "SELECT provider, model FROM llm_models WHERE model = ? AND is_active = 1",
            (model_name,),
        ).fetchone()
        if not row:
            return None
        return {"provider": row["provider"], "name": row["model"]}

    async def get_messages(self, session_id: str) -> list[dict]:
        return await self._run(self._get_messages, session_id)

    def _get_messages(self, session_id: str) -> list[dict]:
        rows = self._conn.execute(
            "SELECT id, role, content, tool_calls, tool_call_id, name FROM messages "
            "WHERE chat_id = ? ORDER BY rowid",
            (session_id,),
        ).fetchall()
        sources_by_msg: dict[str, list] = {}
        for src in self._conn.execute(
            "SELECT message_id, chunk_id, doc_id, title, pages, bbox, precise_bbox, score, content "
            "FROM sources WHERE chat_id = ?",
            (session_id,),
        ):
            sources_by_msg.setdefault(src["message_id"], []).append(
                {
                    "id": src["chunk_id"],
                    "doc_id": src["doc_id"],
                    "title": src["title"],
                    "pages": json.loads(src["pages"]) if src["pages"] else [],
                    "bbox": json.loads(src["bbox"]) if src["bbox"] else None,
                    "precise_bbox": json.loads(src["precise_bbox"]) if src["precise_bbox"] else None,
                    "score": src["score"],
                    "content": src["content"],
                }
            )
        papers_by_msg: dict[str, list] = {}
        for paper in self._conn.execute(
            "SELECT message_id, paper_id, title, authors, publication_year, doi, abstract, "
            "is_open_access, pdf_verified, pdf_url, landing_page_url, rerank_score "
            "FROM external_papers WHERE chat_id = ?",
            (session_id,),
        ):
            item = {
                "id": paper["paper_id"],
                "title": paper["title"],
                "authors": paper["authors"],
                "publication_year": paper["publication_year"],
                "doi": paper["doi"],
                "abstract": paper["abstract"],
                "is_open_access": bool(paper["is_open_access"]),
                "pdf_verified": bool(paper["pdf_verified"]),
                "pdf_url": paper["pdf_url"] if paper["pdf_verified"] else None,
                "landing_page_url": paper["landing_page_url"],
            }
            if paper["rerank_score"] is not None:
                item["rerank_score"] = paper["rerank_score"]
            papers_by_msg.setdefault(paper["message_id"], []).append(item)

        messages = []
        for row in rows:
            body = json.loads(row["content"])
            msg = {
                "id": row["id"],
                "role": row["role"],
                "content": body["text"],
                "tool_calls": json.loads(row["tool_calls"]) if row["tool_calls"] else [],
                "tool_call_id": row["tool_call_id"],
                "name": row["name"],
            }
            if "active_documents" in body:
                msg["active_documents"] = body["active_documents"]
            if row["id"] in sources_by_msg:
                msg["sources"] = sources_by_msg[row["id"]]
            if row["id"] in papers_by_msg:
                msg["papers"] = papers_by_msg[row["id"]]
            messages.append(msg)
        return messages

    async def add_message(
        self,
        session_id: str,
        message: dict,
        sources=None,
        papers=None,
        message_id=None,
    ) -> str:
        return await self._run(self._add_message, session_id, message, sources, papers, message_id)

    def _add_message(self, session_id, message, sources, papers, message_id) -> str:
        mid = message_id or str(uuid.uuid4())
        self._conn.execute(
            "INSERT INTO messages (id, chat_id, role, content, tool_calls, tool_call_id, name, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                mid,
                session_id,
                message["role"],
                _pack_content(message),
                _dumps(message.get("tool_calls")),
                message.get("tool_call_id"),
                message.get("name"),
                _now(),
            ),
        )
        for src in self._iter_sources(sources):
            self._conn.execute(
                "INSERT INTO sources (id, message_id, chat_id, chunk_id, doc_id, title, pages, "
                "bbox, precise_bbox, score, content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    mid,
                    session_id,
                    src["id"],
                    src.get("doc_id") or "",
                    src.get("title"),
                    _dumps(src.get("pages")),
                    _dumps(src.get("bbox") or src.get("bboxes")),
                    _dumps(src.get("precise_bbox") or src.get("precise_bboxes")),
                    src.get("score"),
                    src.get("content") or src.get("text"),
                ),
            )
        for paper in papers or ():
            verified = 1 if paper.get("pdf_verified") else 0
            self._conn.execute(
                "INSERT INTO external_papers (id, message_id, chat_id, paper_id, title, authors, "
                "publication_year, doi, abstract, is_open_access, pdf_verified, pdf_url, "
                "landing_page_url, rerank_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    mid,
                    session_id,
                    paper["id"],
                    paper.get("title"),
                    paper.get("authors"),
                    paper.get("publication_year"),
                    paper.get("doi"),
                    paper.get("abstract"),
                    1 if paper.get("is_open_access") else 0,
                    verified,
                    paper.get("pdf_url") if verified else None,
                    paper.get("landing_page_url"),
                    paper.get("rerank_score"),
                ),
            )
        self._touch(session_id)
        self._conn.commit()
        return mid

    @staticmethod
    def _iter_sources(sources):
        if not sources:
            return
        for src in sources:
            if "chunk_a" in src:
                yield src["chunk_a"]
                if "chunk_b" in src:
                    yield src["chunk_b"]
            else:
                yield src

    async def get_session_source_ids(self, session_id: str) -> list[str]:
        return await self._run(self._get_session_source_ids, session_id)

    def _get_session_source_ids(self, session_id: str) -> list[str]:
        rows = self._conn.execute(
            "SELECT DISTINCT chunk_id FROM sources WHERE chat_id = ? AND chunk_id <> ''",
            (session_id,),
        ).fetchall()
        return [r["chunk_id"] for r in rows]

    async def get_verified_external_pdf_url(self, session_id: str, paper_id: str, url: str):
        return await self._run(self._get_verified_external_pdf_url, session_id, paper_id, url)

    def _get_verified_external_pdf_url(self, session_id, paper_id, url):
        row = self._conn.execute(
            "SELECT pdf_url FROM external_papers "
            "WHERE chat_id = ? AND paper_id = ? AND pdf_verified = 1 AND pdf_url = ?",
            (session_id, paper_id, url),
        ).fetchone()
        return row["pdf_url"] if row else None

    async def clear_session(self, session_id: str):
        await self._run(self._clear_session, session_id)

    def _clear_session(self, session_id: str) -> None:
        self._conn.execute("DELETE FROM chats WHERE id = ?", (session_id,))
        self._conn.commit()
        shutil.rmtree(os.path.join(self.files_root, session_id), ignore_errors=True)

    async def list_rag_files(self, session_id=None, *, user_id=None) -> list[dict]:
        return await self._run(self._list_rag_files, session_id)

    def _list_rag_files(self, session_id) -> list[dict]:
        if session_id:
            rows = self._conn.execute(
                "SELECT chat_id, file_name, file_size, metadata, created_at "
                "FROM ingestion_files WHERE chat_id = ? ORDER BY created_at",
                (session_id,),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT chat_id, file_name, file_size, metadata, created_at "
                "FROM ingestion_files ORDER BY created_at"
            ).fetchall()
        files = []
        for row in rows:
            files.append(
                {
                    "session_id": row["chat_id"],
                    "filename": row["file_name"],
                    "file_size": row["file_size"],
                    "created_at": row["created_at"],
                    "metadata": json.loads(row["metadata"]),
                }
            )
        return files

    async def map_session_content_sha256_to_filename(self, session_id: str) -> dict[str, str]:
        return await self._run(self._map_sha, session_id)

    def _map_sha(self, session_id: str) -> dict[str, str]:
        out = {}
        for row in self._conn.execute(
            "SELECT file_name, metadata FROM ingestion_files WHERE chat_id = ?",
            (session_id,),
        ):
            sha = json.loads(row["metadata"]).get("content_sha256")
            if sha and sha not in out:
                out[sha] = row["file_name"]
        return out

    async def save_rag_file_bytes(self, session_id: str, filename: str, content: bytes, mime_type=None) -> str:
        return await self._run(self._save_rag_file_bytes, session_id, filename, content, mime_type)

    def _save_rag_file_bytes(self, session_id, filename, content, mime_type) -> str:
        name = os.path.basename(filename)
        path = self._file_path(session_id, name)
        with open(path, "wb") as f:
            f.write(content)
        self._conn.execute(
            "INSERT INTO ingestion_files (id, chat_id, file_name, file_path, file_size, mime_type, "
            "source, status, metadata) VALUES (?, ?, ?, ?, ?, ?, 'user_upload', 'processed', ?)",
            (
                str(uuid.uuid4()),
                session_id,
                name,
                path,
                len(content),
                mime_type,
                json.dumps({"content_sha256": hashlib.sha256(content).hexdigest()}),
            ),
        )
        self._touch(session_id)
        self._conn.commit()
        return path

    async def get_single_file(self, session_id: str, filename: str):
        return await self._run(self._get_single_file, session_id, os.path.basename(filename))

    def _get_single_file(self, session_id, filename):
        row = self._conn.execute(
            "SELECT file_path FROM ingestion_files WHERE chat_id = ? AND file_name = ?",
            (session_id, filename),
        ).fetchone()
        if row and os.path.isfile(row["file_path"]):
            return row["file_path"]
        path = os.path.join(self.files_root, session_id, "source_files", filename)
        return path if os.path.isfile(path) else None

    async def save_file_metadata(self, session_id: str, filename: str, metadata: dict):
        await self._run(self._save_file_metadata, session_id, os.path.basename(filename), metadata)

    def _save_file_metadata(self, session_id, filename, metadata) -> None:
        row = self._conn.execute(
            "SELECT metadata FROM ingestion_files WHERE chat_id = ? AND file_name = ?",
            (session_id, filename),
        ).fetchone()
        current = json.loads(row["metadata"])
        current.update(metadata)
        self._conn.execute(
            "UPDATE ingestion_files SET metadata = ? WHERE chat_id = ? AND file_name = ?",
            (json.dumps(current), session_id, filename),
        )
        self._conn.commit()

    async def delete_rag_file(self, session_id: str, doc_ids: list[str]) -> list[str]:
        return await self._run(self._delete_rag_file, session_id, doc_ids)

    def _delete_rag_file(self, session_id, doc_ids) -> list[str]:
        wanted = {d.strip().lower() for d in doc_ids if d and d.strip()}
        rows = self._conn.execute(
            "SELECT file_name, file_path FROM ingestion_files WHERE chat_id = ?",
            (session_id,),
        ).fetchall()
        by_id = {_doc_id(r["file_name"]): r for r in rows}
        missing = [d for d in wanted if d not in by_id]
        if missing:
            raise DocIdNotFoundError(missing)
        chunk_ids = []
        for did in wanted:
            row = by_id[did]
            for src in self._conn.execute(
                "SELECT chunk_id FROM sources WHERE chat_id = ? AND doc_id = ?",
                (session_id, did),
            ):
                chunk_ids.append(src["chunk_id"])
            if os.path.isfile(row["file_path"]):
                os.remove(row["file_path"])
            self._conn.execute(
                "DELETE FROM ingestion_files WHERE chat_id = ? AND file_name = ?",
                (session_id, row["file_name"]),
            )
        self._touch(session_id)
        self._conn.commit()
        return chunk_ids

    async def insert_document_summary(self, chat_id: str, doc_id: str, filename: str, chunks: list) -> dict:
        return await self._run(self._insert_document_summary, chat_id, doc_id, filename, chunks)

    def _insert_document_summary(self, chat_id, doc_id, filename, chunks) -> dict:
        sid = str(uuid.uuid4())
        created = _now()
        self._conn.execute(
            "INSERT INTO document_summaries (id, chat_id, doc_id, filename, chunks, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (sid, chat_id, doc_id, filename, json.dumps(chunks), created, created),
        )
        self._conn.commit()
        return {"id": sid, "created_at": created}

    async def list_document_summaries(self, session_id: str) -> list[dict]:
        return await self._run(self._list_document_summaries, session_id)

    def _list_document_summaries(self, session_id) -> list[dict]:
        rows = self._conn.execute(
            "SELECT id, doc_id, filename, created_at FROM document_summaries "
            "WHERE chat_id = ? ORDER BY created_at DESC",
            (session_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    async def get_document_summary(self, session_id: str, summary_id: str):
        return await self._run(self._get_document_summary, session_id, summary_id)

    def _get_document_summary(self, session_id, summary_id):
        row = self._conn.execute(
            "SELECT id, doc_id, filename, created_at, chunks FROM document_summaries "
            "WHERE chat_id = ? AND id = ?",
            (session_id, summary_id),
        ).fetchone()
        if not row:
            return None
        first = json.loads(row["chunks"])[0]
        return {
            "id": row["id"],
            "doc_id": row["doc_id"],
            "filename": row["filename"],
            "created_at": row["created_at"],
            "summary": first["summary"],
            "sources": first.get("sources") or [],
        }
