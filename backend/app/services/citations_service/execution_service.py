from app import logger
import asyncio
import httpx
from typing import Any, Optional
from urllib.parse import quote
import fitz
import re
from app.core.config import config


def _citeas_product_url(base: str, resource: str) -> str:
    """Encode resource for CiteAs path segment (DOIs, URLs, keywords)."""
    return f"{base}/{quote(resource, safe='')}"


class CitationsExecutionService:
    def __init__(self, http_client=None):
        self.email = config.EMAIL
        self._owns_client = http_client is None
        self.http_client = http_client or httpx.AsyncClient(timeout=config.HTTP_TIMEOUT)
        self.api_base_url = "https://api.citeas.org/product"

    async def _extract_identifier_from_pdf(self, filename: str) -> Optional[str]:
        """Extract a DOI, arXiv ID, or title from a local PDF file."""
        try:
            with fitz.open(filename) as doc:

                meta = doc.metadata or {}
                subject = meta.get("subject", "") or ""
                
                doi_match = re.search(r'10\.\d{4,9}/[^\s"\'<>]+', subject)
                if doi_match:
                    return doi_match.group(0).rstrip(".")

                first_pages_text = ""
                for page in doc[:2]:
                    first_pages_text += page.get_text()

                arxiv_match = re.search(r'arXiv[:\s]*([\d]{4}\.[\d]{4,5})', first_pages_text, re.IGNORECASE)
                if arxiv_match:
                    return f"https://arxiv.org/abs/{arxiv_match.group(1)}"

                doi_match = re.search(r'10\.\d{4,9}/[^\s"\'<>\]]+', first_pages_text)
                if doi_match:
                    return doi_match.group(0).rstrip(".")

                title = meta.get("title", "").strip()
                if title:
                    return title
            return None

        except FileNotFoundError:
            logger.error(f"PDF file not found: {filename}", exc_info=True)
            return None
        except Exception as exc:
            logger.error(f"Unexpected error during PDF identifier extraction: {exc}", exc_info=True)
            return None

    async def _fetch_citeas(self, citation_input: str) -> Any:
        """One CiteAs lookup — GET /product/{resource}?email=..."""
        endpoint = _citeas_product_url(self.api_base_url, citation_input)
        params = {"email": self.email}
        
        try:
            response = await self.http_client.get(endpoint, params=params, timeout=10)
            logger.info(f"Citation API response: {response.status_code} - {response.text}")
            response.raise_for_status()
            data = response.json()

            if not data.get("citations"):
                return "Citation Tool Error: No citations returned."
            return data

        except httpx.HTTPStatusError as exc:
            try:
                error_data = exc.response.json()
                api_msg = error_data.get("message", exc.response.text)
            except Exception:
                api_msg = exc.response.text
            logger.error(f"Error from CitationAPI ({exc.response.status_code}): {api_msg}", exc_info=True)
            return f"Citation Tool Error ({exc.response.status_code}): {api_msg}"
        except httpx.RequestError as exc:
            logger.error(f"Citation API network error: {exc}", exc_info=True)
            return "Citation Tool Error: Could not connect to the service."

    async def generate_citations_batch(
        self,
        citation_inputs: list[str],
        *,
        concurrency: int = getattr(config, "MAX_CONCURRENT_QUERIES", 8),
    ) -> list[Any]:
        """CiteAs has no batch endpoint — one GET /product/{resource} per item."""
        targets = [x.strip() for x in citation_inputs if (x or "").strip()]
        sem = asyncio.Semaphore(max(1, concurrency))
        async def fetch_one(resource: str) -> Any:
            async with sem:
                return await self._fetch_citeas(resource)

        return list(await asyncio.gather(*[fetch_one(t) for t in targets]))

    def _exports_from_citeas_data(self, data: dict) -> list[dict[str, str]]:
        return [
            {"export_name": row["export_name"], "export": str(row["export"])}
            for row in (data.get("exports") or [])
            if row.get("export_name") and row.get("export") is not None
        ]

    def _export_item(self, data: Any, export_format: str) -> dict[str, Any]:
        if isinstance(data, str):
            error = data if "Error" in data else f"Citation Tool Error: {data}"
            return {"exports": [], "error": error}

        key = export_format.strip().lower()
        match = next(
            (row for row in self._exports_from_citeas_data(data) if row["export_name"].lower() == key),
            None,
        )
        return {"exports": [match], "error": None} if match else {"exports": [], "error": None}

    async def export_citations_batch(
        self,
        citation_inputs: list[str],
        export_format: str,
        *,
        concurrency: int = getattr(config, "MAX_CONCURRENT_QUERIES", 8),
    ) -> list[dict[str, Any]]:
        """Batch export — one CiteAs lookup per item, slice exports from same response."""
        raw = await self.generate_citations_batch(citation_inputs, concurrency=concurrency)
        return [self._export_item(data, export_format) for data in raw]