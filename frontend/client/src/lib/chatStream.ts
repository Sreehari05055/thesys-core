import { extractTextContent } from "@/lib/apiRecord";
import type { HighlightAction } from "@/lib/chatMessages";

export type ChatStreamEvent =
  | { type: "content"; text: string }
  | { type: "sources"; sources: unknown[] }
  | { type: "external_papers"; papers: unknown[] }
  | { type: "highlight"; highlight: HighlightAction }
  | { type: "summaries"; summaries: unknown[] }
  | { type: "session_title"; title: string }
  | { type: "done" };

function isCompareSourcesPayload(sources: unknown[]): boolean {
  return (
    sources.length > 0 &&
    typeof sources[0] === "object" &&
    sources[0] !== null &&
    "chunk_a" in sources[0]
  );
}

function parseStreamPayload(data: Record<string, unknown>): ChatStreamEvent | null {
  if (typeof data.session_title === "string" && data.session_title.trim()) {
    return { type: "session_title", title: data.session_title.trim() };
  }

  if (data.sources && Array.isArray(data.sources)) {
    if (isCompareSourcesPayload(data.sources)) return null;
    return { type: "sources", sources: data.sources };
  }

  if (data.external_papers && Array.isArray(data.external_papers)) {
    return { type: "external_papers", papers: data.external_papers };
  }

  if (data.highlight && typeof data.highlight === "object") {
    return { type: "highlight", highlight: data.highlight as HighlightAction };
  }

  if (data.summaries && Array.isArray(data.summaries)) {
    return { type: "summaries", summaries: data.summaries };
  }

  const chunk = extractTextContent(data.content);
  if (chunk) return { type: "content", text: chunk };

  return null;
}

/** Consume an SSE chat response body and dispatch parsed events. */
export async function consumeChatSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();

    if (value) {
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const jsonStr = trimmed.replace(/^data:\s*/, "").trim();
        if (jsonStr === "[DONE]") {
          onEvent({ type: "done" });
          continue;
        }

        try {
          const data = JSON.parse(jsonStr) as Record<string, unknown>;
          if (!data || typeof data !== "object") continue;
          const event = parseStreamPayload(data);
          if (event) onEvent(event);
        } catch {
          // malformed SSE chunk — skip
        }
      }
    }

    if (done) break;
  }
}
