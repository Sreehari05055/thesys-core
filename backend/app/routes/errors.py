"""One place for unexpected route errors. Expected cases raise HTTPException."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app import logger
from app.services.local_history_store import DocIdNotFoundError


def add_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DocIdNotFoundError)
    async def doc_id_not_found(_request: Request, exc: DocIdNotFoundError):
        return JSONResponse(
            status_code=404,
            content={"detail": {"error": "doc_id_not_found", "doc_ids": exc.doc_ids}},
        )

    @app.exception_handler(ValueError)
    async def bad_value(_request: Request, exc: ValueError):
        logger.error("ValueError: %s", exc)
        return JSONResponse(status_code=400, content={"error": f"Invalid data: {exc}"})

    @app.exception_handler(KeyError)
    async def missing_key(_request: Request, exc: KeyError):
        logger.error("KeyError: %s", exc)
        return JSONResponse(
            status_code=400,
            content={"error": f"Missing key in request: {exc}"},
        )

    @app.exception_handler(RuntimeError)
    async def runtime_error(_request: Request, exc: RuntimeError):
        logger.error("RuntimeError: %s", exc)
        return JSONResponse(status_code=500, content={"error": str(exc)})

    @app.exception_handler(Exception)
    async def unexpected(_request: Request, exc: Exception):
        logger.exception("Unexpected error")
        return JSONResponse(
            status_code=500,
            content={"error": "An unexpected error occurred. Please try again later."},
        )
