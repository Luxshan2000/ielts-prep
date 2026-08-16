import { cn } from "@/lib/cn";
import { RATINGS } from "../labels";
import type { IntervalPreviews } from "../types";

export interface RatingBarProps {
  /** Per-rating next-interval preview straight from `GET /api/v1/srs/session`. */
  intervals: IntervalPreviews | null;
  onRate: (rating: number) => void;
  /** Pre-highlighted button after an auto-checked answer (still learner-final). */
  suggested?: number | null;
  disabled?: boolean;
  busyRating?: number | null;
}

/**
 * The four FSRS ratings. Each button carries the interval it would schedule, so
 * the learner is choosing a *date*, not guessing at a word (08 §4.3).
 */
export function RatingBar({
  intervals,
  onRate,
  suggested = null,
  disabled = false,
  busyRating = null,
}: RatingBarProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Rate this card">
      {RATINGS.map((rating) => {
        const preview = intervals?.[rating.key];
        const isSuggested = suggested === rating.value;
        return (
          <button
            key={rating.key}
            type="button"
            data-suggested={isSuggested}
            disabled={disabled}
            onClick={() => onRate(rating.value)}
            aria-keyshortcuts={rating.shortcut}
            aria-label={`${rating.label}, next in ${preview?.label ?? "unknown"} (key ${rating.shortcut})`}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-xl border bg-card px-3 py-2.5 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
              "disabled:pointer-events-none disabled:opacity-50",
              rating.className,
              isSuggested && "ring-2 ring-offset-1",
              busyRating === rating.value && "animate-pulse",
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              {rating.label}
              <kbd className="rounded border border-border px-1 text-[10px] font-normal opacity-70">
                {rating.shortcut}
              </kbd>
            </span>
            <span className="tabular text-[11px] text-muted-foreground">
              {preview?.label ?? "-"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
