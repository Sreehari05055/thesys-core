"""Session id from ``X-Session-ID``, checked against the chat row."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

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


async def session_dep(request: Request) -> str:
    session_id = require_session_id(request)
    store = request.app.state.history_store
    if not await store.has_session(session_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "session_not_found",
                "message": f"No conversation for this {SESSION_HEADER}.",
            },
        )
    return session_id


SessionId = Annotated[str, Depends(session_dep)]
