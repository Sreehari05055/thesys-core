"""Session id from ``X-Session-ID`` header."""

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


def owned_session_dep(_history_store=None):
    async def _session(request: Request) -> str:
        return require_session_id(request)

    return _session
