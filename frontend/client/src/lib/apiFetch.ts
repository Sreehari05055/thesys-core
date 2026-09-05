/** Header required by session-scoped backend routes (`OwnedSession`). */
const SESSION_ID_HEADER = "X-Session-ID";

function withSessionId(sessionId: string, init: RequestInit = {}): RequestInit {
  const trimmed = sessionId.trim();
  if (!trimmed) return init;

  const headers = new Headers(init.headers);
  headers.set(SESSION_ID_HEADER, trimmed);
  return { ...init, headers };
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  sessionId?: string,
): Promise<Response> {
  const requestInit = sessionId ? withSessionId(sessionId, init) : init;
  return fetch(input, requestInit);
}
