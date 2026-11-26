from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from app.routes.session_guard import SessionId
from app.schemas.schemas import CiteExportRequest, CiteRequest

router = APIRouter()


def _format_citeas_citations(data: dict) -> list[dict]:
    return [
        {
            "style_shortname": c.get("style_shortname"),
            "style_fullname": c.get("style_fullname"),
            "citation": c.get("citation"),
        }
        for c in (data.get("citations") or [])
    ]


@router.post("/api/cite")
async def get_citations(request: Request, session_id: SessionId, cite_request: CiteRequest):
    """Generate citations for one or more DOIs, arXiv IDs, or titles. Requires ``X-Session-ID``."""
    inputs = cite_request.citation_inputs
    raw_results = await request.app.state.citations_service.generate_citations_batch(
        citation_inputs=inputs,
    )
    results = []
    for citation_input, raw in zip(inputs, raw_results):
        if isinstance(raw, str):
            results.append({"citation_input": citation_input, "citations": [], "error": raw})
        else:
            results.append({
                "citation_input": citation_input,
                "citations": _format_citeas_citations(raw),
                "error": None,
            })
    return JSONResponse(content={"results": results})


@router.post("/api/cite/export")
async def export_citations(request: Request, session_id: SessionId, cite_request: CiteExportRequest):
    """Export BibTeX, RIS, enw, or CSV for one or more resources. Requires ``X-Session-ID``."""
    inputs = cite_request.citation_inputs
    raw_results = await request.app.state.citations_service.export_citations_batch(
        citation_inputs=inputs,
        export_format=cite_request.export_format,
    )
    results = [
        {"citation_input": citation_input, **item}
        for citation_input, item in zip(inputs, raw_results)
    ]
    return JSONResponse(content={"results": results})
