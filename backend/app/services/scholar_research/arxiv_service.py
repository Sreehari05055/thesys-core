import re
import xml.etree.ElementTree as ET
import httpx

from app import logger
from app.services.scholar_research.base_research import BaseResearchService
from app.utils.pdf_url_verifier import attach_pdf_verification

ATOM_NS = "http://www.w3.org/2005/Atom"
ATOM = f"{{{ATOM_NS}}}"


class ArxivResearchService(BaseResearchService):
    def __init__(self, http_client=None):
        self.http_client = http_client
        self.works_url = "https://export.arxiv.org/api/query"

    def _build_search_query(self, query=None, title=None, authors=None, publication_year=None):
        parts = []
        if query:
            if isinstance(query, list):
                query = " ".join(str(q) for q in query if q is not None)
            q = str(query).strip()
            if q:
                parts.append(f"all:{q}")
        if title:
            parts.append(f'ti:"{title}"')
        if authors:
            for author in authors:
                parts.append(f'au:"{author}"')
        if publication_year and str(publication_year).isdigit():
            year = str(publication_year)
            parts.append(f"submittedDate:[{year}01010000+TO+{year}12312359]")
        return " AND ".join(parts) if parts else None

    def _parse_feed(self, xml_text: str) -> list[dict]:
        root = ET.fromstring(xml_text)
        rows = []

        for entry in root.findall(f"{ATOM}entry"):
            raw_id = (entry.findtext(f"{ATOM}id") or "").strip()

            match = re.search(r"arxiv\.org/abs/([^/]+)", raw_id)
            arxiv_id = match.group(1) if match else raw_id.rsplit("/", 1)[-1]
            base_id = self.extract_arxiv_id(arxiv_id) or re.sub(r"v\d+$", "", arxiv_id)

            title = " ".join((entry.findtext(f"{ATOM}title") or "").split()) or "Untitled"
            abstract = " ".join((entry.findtext(f"{ATOM}summary") or "").split()) or None

            author_names = [
                " ".join((author.findtext(f"{ATOM}name") or "").split())
                for author in entry.findall(f"{ATOM}author")
            ]
            author_names = [name for name in author_names if name]

            author_str = ", ".join(author_names[:5])
            if len(author_names) > 5:
                author_str += ", et al."
            author_str = author_str or "Unknown"

            published = (entry.findtext(f"{ATOM}published") or "").strip()
            publication_year = int(published[:4]) if published[:4].isdigit() else None

            landing_page_url = f"https://arxiv.org/abs/{arxiv_id}"
            pdf_url = f"https://arxiv.org/pdf/{base_id}.pdf"

            for link in entry.findall(f"{ATOM}link"):
                href = link.get("href")
                if not href:
                    continue

                if link.get("type") == "application/pdf":
                    pdf_url = href

                if link.get("rel") == "alternate":
                    landing_page_url = href

            rows.append(
                {
                    "id": base_id,
                    "title": title,
                    "authors": author_str,
                    "publication_year": publication_year,
                    "doi": None,
                    "abstract": abstract,
                    "is_open_access": True,
                    "pdf_url": pdf_url,
                    "landing_page_url": landing_page_url,
                }
            )
        return rows

    async def semantic_scholar_search(
        self,
        query=None,
        arxiv_id=None,
        doi=None,
        title=None,
        authors=None,
        pmid=None,
        count=10,
        publication_year=None,
        is_oa=True,
        has_pdf=True,
    ) -> list:
        headers = {"User-Agent": "ResearchApp/1.0"}

        if arxiv_id:
            params = {"id_list": arxiv_id}
        else:
            search_query = self._build_search_query(query, title, authors, publication_year)
            if not search_query:
                return "Error fetching research from arXiv: a query, title, or authors is required."
            params = {
                "search_query": search_query,
                "start": 0,
                "max_results": min(count or 10, 200),
                "sortBy": "relevance",
                "sortOrder": "descending",
            }

        if self.http_client is not None:
            response = await self.http_client.get(self.works_url, params=params, headers=headers)
        else:
            async with httpx.AsyncClient() as client:
                response = await client.get(self.works_url, params=params, headers=headers)

        if response.status_code != 200:
            logger.error("arXiv API error: %s - %s", response.status_code, response.text)
            return f"Error fetching research from arXiv: {response.status_code}"

        formatted_results = self._parse_feed(response.text)
        formatted_results = await attach_pdf_verification(
            formatted_results,
            http_client=self.http_client,
        )
        return formatted_results
