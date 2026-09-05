const NEAR_BOTTOM_PX = 96;
const SCROLL_TO_BOTTOM_DELAY_MS = 80;

function scrollMetrics(el: HTMLDivElement) {
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  const nearBottom = max - el.scrollTop <= NEAR_BOTTOM_PX;
  const ratio = max > 0 ? el.scrollTop / max : 0;
  return { max, nearBottom, ratio };
}

function restoreScrollPosition(
  el: HTMLDivElement,
  nearBottom: boolean,
  ratio: number,
): void {
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  if (max <= 0) {
    el.scrollTop = 0;
    return;
  }
  el.scrollTop = nearBottom ? max : Math.round(ratio * max);
}

/** Scroll chat message list to the bottom after layout (streaming, new message). */
export function scrollChatToBottom(
  scrollEl: HTMLDivElement | null | undefined,
  delayMs = SCROLL_TO_BOTTOM_DELAY_MS,
): void {
  if (!scrollEl) return;
  window.setTimeout(() => {
    if (document.contains(scrollEl)) {
      scrollEl.scrollTop = scrollEl.scrollHeight;
    }
  }, delayMs);
}

/** Run `action` then restore scroll after layout / panel resize settles. */
export function preserveScrollPosition(
  scrollEl: HTMLDivElement | null | undefined,
  action: () => void,
): void {
  if (!scrollEl) {
    action();
    return;
  }

  const { nearBottom, ratio } = scrollMetrics(scrollEl);
  action();

  const restore = () => {
    if (!document.contains(scrollEl)) return;
    restoreScrollPosition(scrollEl, nearBottom, ratio);
  };

  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });

  const observer = new ResizeObserver(() => restore());
  observer.observe(scrollEl);
  window.setTimeout(() => observer.disconnect(), 400);
}
