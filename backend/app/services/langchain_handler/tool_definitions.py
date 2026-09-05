from pydantic import BaseModel, Field, model_validator
from typing import List, Optional
from app.core.config import config

class SearchResearch(BaseModel):
    """
    Use when user wants to find or learn about a specific topic 
    from their uploaded papers. Single intent, single topic.
    
    Examples:
    - "what does this paper say about dropout"
    - "find sections about data augmentation"
    - "explain the methodology in paper X"
    """

    topic: List[str] = Field(description=(        
        "Semantically rewritten search queries derived from the user question. "
        "Each item should be a full natural-language query optimized for vector retrieval, "
        "DO NOT return single words or keyword lists."))
    question: str = Field(description=(        
        "A minimally normalized version of the original question "
        "(e.g., resolving pronouns), without changing scope or intent."))
    top_n: Optional[int] = Field(
        default=None,
        ge=1,
        le=config.TOP_N,
        description=(
            f"Number of document chunks to return after reranking (1-{config.TOP_N}). "
            "Use 2-3 for narrow factual lookups, 4-5 for explanations, "
            f"{config.TOP_N} only when the question spans multiple sections or documents. "
            f"Omit to retrieve up to {config.TOP_N} chunks."
        ),
    )

class FetchResearch(BaseModel):
    """
    OpenAlex keyword search API for finding research papers.
    This tool is for retrieving academic papers based on keyword queries. It returns structured metadata about relevant papers, title, authors, year, DOI, is_open_access, pdf_url. Use this when the user needs to find research literature on a specific topic or question.

    SEARCH CAPABILITIES:
    - Simple keywords: "machine learning drug discovery"
    - Boolean operators (MUST BE UPPERCASE): AND, OR, NOT
    Example: '("machine learning" OR AI) AND "drug discovery" NOT review'
    - Exact phrases: Use double quotes "deep learning"
    - Grouping: Use parentheses to control logic (term1 AND term2) OR term3
    - Default: Words without operators are treated as AND
    
    USAGE EXAMPLES:
    query='machine learning AND "drug discovery"'  # Both terms required
    query='(AI OR "machine learning") AND medicine NOT review'  # Complex boolean
    query='"deep learning" AND cancer'  # Exact phrase + keyword

    NOT SUPPORTED:
    - Wildcards (*, ?)
    - Fuzzy matching (~)
    - Semantic/meaning-based search (use keyword matching only)

    When called as a tool: map the user message to these parameters only. Call FetchResearch once; do not answer in prose.
    """
    
    query: Optional[str] = Field(
        default=None,
        description="The user's research query to find relevant academic papers. This should be a natural language question or topic (e.g., 'What are the latest advancements in CRISPR gene editing?')."
    )
    doi: Optional[str] = Field(
        default=None,
        description="Exact DOI to find a specific paper (e.g., '10.1038/nature12373')."
    )
    title: Optional[str] = Field(
        default=None,
        description="Exact paper title for specific lookup. Use when user mentions a specific paper."
    )
    authors: Optional[List[str]] = Field(
        default=None,
        description="List of author names to filter by (e.g., ['Jennifer Doudna', 'Emmanuelle Charpentier']). All authors must be present in the paper."
    )
    pmid: Optional[str] = Field(
        default=None,
        description="PubMed ID for specific paper lookup (e.g., '29456894')."
    )
    arxiv_id: Optional[str] = Field(
        default=None,
        description="arXiv ID for specific paper lookup (e.g., '2301.12345' or '2301.12345v2')."
    )
    count: int = Field(default=10, description="The number of research papers to return. Default is 10.")
    publication_year: Optional[str] = Field(
        default=">1950",
        description="Filter by year (e.g., '2023', '>2020', or '2020-2023'). Default is '>1950'."
    )
    is_oa: Optional[bool] = Field(
        default=True,
        description="Set to true to return only Open Access works. Default is True."
    )
    has_pdf: Optional[bool] = Field(
        default=True,
        description="Set to true to ensure the paper has a downloadable PDF. Default is True."
    )

    @model_validator(mode="after")
    def validate_search_params(self):
        if not any([self.query, self.doi, self.title, self.authors, self.pmid, self.arxiv_id]):
            raise ValueError(
                "At least one search parameter (query, doi, title, authors, pmid, or arxiv_id) must be provided."
            )
        if self.doi or self.pmid or self.arxiv_id:
            self.count = 1
        
        return self


def get_tool_schemas():
    return [
        SearchResearch,
    ]

