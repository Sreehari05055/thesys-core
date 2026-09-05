/** Parse JSON body without throwing; returns null on empty or invalid bodies. */
export async function readJsonBody<T = unknown>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function parseApiDetail(payload: unknown): string {
  if (payload == null || typeof payload !== "object") return "";
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (typeof d === "string") return d;
        if (d && typeof d === "object" && "msg" in d && typeof (d as { msg: unknown }).msg === "string") {
          return (d as { msg: string }).msg;
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }
  return "";
}
