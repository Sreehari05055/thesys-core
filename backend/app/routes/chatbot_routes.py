# app/routes/chatbot_routes.py
import hashlib
import os
import io
from typing import Annotated
from urllib.parse import quote, unquote
import tempfile
import fitz
from fastapi import Request, Depends, HTTPException, Query
from fastapi.routing import APIRouter
from starlette.responses import JSONResponse, StreamingResponse
from app import logger
from pydantic import ValidationError
from app.schemas.schemas import ChatRequest, SettingsRequest, CiteRequest, CiteExportRequest
import asyncio
from fastapi.responses import FileResponse
from app.services.chatbot_service import ChatbotService
from app.services.summarizer_service.summarizer_execution import SummaryPersistError
from app.routes.session_guard import owned_session_dep, SESSION_HEADER
from app.utils.pdf_url_verifier import download_pdf_from_url

chatbot_bp = APIRouter()

def init_chatbot_routes(app, system_prompt, history_store, http_client, rag_service, summarizer_service, scholar_service, citations_service):
    OwnedSession = Annotated[str, Depends(owned_session_dep(history_store))]
    chatbot_service = ChatbotService(
        system_prompt=system_prompt, 
        store=history_store,   
        http_client=http_client,
        rag_service=rag_service,
        summarizer_service=summarizer_service,
        scholar_service=scholar_service,
    )
    @chatbot_bp.post('/api/chat', response_class=StreamingResponse)
    async def get_bot_response(
        request: Request,
        chat_request: ChatRequest,
        session_id: OwnedSession,
    ):
        try:
            session_settings = await history_store.get_settings(session_id)
            question = chat_request.question
            research_mode = chat_request.research_mode
            source_ids = chat_request.source_ids
            doc_ids = chat_request.resolved_doc_ids()
            active_documents = chat_request.active_documents_dicts()
            logger.info(f"Sources received: {source_ids}")
            logger.info(f"active_documents received: {active_documents}")
            settings = {
                **session_settings,
                "source_ids": source_ids,
                "doc_ids": doc_ids,
                "active_documents": active_documents,
                "research_mode": research_mode,
            }

            async def event_stream():
                async for chunk in chatbot_service._generate_response(
                    session_id=session_id, query=question, settings=settings
                ):
                    yield chunk

            return StreamingResponse(event_stream(), media_type='text/event-stream', headers={
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    SESSION_HEADER: session_id,
                })

        except RuntimeError as re:
            logger.error(f"RuntimeError: {re}")
            return JSONResponse(content={"error": str(re)}, status_code=500)
        except ValidationError as ve:
            return JSONResponse(content={"error": ve.errors()}, status_code=400)
        except KeyError as ke:
            logger.error(f"KeyError: {ke}")
            return JSONResponse(content={"error": f"Missing key in request: {str(ke)}"}, status_code=400)
        except ValueError as ve:
            logger.error(f"ValueError: {ve}")
            return JSONResponse(content={"error": f"Invalid data: {str(ve)}"}, status_code=400)
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Unexpected error:")
            return JSONResponse(content={"error": "An unexpected error occurred. Please try again later."},
                                status_code=500)
    
    @chatbot_bp.get('/api/conversations')
    async def list_conversations():
        """Get all conversation sessions."""
        try:
            sessions = await history_store.list_sessions()
            return JSONResponse(content={"conversations": sessions})
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error listing conversations: {e}")
            return JSONResponse(
                content={"error": "Failed to list conversations"},
                status_code=500
            )
    @chatbot_bp.get('/api/conversations/messages')
    async def load_conversation(session_id: OwnedSession):
        """Get conversation messages. Requires ``X-Session-ID``."""
        try:
            messages = await history_store.get_messages(session_id)
            title = await history_store.get_session_title(session_id)
            return JSONResponse(content={
                "session_id": session_id,
                "title": title,
                "messages": messages,
            })
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error loading conversation {session_id}: {e}")
            return JSONResponse(
                content={"error": f"Failed to load conversation {session_id}"},
                status_code=500
            )
    @chatbot_bp.delete('/api/conversations')
    async def delete_conversation(session_id: OwnedSession):
        """Delete session: messages, sources, summaries, vectors, bucket files, and chat row."""
        try:
            await rag_service.clear_session_vectors(session_id)
            await history_store.clear_session(session_id)
            
            return JSONResponse(content={
                "message": "Conversation deleted successfully",
                "session_id": session_id
            })
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error deleting conversation {session_id}: {e}")
            return JSONResponse(
                content={"error": "Failed to delete conversation"},
                status_code=500
            )
    @chatbot_bp.post('/api/conversations/new')
    async def new_conversation():
        """Create a new conversation session"""
        session_id = await history_store.create_session()
        return JSONResponse(content={
            "session_id": session_id,
            "message": "New conversation created"
        })
    @chatbot_bp.post("/api/settings")
    async def save_settings(session_id: OwnedSession, settings_request: SettingsRequest):
        """Save per-conversation settings. Requires ``X-Session-ID``."""
        try:
            settings = settings_request.model_dump(exclude_unset=True)
            title = settings.pop("title", None)
            model_name = settings.get("model")
            model_row = await history_store.get_llm_model(model_name)
            if not model_row:
                return JSONResponse(content={"error": "Unsupported model"}, status_code=400)
            settings["provider"] = model_row["provider"]
            await history_store.save_settings(session_id, settings)
            await history_store.set_session_title(session_id, title)

            return JSONResponse(content={"message": "Settings saved successfully", "session_id": session_id})
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error saving settings for {session_id}: {e}")
            return JSONResponse(content={"error": "Failed to save settings"}, status_code=500)

    def _format_citeas_citations(data: dict) -> list[dict]:
        return [
            {
                "style_shortname": c.get("style_shortname"),
                "style_fullname": c.get("style_fullname"),
                "citation": c.get("citation"),
            }
            for c in (data.get("citations") or [])
        ]

    @chatbot_bp.post("/api/cite")
    async def get_citations(session_id: OwnedSession, cite_request: CiteRequest):
        """Generate citations for one or more DOIs, arXiv IDs, or titles. Requires ``X-Session-ID``."""
        try:
            inputs = cite_request.citation_inputs
            raw_results = await citations_service.generate_citations_batch(
                citation_inputs=inputs,
            )
            results = []
            for citation_input, raw in zip(inputs, raw_results):
                if isinstance(raw, str) and "Error" in raw:
                    results.append({"citation_input": citation_input, "citations": [], "error": raw})
                else:
                    results.append({
                        "citation_input": citation_input,
                        "citations": _format_citeas_citations(raw),
                        "error": None,
                    })
            return JSONResponse(content={"results": results})
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error citing for session {session_id}: {e}", exc_info=True)
            return JSONResponse(content={"error": "Failed to generate citations"}, status_code=500)

    @chatbot_bp.post("/api/cite/export")
    async def export_citations(session_id: OwnedSession, cite_request: CiteExportRequest):
        """Export BibTeX, RIS, enw, or CSV for one or more resources. Requires ``X-Session-ID``."""
        try:
            inputs = cite_request.citation_inputs
            raw_results = await citations_service.export_citations_batch(
                citation_inputs=inputs,
                export_format=cite_request.export_format,
            )
            results = [
                {"citation_input": citation_input, **item}
                for citation_input, item in zip(inputs, raw_results)
            ]
            return JSONResponse(content={"results": results})
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error exporting citations for session {session_id}: {e}", exc_info=True)
            return JSONResponse(content={"error": "Failed to export citations"}, status_code=500)
    
    async def _filename_for_doc_id(session_id: str, doc_id: str) -> str | None:
        """Resolve ingest ``doc_id`` (md5 of basename filename) to stored ``file_name``."""
        needle = unquote(doc_id.strip()).lower()
        if not needle:
            return None
        for entry in await history_store.list_rag_files(session_id):
            filename = entry["filename"]
            if hashlib.md5(filename.encode()).hexdigest() == needle:
                return filename
        return None

    async def _resolve_session_file_path(session_id: str, filename: str) -> str | None:
        """Return local path for a session file (temp cache or Storage download)."""
        safe_filename = os.path.basename(filename)
        temp_path = os.path.join(tempfile.gettempdir(), "synclair", session_id, "source_files", safe_filename)
        if await asyncio.to_thread(os.path.exists, temp_path):
            return temp_path
        return await history_store.get_single_file(session_id, safe_filename)

    def _pdf_download_error_status(reason: str) -> int:
        return {"timeout": 504}.get(reason, 422)

    def _content_disposition(filename: str, *, download: bool = False) -> str:
        kind = "attachment" if download else "inline"
        return f"{kind}; filename*=UTF-8''{quote(filename)}"

    def _pdf_bytes_response(
        pdf_bytes: bytes, download_name: str, *, download: bool = False
    ) -> StreamingResponse:
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": _content_disposition(download_name, download=download)},
        )

    def _pdf_page_bytes(src: str | bytes, page_number: int) -> bytes:
        """Extract one 1-indexed page; ``src`` is a file path or PDF bytes."""
        doc = fitz.open(stream=src, filetype="pdf") if isinstance(src, bytes) else fitz.open(src)
        try:
            if page_number > doc.page_count:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid page number. PDF has {doc.page_count} pages.",
                )
            out = fitz.open()
            try:
                out.insert_pdf(doc, from_page=page_number - 1, to_page=page_number - 1)
                return out.tobytes()
            finally:
                out.close()
        finally:
            doc.close()

    @chatbot_bp.get("/api/files/{doc_id:path}/regions")
    async def get_session_file_regions(
        doc_id: str,
        session_id: OwnedSession,
    ):
        """Table/code overlay regions for reader mode."""
        try:
            filename = await _filename_for_doc_id(session_id, doc_id)
            if not filename:
                raise HTTPException(status_code=404, detail="Document not found in this session")
            resolved = hashlib.md5(filename.encode()).hexdigest()
            regions = await rag_service.fetch_file_regions(session_id, resolved)
            return JSONResponse(content={"doc_id": resolved, "regions": regions})
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting regions for file {doc_id} for session {session_id}: {e}", exc_info=True)
            return JSONResponse(content={"error": "Failed to get regions"}, status_code=500)

    @chatbot_bp.get("/api/files/{doc_id:path}")
    async def get_session_file(
        doc_id: str,
        session_id: OwnedSession,
        url: str | None = Query(
            None,
            min_length=1,
            description="Verified pdf_url for an external paper; path id is paper id.",
        ),
        page_number: int | None = Query(
            None,
            ge=1,
            description="1-indexed PDF page. Omit to return the full file.",
        ),
        download: bool = Query(
            False,
            description="If true, return Content-Disposition attachment (save to disk). Default: inline view.",
        ),
    ):
        """Serve ingested files by md5 ``doc_id``, or verified external PDFs when ``url`` is set."""
        try:
            if url:
                stored_url = await history_store.get_verified_external_pdf_url(
                    session_id,
                    paper_id=doc_id,
                    url=url,
                )
                if not stored_url:
                    raise HTTPException(
                        status_code=404,
                        detail="Verified PDF not found for this session.",
                    )

                body, _final_url, _ctype, reason = await download_pdf_from_url(
                    stored_url,
                    http_client=http_client,
                )
                if reason != "verified":
                    raise HTTPException(
                        status_code=_pdf_download_error_status(reason),
                        detail={"error": reason, "url": stored_url},
                    )

                stem = os.path.basename(doc_id.replace("/", "_")) or "paper"
                if page_number is not None:
                    return _pdf_bytes_response(
                        _pdf_page_bytes(body, page_number),
                        f"{stem}_page_{page_number}.pdf",
                        download=download,
                    )
                return _pdf_bytes_response(body, f"{stem}.pdf", download=download)

            filename = await _filename_for_doc_id(session_id, doc_id)
            if not filename:
                raise HTTPException(status_code=404, detail="Document not found in this session")

            file_path = await _resolve_session_file_path(session_id, filename)
            if not file_path:
                logger.error(f"File not found: {filename} for session {session_id} (doc_id={doc_id})")
                raise HTTPException(status_code=404, detail="File not found")

            is_pdf = filename.lower().endswith(".pdf")
            if page_number is not None:
                if not is_pdf:
                    raise HTTPException(
                        status_code=400,
                        detail="page_number is only supported for PDF documents",
                    )
                return _pdf_bytes_response(
                    _pdf_page_bytes(file_path, page_number),
                    f"{filename}_page_{page_number}.pdf",
                    download=download,
                )

            return FileResponse(
                file_path,
                media_type="application/pdf" if is_pdf else None,
                filename=filename,
                headers={
                    "Content-Disposition": _content_disposition(filename, download=download),
                },
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                f"Error serving file doc_id={doc_id} session={session_id} page={page_number}: {e}",
                exc_info=True,
            )
            return JSONResponse(content={"error": "Failed to serve file"}, status_code=500)

    @chatbot_bp.get("/api/summarize/saved/{summary_id}")
    async def get_saved_summary(
        summary_id: str,
        session_id: OwnedSession,
    ):
        """Load one saved summary by ``summary_id``. Requires ``X-Session-ID``."""
        try:
            row = await history_store.get_document_summary(session_id, summary_id)
            if not row:
                raise HTTPException(status_code=404, detail="Summary not found")
            return JSONResponse(content=row)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                f"Error loading summary {summary_id} for session {session_id}: {e}",
                exc_info=True,
            )
            return JSONResponse(content={"error": "Failed to load summary"}, status_code=500)

    @chatbot_bp.get("/api/summarize")
    async def list_session_summaries(
        session_id: OwnedSession,
    ):
        """List saved summarize runs (metadata only). Requires ``X-Session-ID``."""
        try:
            summaries = await history_store.list_document_summaries(session_id)
            return JSONResponse(content={"summaries": summaries})
        except Exception as e:
            logger.error(f"Error listing summaries for session {session_id}: {e}", exc_info=True)
            return JSONResponse(content={"error": "Failed to list summaries"}, status_code=500)

    @chatbot_bp.post("/api/summarize/{doc_id}")
    async def summarize_session_file(
        request: Request,
        doc_id: str,
        session_id: OwnedSession,
    ):
        """Summarize one indexed file by ``doc_id``. Requires ``X-Session-ID``."""
        try:
            filename = await _filename_for_doc_id(session_id, doc_id)
            if not filename:
                raise HTTPException(status_code=404, detail="Document not found in this session")

            resolved_doc_id = hashlib.md5(filename.encode()).hexdigest()

            session_settings = await history_store.get_settings(session_id)
            result = await summarizer_service.summarize(
                session_id,
                [filename],
                provider=session_settings.get("provider"),
                model_name=session_settings.get("model"),
                doc_id=resolved_doc_id,
            )

            if isinstance(result, str):
                if result.startswith("No content found"):
                    raise HTTPException(
                        status_code=404,
                        detail={"error": "nothing_to_summarize", "message": result},
                    )
                logger.error("summarize_session_file: %s", result)
                return JSONResponse(content={"error": result}, status_code=500)

            return JSONResponse(
                content={
                    "doc_id": resolved_doc_id,
                    "filename": filename,
                    "summary": result["summary"],
                    "sources": result.get("sources", []),
                    "summary_id": result["summary_id"],
                    "created_at": result["created_at"],
                }
            )
        except SummaryPersistError as e:
            raise HTTPException(
                status_code=500,
                detail={"error": "summary_save_failed", "message": str(e)},
            ) from e
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error summarizing doc_id={doc_id} for session {session_id}: {e}", exc_info=True)
            return JSONResponse(content={"error": "Failed to summarize file"}, status_code=500)

    app.include_router(chatbot_bp)
