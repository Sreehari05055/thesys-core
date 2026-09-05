type DraftingIndicatorProps = {
  label?: string;
};

export function DraftingIndicator({ label = "Drafting response…" }: DraftingIndicatorProps) {
  return (
    <p className="drafting-indicator" role="status" aria-live="polite" aria-label={label}>
      {label}
    </p>
  );
}
