import asyncio
from llama_index.core.schema import NodeWithScore, QueryBundle, TextNode
from app import logger
from app.services.scholar_research.base_research import BaseResearchService

def _create_reranker(top_n: int | None = None):
    from app import rag_pipeline

    return rag_pipeline.create_reranker(top_n=top_n)


def _paper_text(paper: dict) -> str:
    title = (paper.get("title") or "").strip()
    abstract = (paper.get("abstract") or "").strip()
    if title and abstract:
        return f"Title: {title}\nAbstract: {abstract}"
    return title or abstract

def _paper_dedup_keys(paper: dict) -> set[str]:
    keys = set()
    doi = BaseResearchService.normalize_doi(paper.get("doi"))
    if doi:
        keys.add(f"doi:{doi}")
        if arxiv := BaseResearchService.extract_arxiv_id(doi):
            keys.add(f"arxiv:{arxiv}")
    for field in ("arxiv_id", "id", "pdf_url", "landing_page_url"):
        if arxiv := BaseResearchService.extract_arxiv_id(paper.get(field)):
            keys.add(f"arxiv:{arxiv}")
    return keys

def deduplicate_papers(papers: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for paper in papers:
        keys = _paper_dedup_keys(paper)
        if keys and keys & seen:
            continue
        seen.update(keys)
        out.append(paper)
    logger.info("Dedup removed %d/%d papers", len(papers) - len(out), len(papers))
    return out


async def rerank_papers(user_query: str, papers: list[dict], top_n: int | None = None) -> list[dict]:
    if not papers or not (user_query or "").strip():
        return []
    reranker = _create_reranker(top_n=top_n)
    if not reranker:
        return papers[:top_n] if top_n else papers

    nodes = [
        NodeWithScore(
            node=TextNode(text=_paper_text(paper), metadata={"paper_index": i}),
            score=0.0,
        )
        for i, paper in enumerate(papers)
    ]

    reranked = await asyncio.to_thread(
        reranker.postprocess_nodes,
        nodes,
        QueryBundle(query_str=user_query.strip()),
    )

    out = []
    for node in reranked:
        idx = node.node.metadata.get("paper_index")
        if idx is not None:
            paper = {**papers[idx], "rerank_score": node.score}
            out.append(paper)
    return out[:top_n] if top_n else out
