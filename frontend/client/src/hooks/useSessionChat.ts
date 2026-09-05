import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { API_URLS } from "@/config";
import { CHAT_STREAM_ERROR, getApiErrorMessage } from "@/lib/apiErrors";
import { consumeChatSseStream } from "@/lib/chatStream";
import {
  buildChatPostBody,
  chatQuestionText,
  fetchConversation,
  mergeLoadedConversationMessages,
  streamingTurnMessages,
} from "@/lib/conversationApi";
import {
  normalizeChatSources,
  updateLastBotMessage,
  type ChatMessage,
  type Source,
} from "@/lib/chatMessages";
import { getCachedSessionMessages } from "@/lib/chatStorage";
import {
  normalizeDocumentSummaryFromSummariesEvent,
  type DocumentSummary,
} from "@/lib/documentSummary";

type SummaryDefaults = { filename: string; doc_id: string };

export function useSessionChat(
  sessionId: string,
  summaryDefaults: SummaryDefaults = { filename: "", doc_id: "" },
) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    getCachedSessionMessages(sessionId),
  );
  const [loading, setLoading] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(Boolean(sessionId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [documentSummary, setDocumentSummary] = useState<DocumentSummary | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setConversationLoading(false);
      setLoadError(null);
      return;
    }

    const cached = getCachedSessionMessages(sessionId);
    setMessages(cached);
    setLoadError(null);

    let cancelled = false;
    setConversationLoading(true);

    (async () => {
      try {
        const { messages: loaded } = await fetchConversation(sessionId);
        if (cancelled) return;
        setMessages(mergeLoadedConversationMessages(loaded, cached));
      } catch {
        if (cancelled) return;
        if (cached.length > 0) {
          setMessages(cached);
        } else {
          setLoadError("Could not load conversation.");
        }
      } finally {
        if (!cancelled) setConversationLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const sendMessage = useCallback(
    async (messageText: string, sourceIds: string[] = []): Promise<boolean> => {
      const trimmed = messageText.trim();
      if ((!trimmed && sourceIds.length === 0) || !sessionId || loading) return false;

      const question = chatQuestionText(trimmed, sourceIds);
      setMessages((prev) => [...prev, ...streamingTurnMessages(question)]);
      setLoading(true);

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      let botRaw = "";
      try {
        const response = await apiFetch(
          API_URLS.chat,
          {
            method: "POST",
            signal: abortRef.current.signal,
            headers: { "Content-Type": "application/json" },
            body: buildChatPostBody(question, { sourceIds }),
          },
          sessionId,
        );

        if (!response.ok) {
          const errorMessage = await getApiErrorMessage(response);
          setMessages((prev) =>
            updateLastBotMessage(prev, { text: errorMessage, raw: errorMessage }),
          );
          return false;
        }

        if (!response.body) throw new Error("No response body");

        await consumeChatSseStream(response.body.getReader(), (event) => {
          switch (event.type) {
            case "sources":
              setMessages((prev) =>
                updateLastBotMessage(prev, { sources: normalizeChatSources(event.sources) }),
              );
              break;
            case "summaries":
              setDocumentSummary(
                normalizeDocumentSummaryFromSummariesEvent(event.summaries, summaryDefaults),
              );
              break;
            case "content":
              if (!event.text) break;
              botRaw += event.text;
              setMessages((prev) => updateLastBotMessage(prev, { text: botRaw, raw: botRaw }));
              break;
            default:
              break;
          }
        });

        return true;
      } catch {
        setMessages((prev) =>
          updateLastBotMessage(prev, {
            text: CHAT_STREAM_ERROR,
            raw: CHAT_STREAM_ERROR,
          }),
        );
        return false;
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [sessionId, loading, summaryDefaults],
  );

  const closeSummary = useCallback(() => {
    setDocumentSummary(null);
  }, []);

  return {
    messages,
    loading,
    conversationLoading,
    loadError,
    documentSummary,
    sendMessage,
    closeSummary,
  };
}
