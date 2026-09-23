import json
from app import logger

class ToolExecutor:
    def __init__(self, rag_service=None, scholar_service=None):
        self.rag_service = rag_service
        self.scholar_service = scholar_service

    async def execute(self, function_name, args_str, session_id=None, store=None, search_params=None):
        """Dynamic tool dispatcher."""
        try:
            dispatch_map = {
                "SearchResearch": self._execute_search_research,
                "FetchResearch": self._execute_fetch_research,
                "CompareResearch": self._execute_compare_research,
            }
            args = json.loads(args_str) if args_str.strip() else {}
            ctx = {
                "session_id": session_id,
                "store": store,
                "search_params": search_params
            }
            
            logger.info("Executing tool: %s", function_name)
            return await dispatch_map[function_name](args, ctx)
        except Exception:
            logger.error("Tool failure [%s]", function_name, exc_info=True)
            raise

    async def _execute_search_research(self, args, ctx):
        session_id = ctx.get("session_id")
        search_params = dict(ctx.get("search_params") or {})
        args.get("top_n") is not None and search_params.update(top_n=args["top_n"])
        return await self.rag_service.get_info(
            queries=args.get("topic"),
            user_query=args.get("question"),
            session_id=session_id,
            search_params=search_params,
        )

    async def _execute_fetch_research(self, args, ctx):
        """Fetch academic papers via ScholarExecutionService; returns papers + context_text dict."""
        payload = await self.scholar_service.fetch_research(
            query=args.get("query") or "",
            doi=args.get("doi"),
            title=args.get("title"),
            authors=args.get("authors"),
            pmid=args.get("pmid"),
            arxiv_id=args.get("arxiv_id"),
            cited_by_count=args.get("cited_by_count"),
            count=args.get("count") or 10,
            publication_year=args.get("publication_year"),
            is_oa=args.get("is_oa"),
            has_pdf=args.get("has_pdf"),
        )
        logger.info("FetchResearch returned %d paper(s)", len(payload.get("papers") or []))
        return payload

    async def _execute_compare_research(self, args, ctx):
        """Compare exactly two uploaded papers on one claim or question."""
        session_id = ctx.get("session_id")
        search_params = dict(ctx.get("search_params") or {})
        return await self.rag_service.compare_research(
            queries=args.get("topic"),
            user_query=args.get("question"),
            session_id=session_id,
            search_params=search_params,
        )