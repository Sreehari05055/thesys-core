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
                "FetchResearch": self._fetch_research,
            }
            args = json.loads(args_str) if args_str.strip() else {}
            ctx = {
                "session_id": session_id,
                "store": store,
                "search_params": search_params
            }
            
            logger.info("Executing tool: %s", function_name)
            return await dispatch_map[function_name](args, ctx)
        except Exception as e:
            logger.error("Tool failure [%s]: %s", function_name, e, exc_info=True)
            return f"Error executing {function_name}: {str(e)}"

    async def _execute_search_research(self, args, ctx):
        session_id = ctx.get("session_id")
        search_params = dict(ctx.get("search_params") or {})
        if search_params.get("research_mode"):
            return (
                "SearchResearch is unavailable while external research mode is enabled. "
                "Use FetchResearch for OpenAlex literature, or ask the user to disable "
                "research mode to search uploaded documents."
            )
        args.get("top_n") is not None and search_params.update(top_n=args["top_n"])
        return await self.rag_service.get_info(
            queries=args.get("topic"),
            user_query=args.get("question"),
            session_id=session_id,
            search_params=search_params,
        )

    async def _fetch_research(self, args, ctx):
        """Fetch academic papers via ScholarExecutionService; returns papers + context_text dict."""
        payload = await self.scholar_service.fetch_research(
            query=args.get("query") or "",
            doi=args.get("doi"),
            title=args.get("title"),
            authors=args.get("authors"),
            pmid=args.get("pmid"),
            arxiv_id=args.get("arxiv_id"),
            count=args.get("count") or 10,
            publication_year=args.get("publication_year"),
            is_oa=args.get("is_oa"),
            has_pdf=args.get("has_pdf"),
        )
        logger.info("FetchResearch returned %d paper(s)", len(payload.get("papers") or []))
        return payload
