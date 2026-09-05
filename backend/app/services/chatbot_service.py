import json
import re
from typing import AsyncGenerator, List, Dict, Any
from app import logger
from app.services.langchain_handler.langchain_service import LangChainService
from app.services.langchain_handler.tool_definitions import FetchResearch, get_tool_schemas
from app.services.session_title_service import SessionTitleService
from app.prompts.prompts import (
    format_active_documents_scope,
    get_fetch_research_system_prompt,
)
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage, BaseMessage

class ChatbotService:
    def __init__(self, system_prompt: str, store, http_client, rag_service=None, summarizer_service=None, scholar_service=None):
        from app.services.langchain_handler.tool_executor import ToolExecutor
        self.system_prompt = system_prompt
        self.store = store
        self.rag_service = rag_service
        self.scholar_service = scholar_service

        self.tool_executor = ToolExecutor(
            rag_service=rag_service,
            scholar_service=scholar_service,
        )
        self.tools = get_tool_schemas()
        self.title_service = SessionTitleService()

    def _tools_for_turn(self, research_mode: bool, blocked_tools: set[str]) -> list:
        if research_mode:
            return [FetchResearch]
        return [t for t in self.tools if t.__name__ not in blocked_tools]

    def _convert_to_langchain_messages(self, stored_messages: List[Dict[str, Any]]) -> List[BaseMessage]:
        """Convert stored JSON messages to LangChain Message objects."""
        responded_ids = {
            msg["tool_call_id"]
            for msg in stored_messages
            if msg.get("role") == "tool" and msg.get("tool_call_id")
        }
        lc_messages = []
        for msg in stored_messages:
            role = msg.get("role")
            content = msg.get("content", "")
            
            if role == "user":
                lc_messages.append(HumanMessage(content=content))
            elif role == "assistant":
                tool_calls = msg.get("tool_calls", [])
                lc_tool_calls = []
                for tc in tool_calls:
                   lc_tool_calls.append({
                       "id": tc.get("id"),
                       "name": tc.get("function", {}).get("name"),
                       "args": json.loads(tc.get("function", {}).get("arguments", "{}")),
                       "type": "tool_call"
                   })

                if lc_tool_calls:
                    missing = [tc["id"] for tc in lc_tool_calls if tc["id"] not in responded_ids]
                    if missing:
                        logger.warning(f"Dropping assistant message with unanswered tool_call_ids: {missing}")
                        continue

                lc_messages.append(AIMessage(content=content or "", tool_calls=lc_tool_calls))
            elif role == "tool":
                tool_call_id = msg.get("tool_call_id")
                if not tool_call_id:
                    logger.warning("Skipping ToolMessage with missing tool_call_id (old stored message).")
                    continue
                lc_messages.append(ToolMessage(
                    tool_call_id=tool_call_id,
                    content=content,
                    name=msg.get("name")
                ))
            elif role == "system":
                 lc_messages.append(SystemMessage(content=content))
        return lc_messages

    @staticmethod
    def _filenames_from_active_documents(active_documents: list[dict]) -> list[str]:
        return [d["filename"] for d in active_documents if d.get("filename")]

    @staticmethod
    def _last_user_active_documents(stored_messages: List[Dict[str, Any]]) -> list[dict]:
        """Active doc pins from the most recent prior user turn (if any)."""
        for msg in reversed(stored_messages):
            if msg.get("role") != "user":
                continue
            docs = msg.get("active_documents")
            if docs:
                return docs
            return []
        return []

    def _augment_query_with_active_scope(
        self,
        query: str,
        active_documents: list[dict],
        previous_active_documents: list[dict],
    ) -> str:
        filenames = self._filenames_from_active_documents(active_documents)
        if not filenames:
            return query
        prev_names = self._filenames_from_active_documents(previous_active_documents)
        scope = format_active_documents_scope(
            filenames,
            previous_filenames=prev_names if previous_active_documents or prev_names else None,
        )
        return f"{scope}\n\n{query}"

    @staticmethod
    def _extract_source_ids_from_context(text: str) -> set[str]:
        """Extract allowed Source IDs from formatted RAG context.

        The context is formatted with lines like: `Source ID: [<id>]`.
        We accept the full token inside brackets and normalize to lowercase.
        """
        if not text:
            return set()

        ids = re.findall(r"Source ID:\s*\[([^\]]+)\]", text)
        return {i.lower() for i in ids if i}

    @staticmethod
    def _sanitize_citations_stream(text: str, allowed_ids: set[str]) -> str:
        """Remove citation tokens not present in `allowed_ids`.
        Only affects bracket tokens that look like our chunk ids: `[<hex>_cN]`.
        """   
        if not text:
            return text
        chunk_id_pat = r"\[([0-9a-fA-F]{16,64}_c\d+)\]"
        if not allowed_ids:
            return re.sub(chunk_id_pat, "", text)

        def _repl(m: re.Match) -> str:
            token = (m.group(1) or "").lower()
            return m.group(0) if token in allowed_ids else ""

        return re.sub(chunk_id_pat, _repl, text)

    @staticmethod
    def _source_ids_from_stored_messages(stored_messages: List[Dict[str, Any]]) -> set[str]:
        """Collect chunk IDs from persisted message sources and inline citations."""
        ids: set[str] = set()
        chunk_id_pat = r"([0-9a-fA-F]{16,64}_c\d+)"
        for msg in stored_messages or []:
            for src in msg.get("sources") or []:
                if isinstance(src, dict):
                    if src.get("id"):
                        ids.add(str(src["id"]).lower())
                    for side in ("chunk_a", "chunk_b"):
                        side_src = src.get(side)
                        if isinstance(side_src, dict) and side_src.get("id"):
                            ids.add(str(side_src["id"]).lower())
            if msg.get("role") not in ("assistant", "tool"):
                continue
            content = msg.get("content") or ""
            ids.update(m.lower() for m in re.findall(chunk_id_pat, content))
            ids |= ChatbotService._extract_source_ids_from_context(content)
        return ids

    @staticmethod
    def _append_context_to_human_message(lc_messages: List[BaseMessage], section_title: str, body: str) -> None:
        if not body or not lc_messages:
            return
        last = lc_messages[-1]
        base = getattr(last, "content", "") or ""
        lc_messages[-1] = HumanMessage(content=f"{base}\n\n[{section_title}]\n{body}")

    async def _generate_response(self, session_id: str, query: str, settings: Dict[str, Any]) -> AsyncGenerator[str, None]:
        try:
            research_mode = settings.get("research_mode")
            search_params = {
                "source_ids": settings.get("source_ids") or [],
                "doc_ids": settings.get("doc_ids") or [],
                "active_documents": settings.get("active_documents") or [],
                "provider": settings.get("provider"),
                "model": settings.get("model"),
                "research_mode": bool(research_mode),
            }

            pending_sources = []
            seen_source_ids = set()
            stored_msgs = await self.store.get_messages(session_id)
            is_first_user_message = not any(m.get("role") == "user" for m in stored_msgs)

            session_title = None
            if is_first_user_message:
                session_title = await self.title_service.generate_and_set_first_title(
                    self.store,
                    session_id,
                    query,
                    provider=search_params.get("provider"),
                    model_name=search_params.get("model"),
                )

            llm = LangChainService.get_llm(
                provider=search_params.get("provider"),
                model_name=search_params.get("model"),
            )
            blocked_tools: set[str] = set()
            if research_mode:
                blocked_tools.add("SearchResearch")

            turn_tools = self._tools_for_turn(research_mode, blocked_tools)
            llm_with_tools = (
                llm.bind_tools(turn_tools, parallel_tool_calls=False)
                if turn_tools
                else llm
            )

            active_documents = search_params.get("active_documents") or []
            previous_active_documents = self._last_user_active_documents(stored_msgs)

            user_msg: Dict[str, Any] = {"role": "user", "content": query}
            if active_documents:
                user_msg["active_documents"] = active_documents
            await self.store.add_message(session_id, user_msg)
            stored_msgs.append(user_msg)

            if session_title:
                yield f"data: {json.dumps({'session_title': session_title}, ensure_ascii=False)}\n\n"

            system_prompt = (
                get_fetch_research_system_prompt()
                if research_mode
                else self.system_prompt
            )
            lc_messages = [SystemMessage(content=system_prompt)] + self._convert_to_langchain_messages(stored_msgs)
            if active_documents:
                augmented_query = self._augment_query_with_active_scope(
                    query, active_documents, previous_active_documents
                )
                lc_messages[-1] = HumanMessage(content=augmented_query)
                logger.info(
                    "Active document scope for session %s: %s",
                    session_id,
                    self._filenames_from_active_documents(active_documents),
                )

            source_ids = search_params.get("source_ids") or []
            llm_for_turn = llm_with_tools
            session_source_ids = {
                sid.lower() for sid in await self.store.get_session_source_ids(session_id)
            }
            session_source_ids |= self._source_ids_from_stored_messages(stored_msgs)
            allowed_source_ids: set[str] = set(session_source_ids)
            if session_source_ids:
                logger.info(
                    "Session %s: %d historical source id(s) allowed for citations",
                    session_id,
                    len(session_source_ids),
                )
            if source_ids:
                allowed_source_ids |= {str(s).lower() for s in source_ids if s}
                try:
                    prefetch_result = await self.rag_service.get_info(
                        queries=[query],
                        user_query=query,
                        session_id=session_id,
                        search_params=search_params,
                    )
                    if prefetch_result.get("context_text"):
                        pinned_sources = prefetch_result.get("sources", [])

                        yield f"data: {json.dumps({'sources': pinned_sources}, ensure_ascii=False)}\n\n"
                        base = lc_messages[-1].content if lc_messages else query
                        augmented_content = (
                            f"{base}\n\n"
                            f"[Relevant document sections]\n{prefetch_result['context_text']}"
                        )
                        allowed_source_ids |= self._extract_source_ids_from_context(prefetch_result.get("context_text") or "")
                        lc_messages[-1] = HumanMessage(content=augmented_content)
                        blocked_tools.add("SearchResearch")
                        turn_tools = self._tools_for_turn(research_mode, blocked_tools)
                        llm_for_turn = (
                            llm.bind_tools(turn_tools, parallel_tool_calls=False)
                            if turn_tools
                            else llm
                        )
                        logger.info(f"Augmented HumanMessage with {len(pinned_sources)} pinned chunks for session {session_id}.")
                except Exception as e:
                    logger.warning(f"Failed to pre-fetch source_ids context: {e}")

            while True:
                accumulated_msg = None
                async for chunk in llm_for_turn.astream(lc_messages):
                    if accumulated_msg is None:
                        accumulated_msg = chunk
                    else:
                        accumulated_msg += chunk

                    if chunk.text:
                        emit = self._sanitize_citations_stream(chunk.text, allowed_source_ids)
                        if emit:
                            yield f"data: {json.dumps({'content': emit}, ensure_ascii=False)}\n\n"

                if not accumulated_msg:
                    break
                final_content = self._sanitize_citations_stream(
                    accumulated_msg.text or "", allowed_source_ids
                )

                ai_msg_dict = {
                    "role": "assistant",
                    "content": final_content,
                }
                
                if accumulated_msg.tool_calls:
                    tc = accumulated_msg.tool_calls[0]
                    tool_name = tc["name"]
                    tool_args = tc.get("args", {})
                    tool_id = tc["id"]
                    tool_calls_data_to_store = [{
                        "id": tool_id,
                        "type": "function",
                        "function": {
                            "name": tool_name,
                            "arguments": json.dumps(tool_args),
                        },
                    }]

                    lc_messages.append(accumulated_msg)

                    if final_content or tool_calls_data_to_store:
                        ai_msg_dict_to_store = ai_msg_dict.copy()
                        if tool_calls_data_to_store:
                            ai_msg_dict_to_store["tool_calls"] = tool_calls_data_to_store
                        await self.store.add_message(session_id, ai_msg_dict_to_store)

                    logger.info(f"Invoking tool: {tool_name}")
                    try:
                        tool_result = await self.tool_executor.execute(
                            tool_name,
                            json.dumps(tool_args),
                            session_id=session_id,
                            store=self.store,
                            search_params=search_params,
                        )
                    except Exception as e:
                        tool_result = e

                    tool_result_content = ""
                    tool_papers = None
                    if isinstance(tool_result, Exception):
                        tool_result_content = f"Error executing tool {tool_name}: {str(tool_result)}"
                    elif tool_name == "FetchResearch" and isinstance(tool_result, dict):
                        if tool_result.get("error"):
                            tool_result_content = tool_result["error"]
                        else:
                            external_papers = tool_result.get("papers") or []
                            if external_papers:
                                tool_papers = external_papers
                                yield f"data: {json.dumps({'external_papers': external_papers}, ensure_ascii=False)}\n\n"
                            tool_result_content = (
                                tool_result.get("context_text")
                                or "No matching papers found."
                            )
                    elif isinstance(tool_result, dict) and tool_result.get("type") == "search_research" and "context_text" in tool_result:
                        sources = tool_result.get("sources", [])

                        new_chunks = []
                        for src in sources:
                            src_id = src.get("id")
                            if src_id and src_id not in seen_source_ids:
                                pending_sources.append(src)
                                seen_source_ids.add(src_id)
                                new_chunks.append(src)

                        if new_chunks:
                            tool_result_content = self.tool_executor.rag_service.format_context(new_chunks)
                            logger.info(f"Content: {tool_name} : {tool_result_content}")
                        else:
                            tool_result_content = "All retrieved sources were already present in your context. No new information found."
                        allowed_source_ids |= self._extract_source_ids_from_context(tool_result_content)

                        yield f"data: {json.dumps({'sources': pending_sources}, ensure_ascii=False)}\n\n"
                    else:
                        tool_result_content = str(tool_result)

                    lc_messages.append(ToolMessage(
                        tool_call_id=tool_id,
                        content=tool_result_content,
                        name=tool_name,
                    ))
                    await self.store.add_message(
                        session_id,
                        {
                            "role": "tool",
                            "tool_call_id": tool_id,
                            "name": tool_name,
                            "content": tool_result_content,
                        },
                        papers=tool_papers,
                    )

                else:
                    final_sources = pending_sources if pending_sources else None
                    await self.store.add_message(session_id, ai_msg_dict, sources=final_sources)
                    pending_sources = []
                    yield f"data: {json.dumps({'end': True, 'content_final': final_content}, ensure_ascii=False)}\n\n"
                    break

        except Exception as e:
            logger.error(f"Error in generation: {e}", exc_info=True)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
