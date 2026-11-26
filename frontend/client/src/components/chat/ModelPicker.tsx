import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

type ModelPickerProps = {
  models: string[];
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
};

const POPOVER_CONTENT_CLASS =
  "z-50 min-w-[11.5rem] rounded-lg p-1 outline-none rag-popover-content";

export function ModelPicker({ models, value, onChange, disabled = false }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = models.includes(value) ? value : models[0];

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-transparent px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-foreground",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          data-testid="button-chat-model-trigger"
          aria-label={`Chat model: ${selected}`}
        >
          <span>{selected}</span>
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
          data-testid="popover-chat-model"
        >
          {models.map((name) => {
            const active = name === selected;
            return (
              <button
                key={name}
                type="button"
                onClick={() => pick(name)}
                className={cn(
                  "flex w-full items-center rounded-md px-2.5 py-2 text-left text-[12px] font-medium whitespace-nowrap transition-colors",
                  active
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                data-testid={`button-chat-model-${name}`}
              >
                {name}
              </button>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
