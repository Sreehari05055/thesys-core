from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Any


class DocIdNotFoundError(LookupError):
    """Raised when one or more ingest doc_ids are not in the session corpus."""

    def __init__(self, doc_ids: List[str]):
        self.doc_ids = doc_ids
        super().__init__("doc_id_not_found")


class BaseHistoryStore(ABC):
    @abstractmethod
    async def get_messages(self, session_id: str) -> List[Dict[str, Any]]:
        """Retrieve all messages for a specific session."""
        pass

    @abstractmethod
    async def get_session_source_ids(self, session_id: str) -> List[str]:
        """Return distinct chunk/source IDs retrieved or cited in this session so far."""
        pass
    @abstractmethod
    async def add_message(
        self,
        session_id: str,
        message: Dict[str, Any],
        sources: Optional[List[Dict[str, Any]]] = None,
        papers: Optional[List[Dict[str, Any]]] = None,
        message_id: Optional[str] = None,
    ) -> str:
        """Add a single message to the session history. Optionally attach RAG sources or external papers. Returns message id."""
        pass

    @abstractmethod
    async def clear_session(self, session_id: str):
        """Delete chat history, sources, summaries, ingestion metadata, storage files, and local cache."""
        pass
    
    @abstractmethod
    async def create_session(self, user_id: Optional[str] = None) -> str:
        """Create a new session, optionally bound to a user. Returns the session_id."""
        pass

    @abstractmethod
    async def list_sessions(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Return sessions for the given user (or all if user_id is None)."""
        pass

    @abstractmethod
    async def list_rag_files(
        self,
        session_id: Optional[str] = None,
        *,
        user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List RAG corpus files for one session or for all sessions owned by ``user_id``."""
        pass

    @abstractmethod
    async def delete_rag_file(self, session_id: str, doc_ids: List[str]) -> List[str]:
        """Remove file(s) by ingest doc_id (md5 of basename). Returns deleted chunk_ids (if known)."""
        pass

    @abstractmethod
    async def get_settings(self, session_id: str) -> Dict[str, Any]:
        """Retrieve settings for a specific session."""
        pass

    @abstractmethod
    async def save_settings(self, session_id: str, settings: Dict[str, Any]):
        """Save settings for a specific session."""
        pass

    @abstractmethod
    async def set_session_title(self, session_id: str, title: str) -> Optional[str]:
        """Set chat title unconditionally. Returns saved title or None if invalid/failed."""
        pass

    @abstractmethod
    async def save_file_metadata(self, session_id: str, filename: str, metadata: Dict[str, Any]):
        """Save metadata for a specific file in a session."""
        pass
