type SessionModeDialogProps = {
  open: boolean;
  openaiConfigured: boolean | null;
  creating: boolean;
  onClose: () => void;
  onChoose: (offline: boolean) => void;
};

export function SessionModeDialog({
  open,
  openaiConfigured,
  creating,
  onClose,
  onChoose,
}: SessionModeDialogProps) {
  if (!open) return null;

  const aiAvailable = openaiConfigured === true;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
      onClick={() => {
        if (!creating) onClose();
      }}
      role="presentation"
      data-testid="session-mode-dialog-backdrop"
    >
      <div
        role="dialog"
        aria-labelledby="session-mode-dialog-title"
        aria-describedby="session-mode-dialog-description"
        aria-busy={creating}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        data-testid="session-mode-dialog"
      >
        <h3 id="session-mode-dialog-title" className="text-[15px] font-semibold text-foreground">
          New session
        </h3>
        <p
          id="session-mode-dialog-description"
          className="mt-2 text-[13px] text-muted-foreground leading-relaxed"
        >
          {aiAvailable
            ? "Chat with AI answers, or search papers and highlight matching passages without AI."
            : "No OpenAI API key is set. You can still search papers and highlight passages."}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={creating || !aiAvailable}
            onClick={() => onChoose(false)}
            className="rounded-md border border-primary/25 bg-primary/8 px-4 py-2.5 text-left text-[13px] font-medium text-primary hover:bg-primary/14 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-session-mode-ai"
            title={aiAvailable ? undefined : "Set OPENAI_API_KEY to use AI"}
          >
            <div className="font-semibold">With AI</div>
            <div className="mt-0.5 text-[12px] font-normal text-primary/80">
              {aiAvailable
                ? "Chat, summarize, and cite with the model."
                : "Unavailable until an API key is set."}
            </div>
          </button>
          <button
            type="button"
            disabled={creating}
            onClick={() => onChoose(true)}
            className="rounded-md border border-border px-4 py-2.5 text-left text-[13px] font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            data-testid="button-session-mode-offline"
          >
            <div className="font-semibold">Without AI</div>
            <div className="mt-0.5 text-[12px] font-normal text-muted-foreground">
              Locate and highlight passages. No model answers.
            </div>
          </button>
          <button
            type="button"
            disabled={creating}
            onClick={onClose}
            className="mt-1 rounded-md px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            data-testid="button-session-mode-cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
