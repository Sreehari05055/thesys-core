import { cn } from "@/lib/utils";

type CompareModeToggleProps = {
  on: boolean;
  onToggle: (on: boolean) => void;
  disabled?: boolean;
};

export function CompareModeToggle({ on, onToggle, disabled = false }: CompareModeToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      onClick={() => onToggle(!on)}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        on
          ? "border-primary/25 bg-primary/8 text-primary hover:bg-primary/12"
          : "border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      data-testid="button-compare-mode"
      aria-label={on ? "Compare mode on" : "Compare these two papers"}
      title="Compare the two selected papers"
    >
      Compare
    </button>
  );
}
