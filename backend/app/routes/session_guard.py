"""Session id from ``X-Session-ID``, checked against the chat row."""

from fastapi import HTTPException, Request, status

SESSION_HEADER = "X-Session-ID"


def require_session_id(request: Request) -> str:
    session_id = (request.headers.get(SESSION_HEADER) or "").strip()
    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "missing_session_id",
                "message": (
                    f"{SESSION_HEADER} header is required. "
                    "Create a conversation via POST /api/conversations/new first."
                ),
            },
        )
    return session_id


def session_dep(history_store):
    async def _session(request: Request) -> str:
        session_id = require_session_id(request)
        if not await history_store.has_session(session_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": "session_not_found",
                    "message": f"No conversation for this {SESSION_HEADER}.",
                },
            )
        return session_id

    return _session
