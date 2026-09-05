import { useCallback, useLayoutEffect, type RefObject } from "react";

type Options = {
  minPx?: number;
  maxPx?: number;
};

/** Auto-grow a chat textarea between min/max height; hide scrollbar until max. */
export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  { minPx = 40, maxPx = 160 }: Options = {},
) {
  const syncHeight = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, minPx), maxPx);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxPx ? "auto" : "hidden";
  }, [ref, minPx, maxPx]);

  useLayoutEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  return syncHeight;
}
