import type { Source } from "@/lib/chatMessages";
import { getDocDisplayName } from "@/lib/sourceDoc";
import { passageChipLabel } from "@/lib/readerPassageSelection";

type PassageChipProps = {
  text: string;
  preview?: string;
  page?: number;
  onLocate?: () => void;
  onRemove?: () => void;
};

function PassageChip({ text, preview, page, onLocate, onRemove }: PassageChipProps) {
  const label = passageChipLabel({ text, preview, page });
  const canLocate = Boolean(onLocate);

  return (
    <div className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/15 py-1 pl-2 pr-1.5 text-[11px] font-medium text-primary">
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
        aria-hidden
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
      <button
        type="button"
        onClick={onLocate}
        disabled={!canLocate}
        className="min-w-0 max-w-[14rem] truncate text-left leading-snug text-primary/90 transition-colors enabled:cursor-pointer enabled:hover:text-primary disabled:cursor-default"
        title={label}
        data-testid="button-locate-passage-chip"
      >
        &ldquo;{label}&rdquo;
        {page != null && page > 0 ? (
          <span className="ml-1.5 shrink-0 text-[10px] font-semibold text-primary/60">p.{page}</span>
        ) : null}
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-primary/20 hover:text-primary"
          title="Remove selected passage"
          data-testid="button-remove-passage-chip"
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

type PendingPassageChipsProps = {
  passages: Array<{ id: string; text: string; preview?: string; page: number }>;
  onLocate?: (id: string) => void;
  onRemove: (id: string) => void;
};

export function PendingPassageChips({ passages, onLocate, onRemove }: PendingPassageChipsProps) {
  if (passages.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {passages.map((passage) => (
        <PassageChip
          key={passage.id}
          text={passage.text}
          preview={passage.preview}
          page={passage.page}
          onLocate={onLocate ? () => onLocate(passage.id) : undefined}
          onRemove={() => onRemove(passage.id)}
        />
      ))}
    </div>
  );
}

export function SentPassageChips({
  passages,
}: {
  passages: Array<{ text: string; preview?: string; page: number }>;
}) {
  if (passages.length === 0) return null;
  return (
    <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
      {passages.map((passage, i) => (
        <PassageChip
          key={`${passage.page}-${i}`}
          text={passage.text}
          preview={passage.preview}
          page={passage.page}
        />
      ))}
    </div>
  );
}

type PendingSourceChipsProps = {
  sources: Source[];
  onRemove: (index: number) => void;
};

export function PendingSourceChips({ sources, onRemove }: PendingSourceChipsProps) {
  if (sources.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      {sources.map((ref, i) => (
        <div
          key={ref.id ?? i}
          className="flex max-w-[90%] items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 py-1 pl-2.5 pr-1.5 text-[11px] font-medium text-primary"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="truncate">{getDocDisplayName(ref)}</span>
          {ref.pages && ref.pages.length > 0 && (
            <span className="shrink-0 text-primary/60">
              {ref.pages.length > 1 ? `pp.${ref.pages.join(",")}` : `p.${ref.pages[0]}`}
            </span>
          )}
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-primary/20 hover:text-primary"
            title="Remove reference"
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
