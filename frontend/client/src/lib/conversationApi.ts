import { apiFetch } from "@/lib/apiFetch";
import { API_URLS } from "@/config";
import type { ActiveDocument } from "@/lib/chatDocScope";
import { normalizeLoadedMessages, type ChatMessage } from "@/lib/chatMessages";
import type { ResearchScope } from "@/lib/researchScope";
import type { ConversationLoadResponse } from "@/types/chat";

const CITED_PASSAGE_LABEL = "(cited passage)";

/** User + empty bot placeholders at the start of a streaming turn. */
export function streamingTurnMessages(displayText: string): ChatMessage[] {
  return [
    { sender: "user", text: displayText },
    { sender: "bot", text: "", raw: "" },
  ];
}

export function chatQuestionText(trimmed: string, sourceIds: string[]): string {
  return trimmed || (sourceIds.length > 0 ? CITED_PASSAGE_LABEL : "");
}

export function buildChatPostBody(
  question: string,
  options?: {
    sourceIds?: string[];
    activeDocuments?: ActiveDocument[];
    retrievalScope?: ResearchScope;
  },
): string {
  const discover = options?.retrievalScope === "discover";
  return JSON.stringify({
    question,
    ...(discover ? { research_mode: true } : {}),
    ...(!discover && options?.sourceIds?.length ? { source_ids: options.sourceIds } : {}),
    ...(!discover && options?.activeDocuments?.length
      ? { active_documents: options.activeDocuments }
      : {}),
  });
}

function extractConversationMessages(data: unknown): unknown {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];

  const record = data as Record<string, unknown>;
  if (Array.isArray(record.messages)) return record.messages;
  if (Array.isArray(record.history)) return record.history;
  if (Array.isArray(record.conversation_messages)) return record.conversation_messages;

  const nested = record.conversation;
  if (nested && typeof nested === "object") {
    const conversation = nested as Record<string, unknown>;
    if (Array.isArray(conversation.messages)) return conversation.messages;
  }

  return [];
}

function backfillBotSources(loaded: ChatMessage[], cached: ChatMessage[]): ChatMessage[] {
  const cachedBot = cached.filter((m) => m.sender === "bot");
  let botIdx = 0;
  return loaded.map((msg) => {
    if (msg.sender !== "bot") return msg;
    const cachedMsg = cachedBot[botIdx++];
    const next = { ...msg };
    if ((next.sources?.length ?? 0) === 0 && cachedMsg?.sources?.length) {
      next.sources = cachedMsg.sources;
    }
    if ((next.externalPapers?.length ?? 0) === 0 && cachedMsg?.externalPapers?.length) {
      next.externalPapers = cachedMsg.externalPapers;
    }
    return next;
  });
}

/** True when cache tail is an in-flight turn not yet fully persisted. */
function isInFlightTail(tail: ChatMessage[]): boolean {
  if (tail.length === 0 || tail.length > 2) return false;
  if (tail.length === 1) {
    return tail[0]?.sender === "user" || tail[0]?.sender === "bot";
  }
  return tail[0]?.sender === "user" && tail[1]?.sender === "bot";
}

function messageContentKey(msg: ChatMessage): string {
  return (msg.raw ?? msg.text).trim();
}

function cachedPrefixMatchesLoaded(
  cached: ChatMessage[],
  loaded: ChatMessage[],
): boolean {
  if (loaded.length > cached.length) return false;

  for (let i = 0; i < loaded.length; i++) {
    const a = cached[i];
    const b = loaded[i];
    if (!a || !b || a.sender !== b.sender) return false;
    if (messageContentKey(a) !== messageContentKey(b)) return false;
  }
  return true;
}

/** Prefer API history when present; backfill sources stripped from localStorage cache. */
export function mergeLoadedConversationMessages(
  loaded: ChatMessage[],
  cached: ChatMessage[],
): ChatMessage[] {
  if (loaded.length === 0) return cached;
  if (cached.length === 0) return loaded;

  const merged = backfillBotSources(loaded, cached);

  // Never return the full cache when it is longer than the API response — only
  // append a verified in-flight tail (e.g. message still streaming).
  if (cached.length <= loaded.length) return merged;

  const tail = cached.slice(loaded.length);
  if (cachedPrefixMatchesLoaded(cached, loaded) && isInFlightTail(tail)) {
    return [...merged, ...tail];
  }

  return merged;
}

export async function fetchConversation(sessionId: string): Promise<{
  messages: ChatMessage[];
  title: string | null;
}> {
  const res = await apiFetch(API_URLS.loadConversation, {}, sessionId);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as ConversationLoadResponse;
  const title =
    typeof data.title === "string" && data.title.trim() ? data.title.trim() : null;
  return {
    messages: normalizeLoadedMessages(extractConversationMessages(data)),
    title,
  };
}
