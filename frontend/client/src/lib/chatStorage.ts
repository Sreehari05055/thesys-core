import type { ChatMessage } from "@/lib/chatMessages";
import type { Chat } from "@/types/chat";

const CHATS_STORAGE_KEY = "thesys_chats";
const ACTIVE_CHAT_KEY = "thesys_active_chat";

/** Best-effort local copy of a session's messages (same source the workspace sidebar uses). */
export function getCachedSessionMessages(sessionId: string): ChatMessage[] {
  const trimmed = sessionId.trim();
  if (!trimmed) return [];
  const chat = loadChats().find((c) => c.sessionId.trim() === trimmed);
  return chat?.messages ?? [];
}

export function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(CHATS_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Chat[];
  } catch {
    // private mode or corrupt data
  }
  return [];
}

export function saveChats(chats: Chat[]): void {
  try {
    const slim = chats.map((c) => ({
      ...c,
      messages: c.messages.map(({ sources: _s, externalPapers: _p, ...msg }) => msg),
    }));
    localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(slim));
  } catch {
    // quota exceeded
  }
}

export function loadActiveChatId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CHAT_KEY);
  } catch {
    return null;
  }
}

export function saveActiveChatId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_CHAT_KEY, id);
    else localStorage.removeItem(ACTIVE_CHAT_KEY);
  } catch {
    // ignore
  }
}

export function parseOptionalIsoToMs(value?: string): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

function chatSortTimestamp(chat: Chat): number {
  return chat.lastAccessAt ?? chat.createdAt;
}

export function sortChatsByRecent(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => chatSortTimestamp(b) - chatSortTimestamp(a));
}

export function bumpChatLastAccess(chats: Chat[], chatId: string): Chat[] {
  const now = Date.now();
  const updated = chats.map((c) => (c.id === chatId ? { ...c, lastAccessAt: now } : c));
  return sortChatsByRecent(updated);
}

export function isDefaultSessionTitle(title: string): boolean {
  const trimmed = title.trim();
  return (
    trimmed === "New Chat" ||
    trimmed === "New session" ||
    /^Conversation \d+$/.test(trimmed)
  );
}

