import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

export type QuestionStatus = "answered" | "flagged" | "blank";

export interface QuestionPaletteProps {
  count: number;
  /** 1-based question number currently focused in the player. */
  current: number;
  /** 1-based question number → status. Missing entries are treated as "blank". */
  status: Record<number, QuestionStatus>;
  onJump: (n: number) => void;
  /** Offset for tests whose numbering doesn't start at 1 (e.g. passage 2 → 14). */
  startAt?: number;
  className?: string;
}

const statusLabel: Record<QuestionStatus, string> = {
  answered: "answered",
  flagged: "flagged",
  blank: "not answered",
};

/**
 * Exam answer-sheet palette. Answered = filled primary, current = ring,
 * flagged = warning dot, unanswered = outline (12 §6.4). Fully keyboard
 * operable: arrows move, 1–9 jump.
 */
export function QuestionPalette({
  count,
  current,
  status,
  onJump,
  startAt = 1,
  className,
}: QuestionPaletteProps) {
  const numbers = Array.from({ length: count }, (_, i) => startAt + i);
  const last = startAt + count - 1;
  const buttons = useRef(new Map<number, HTMLButtonElement>());

  /**
   * Roving tabindex: only the current cell is tabbable, so the palette is ONE tab
   * stop in a 40-question test instead of forty. That contract is only honest if
   * the arrow keys also move real DOM focus — otherwise the ring stays on the cell
   * you left while `aria-current` silently moves elsewhere, and the next Tab exits
   * from the wrong place.
   */
  const jump = (n: number) => {
    onJump(n);
    buttons.current.get(n)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      jump(Math.min(current + 1, last));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      jump(Math.max(current - 1, startAt));
    } else if (e.key === "Home") {
      e.preventDefault();
      jump(startAt);
    } else if (e.key === "End") {
      e.preventDefault();
      jump(last);
    } else if (/^[1-9]$/.test(e.key)) {
      const target = startAt + Number(e.key) - 1;
      if (target <= last) {
        e.preventDefault();
        jump(target);
      }
    }
  };

  return (
    <div
      role="group"
      aria-label="Question palette. Arrow keys move, Home and End jump to the ends"
      onKeyDown={onKeyDown}
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {numbers.map((n) => {
        const s = status[n] ?? "blank";
        const isCurrent = n === current;
        return (
          <button
            key={n}
            type="button"
            ref={(el) => {
              if (el) buttons.current.set(n, el);
              else buttons.current.delete(n);
            }}
            aria-label={`Question ${n}, ${statusLabel[s]}`}
            aria-current={isCurrent ? "true" : undefined}
            tabIndex={isCurrent ? 0 : -1}
            onClick={() => onJump(n)}
            className={cn(
              "relative flex h-8 w-8 items-center justify-center rounded-md text-[13px] font-medium tabular transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
              s === "answered"
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              isCurrent && "ring-2 ring-ring ring-offset-2",
            )}
          >
            {n}
            {s === "flagged" && (
              <span
                aria-hidden="true"
                className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-warning"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
