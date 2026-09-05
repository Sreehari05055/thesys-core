import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import type { ResearchScope } from "@/lib/researchScope";
import { RESEARCH_SCOPE_LABELS } from "@/lib/researchScope";
import { cn } from "@/lib/utils";

type ResearchScopePickerProps = {
  scope: ResearchScope;
  onScopeChange: (scope: ResearchScope) => void;
  disabled?: boolean;
};

const SCOPES: ResearchScope[] = ["library", "discover"];

const POPOVER_CONTENT_CLASS =
  "z-50 min-w-[10.5rem] rounded-lg p-1 outline-none rag-popover-content";

export function ResearchScopePicker({
  scope,
  onScopeChange,
  disabled = false,
}: ResearchScopePickerProps) {
  const [open, setOpen] = useState(false);

  const pick = (next: ResearchScope) => {
    onScopeChange(next);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
            "disabled:cursor-not-allowed disabled:opacity-50",
            scope === "library"
              ? "border-primary/25 bg-primary/8 text-primary hover:bg-primary/12"
              : "border-[#D4A574]/25 bg-[#D4A574]/10 text-[#D4A574] hover:bg-[#D4A574]/16",
          )}
          data-testid="button-research-scope-trigger"
          aria-label={`Research scope: ${RESEARCH_SCOPE_LABELS[scope]}`}
        >
          <span className="max-w-[7.5rem] truncate">{RESEARCH_SCOPE_LABELS[scope]}</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 opacity-60"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={POPOVER_CONTENT_CLASS}
          side="top"
          align="start"
          sideOffset={6}
          data-testid="popover-research-scope"
        >
          {SCOPES.map((value) => {
            const active = scope === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => pick(value)}
                className={cn(
                  "flex w-full items-center rounded-md px-2.5 py-2 text-left text-[12px] font-medium transition-colors",
                  active
                    ? value === "library"
                      ? "bg-primary/12 text-primary"
                      : "bg-[#D4A574]/15 text-[#D4A574]"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                data-testid={`button-research-scope-${value}`}
              >
                {RESEARCH_SCOPE_LABELS[value]}
              </button>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
