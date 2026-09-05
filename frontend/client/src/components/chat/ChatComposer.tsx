import type { ReactNode, RefObject } from "react";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import { cn } from "@/lib/utils";

type ChatComposerProps = {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  loading: boolean;
  canSend: boolean;
  placeholder: string;
  /** Left corner control (e.g. sources +). */
  lead?: ReactNode;
  /** Bottom-left inside the input area (e.g. scope picker). */
  insetFooter?: ReactNode;
  composerClassName?: string;
  testIdInput?: string;
  testIdSubmit?: string;
};

export function ChatComposer({
  inputRef,
  value,
  onChange,
  onKeyDown,
  onSend,
  loading,
  canSend,
  placeholder,
  lead,
  insetFooter,
  composerClassName,
  testIdInput = "input-chat-message",
  testIdSubmit = "button-chat-submit",
}: ChatComposerProps) {
  useAutoResizeTextarea(inputRef, value, { minPx: 56, maxPx: 160 });

  const showSendButton = canSend || loading;

  return (
    <>
      <div
        className={cn(
          "rag-composer-bar flex w-full items-end gap-1.5 rounded-xl px-2.5 py-2",
          composerClassName,
        )}
      >
        {lead ? (
          <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center self-end">
            {lead}
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <textarea
            ref={inputRef}
            rows={2}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
            placeholder={placeholder}
            className="rag-chat-input min-h-[56px] max-h-40 min-w-0 w-full resize-none border-0 bg-transparent px-0.5 py-0.5 text-[14px] leading-6 text-foreground shadow-none outline-none placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid={testIdInput}
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center">{insetFooter}</div>
            <div
              className={cn(
                "shrink-0 overflow-hidden transition-[width,opacity,transform] duration-300 ease-out motion-reduce:transition-none",
                showSendButton
                  ? "w-8 translate-x-0 scale-100 opacity-100"
                  : "w-0 translate-x-1 scale-90 opacity-0 pointer-events-none",
              )}
              aria-hidden={!showSendButton}
            >
              <button
                type="button"
                onClick={onSend}
                disabled={!canSend}
                tabIndex={showSendButton ? 0 : -1}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-[filter,opacity] duration-200 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-35"
                data-testid={testIdSubmit}
                aria-label="Send message"
                title="Send"
              >
                {loading ? (
                  <div
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                    data-testid="icon-send-loading"
                  />
                ) : (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    data-testid="icon-send"
                    aria-hidden
                  >
                    <path d="M12 19V5" />
                    <path d="M5 12l7-7 7 7" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      <p
        className="mt-1.5 px-1 text-center text-[11px] leading-snug text-muted-foreground/45"
        data-testid="chat-ai-disclaimer"
      >
        AI responses may contain errors. Verify important information.
      </p>
    </>
  );
}
