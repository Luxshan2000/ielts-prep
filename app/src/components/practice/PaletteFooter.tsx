import type { ReactNode } from "react";
import { QuestionPalette } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { QuestionStatus } from "@/components/ui/QuestionPalette";

/**
 * The question navigator, in the one place every skill puts it.
 *
 * Reading and Listening both drew a `QuestionPalette`, and put it somewhere different:
 * Reading in a bottom strip, Listening in a 260px right-hand rail — practice and mock alike,
 * so it read as two different apps depending on which skill you opened. This is the settled
 * answer, and the bottom strip won on three counts: it is where the real computer-delivered
 * test puts it, it does not compete for width (Reading's passage/questions split needs all
 * of it), and it survives a narrow window without the rail collapsing under the content.
 *
 * `leading` is for the per-skill control that belongs beside the numbers — a passage
 * switcher, a part switcher — so the strip stays one row rather than each screen inventing
 * its own second bar.
 */
export interface PaletteFooterProps {
  /** How many numbers to draw. */
  count: number;
  /** The number the first cell stands for; palettes are windowed per passage/part. */
  startAt: number;
  current: number;
  status: Record<number, QuestionStatus>;
  onJump: (number: number) => void;
  /** Skill-specific control shown to the left of the numbers (passage or part switcher). */
  leading?: ReactNode;
  /** Actions on the right — submit, reveal, finish. */
  actions?: ReactNode;
  className?: string;
}

export function PaletteFooter({
  count,
  startAt,
  current,
  status,
  onJump,
  leading,
  actions,
  className,
}: PaletteFooterProps) {
  return (
    <footer
      className={cn(
        // `sticky bottom-0` so the navigator stays put when the strip sits inside a
        // scrolling page (PageShell scrolls its children); inside a flex column that
        // already pins it, this is a no-op.
        "sticky bottom-0 z-10 shrink-0 border-t border-border bg-background/95 px-5 py-2.5 backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        {leading}
        <QuestionPalette
          className="min-w-0 flex-1"
          count={count}
          startAt={startAt}
          current={current}
          status={status}
          onJump={onJump}
        />
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </footer>
  );
}
