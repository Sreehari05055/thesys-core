import re


class BaseResearchService:
    @staticmethod
    def normalize_doi(doi: str | None) -> str | None:
        if not doi:
            return None
        value = doi.strip().lower()
        for prefix in ("https://doi.org/", "http://doi.org/", "doi:"):
            if value.startswith(prefix):
                value = value[len(prefix):]
        return value or None

    @staticmethod
    def extract_arxiv_id(raw: str | None) -> str | None:
        if not raw:
            return None
        base = re.sub(r"v\d+$", "", str(raw).strip())
        match = re.search(r"(\d{4}\.\d{4,5})", base)
        return match.group(1) if match else None

    async def semantic_scholar_search(
        self, query, count=25, publication_year=None, is_open_access=None, has_pdf=None
    ) -> str:
        return "Semantic Scholar search functionality is not available. Please check your configuration."

    @staticmethod
    def reconstruct_openalex_abstract(inverted_index: dict | None) -> str | None:
        """Rebuild plaintext from OpenAlex ``abstract_inverted_index``."""
        if not inverted_index:
            return None
        max_pos = max(
            (pos for positions in inverted_index.values() for pos in positions),
            default=-1,
        )
        if max_pos < 0:
            return None
        words = [""] * (max_pos + 1)
        for word, positions in inverted_index.items():
            for pos in positions:
                words[pos] = word
        text = " ".join(words).strip()
        return text or None

    @staticmethod
    def _paper_link_markdown(row: dict) -> str | None:
        """Markdown link for LLM to copy into replies (clean UI, no raw URLs)."""
        title = (row.get("title") or "Paper").strip()
        short_title = title if len(title) <= 60 else f"{title[:57]}..."
        if row.get("pdf_url"):
            return f"[{short_title}]({row['pdf_url']})"
        if row.get("landing_page_url"):
            return f"[{short_title}]({row['landing_page_url']})"
        return None

    @staticmethod
    def _format_paper_for_llm(row: dict) -> str:
        lines = [
            f"Title: {row.get('title', '')}",
            f"Authors: {row.get('authors', '')}",
            f"Year: {row.get('publication_year', '')}",
            f"DOI: {row.get('doi', '')}",
        ]
        if row.get("abstract"):
            lines.append(f"Abstract: {row['abstract']}")
        link = BaseResearchService._paper_link_markdown(row)
        if link:
            lines.append(f"Link: {link}")
        else:
            lines.append("Link: not available")
        return "\n".join(lines)

    @staticmethod
    def paper_to_frontend(row: dict) -> dict:
        """Shape one paper for the chat SSE ``external_papers`` payload."""
        verified = bool(row.get("pdf_verified"))
        payload = {
            "id": row.get("id"),
            "title": row.get("title"),
            "authors": row.get("authors"),
            "publication_year": row.get("publication_year"),
            "doi": row.get("doi"),
            "abstract": row.get("abstract"),
            "is_open_access": row.get("is_open_access"),
            "pdf_verified": verified,
            "pdf_url": row.get("pdf_url") if verified else None,
            "landing_page_url": row.get("landing_page_url"),
        }
        if row.get("rerank_score") is not None:
            payload["rerank_score"] = row["rerank_score"]
        return payload
