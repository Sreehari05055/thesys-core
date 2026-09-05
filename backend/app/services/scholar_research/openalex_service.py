import re
import httpx
from app import logger
from app.core.config import config
from app.services.scholar_research.base_research import BaseResearchService
from app.utils.pdf_url_verifier import attach_pdf_verification


class OpenAlexResearchService(BaseResearchService):
    def __init__(self, http_client=None):
        self.api_key = config.OPENALEX_API_KEY
        self.http_client = http_client
        self.works_url = "https://api.openalex.org/works" 

    async def semantic_scholar_search(
        self,
        query=None,
        doi=None,
        title=None,
        authors=None,
        pmid=None,
        arxiv_id=None,
        count=10,
        publication_year=None,
        is_oa=True,
        has_pdf=True,
    ) -> list:
        doi = self.normalize_doi(doi)

        async def _get(doi: str | None = None, pmid: str | None = None, arxiv_id: str | None = None) -> httpx.Response:
            if doi:
                url = f"{self.works_url}/doi:{doi}"
            elif pmid:
                url = f"{self.works_url}/pmid:{pmid}"
            elif arxiv_id:
                base_id = re.sub(r"v\d+$", "", arxiv_id.strip())
                url = f"{self.works_url}/doi:10.48550/arxiv.{base_id}"
            else:
                raise ValueError("OpenAlex lookup requires doi, pmid, or arxiv_id")

            headers = {"User-Agent": "ResearchApp/1.0"}
            params = {"api_key": self.api_key} if self.api_key else None
            if self.http_client is not None:
                return await self.http_client.get(url, headers=headers, params=params)
            async with httpx.AsyncClient() as client:
                return await client.get(url, headers=headers, params=params)

        # Direct ID lookup takes priority (more efficient)
        if doi:
            response = await _get(doi=doi)
            if response.status_code == 200:
                item = response.json()
                results = [item]  # Wrap single result in list
            else:
                logger.error(f"OpenAlex DOI lookup error: {response.status_code} - {response.text}")
                return f"Error fetching paper by DOI: {response.status_code}"
        
        elif pmid:
            response = await _get(pmid=pmid)
            if response.status_code == 200:
                item = response.json()
                results = [item]
            else:
                logger.error(f"OpenAlex PMID lookup error: {response.status_code} - {response.text}")
                return f"Error fetching paper by PMID: {response.status_code}"

        elif arxiv_id:
            response = await _get(arxiv_id=arxiv_id)
            if response.status_code == 200:
                item = response.json()
                results = [item]
            else:
                logger.error(f"OpenAlex arXiv lookup error: {response.status_code} - {response.text}")
                return f"Error fetching paper by arXiv ID: {response.status_code}"
        
        else:
            # Build filter-based search
            pub_year = publication_year or ">1950"
            
            filter_parts = [
                f"publication_year:{pub_year}",
                f"is_oa:{str(is_oa).lower() if is_oa is not None else 'true'}",
                "has_abstract:true",
            ]
            
            if has_pdf is not None:
                filter_parts.append(f"has_pdf_url:{str(has_pdf).lower()}")
            
            # Build search query
            search_parts = []
            if query:
                if isinstance(query, list):
                    query = " ".join(str(q) for q in query if q is not None)
                search_parts.append(str(query))
            if title:
                # Exact title match using quotes
                search_parts.append(f'"{title}"')
            if authors:
                # Multiple authors - all must be present
                author_queries = [f'author:"{author}"' for author in authors]
                search_parts.append(f'({" AND ".join(author_queries)})')
            
            # Combine search terms
            search_query = " AND ".join(search_parts) if search_parts else None
            
            params = {
                "per-page": min(count or 10, 200),
                "filter": ",".join(filter_parts),
            }
            
            if search_query:
                params["search"] = search_query
                params["sort"] = "relevance_score:desc"
            if self.api_key:
                params["api_key"] = self.api_key
            
            headers = {"User-Agent": "ResearchApp/1.0"}
            
            if self.http_client is not None:
                response = await self.http_client.get(self.works_url, params=params, headers=headers)
            else:
                async with httpx.AsyncClient() as client:
                    response = await client.get(self.works_url, params=params, headers=headers)
            
            if response.status_code != 200:
                logger.error(f"OpenAlex API error: {response.status_code} - {response.text}")
                return f"Error fetching research from OpenAlex: {response.status_code}"
            
            results = response.json().get("results", [])

        formatted_results = []
        for item in results:
            pdf_url = (
                item.get("open_access", {}).get("oa_url") or
                item.get("primary_location", {}).get("pdf_url")
            )

            raw_title = item.get("title") or ""
            title = re.sub(r"<[^>]+>", "", raw_title)
            title = re.sub(r"\s+", " ", title).strip() or "Untitled"
            authors = [a["author"]["display_name"] for a in item.get("authorships", [])]
            if len(authors) > 5:
                author_str = ", ".join(authors[:5]) + ", et al."
            else:
                author_str = ", ".join(authors) or "Unknown"

            abstract = self.reconstruct_openalex_abstract(
                item.get("abstract_inverted_index")
            )

            landing_page_url = item.get("primary_location", {}).get("landing_page_url")
            paper_doi = self.normalize_doi(item.get("doi"))
            paper_arxiv_id = None
            for raw in (item.get("doi"), landing_page_url, pdf_url):
                paper_arxiv_id = self.extract_arxiv_id(raw)
                if paper_arxiv_id:
                    break

            formatted_results.append({
                "id": paper_arxiv_id or paper_doi,
                "arxiv_id": paper_arxiv_id,
                "title": title,
                "authors": author_str,
                "publication_year": item.get("publication_year"),
                "doi": paper_doi,
                "abstract": abstract,
                "is_open_access": item.get("open_access", {}).get("is_oa"),
                "pdf_url": pdf_url,
                "landing_page_url": landing_page_url,
            })

        formatted_results = await attach_pdf_verification(
            formatted_results,
            http_client=self.http_client,
        )
        return formatted_results
