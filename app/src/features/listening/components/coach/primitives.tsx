/**
 * The small pieces the listening coach needs: a chip, and the two things this
 * module needs that no other one does — a span highlighted inside its own sentence,
 * and a button that plays exactly one moment of the recording. The disclosure row,
 * the callout and the section head were needed by every coach layer, so they now
 * live in `components/ui` and are re-exported from here.
 *
 * All of them are real `<button>`s with real ARIA relationships, so Tab and
 * Enter/Space work without a single custom key handler.
 */

import { type ReactNode } from "react";
import { Play, Volume2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTimestamp } from "@/lib/format";

// ------------------------------------ disclosure, callout and section head ---

/**
 * These three now live in the shared kit — all four coach layers carried
 * byte-identical copies, and `Disclosure` in particular is an ARIA primitive that
 * must not be fixed in one room and not the others. Re-exported from here so the
 * consumer files in this feature keep importing them from `./primitives`.
 */
export { Disclosure, Callout, SectionHead, type CalloutTone } from "@/components/ui";

// -------------------------------------------------------------------------- chip ---

export type ChipTone = "neutral" | "audio" | "printed" | "warn" | "good";

const CHIP_STYLE: Record<ChipTone, string> = {
  neutral: "border-border bg-muted/60 text-muted-foreground",
  /** What the speaker said. */
  audio: "border-primary/40 bg-primary/10 text-foreground",
  /** What the page prints. */
  printed: "border-warning/40 bg-warning/10 text-foreground",
  warn: "border-destructive/40 bg-destructive/10 text-foreground",
  good: "border-success/40 bg-success/10 text-foreground",
};

export function Chip({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-block rounded-md border px-2 py-0.5 text-[12px] leading-5",
        CHIP_STYLE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ marked span ---

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * One span highlighted inside its own sentence.
 *
 * The match is a case-insensitive substring, which is exactly the discipline the
 * content lints enforce on `answer_quote`, `signal` and `paraphrase_link` — a
 * near-miss quote fails to highlight rather than highlighting the wrong thing.
 */
export function Marked({
  text,
  mark,
  tone = "audio",
  className,
}: {
  text: string;
  mark?: string | null;
  tone?: "audio" | "decoy";
  className?: string;
}) {
  const needle = (mark ?? "").trim();
  if (!needle || needle.length < 2 || !text.toLowerCase().includes(needle.toLowerCase())) {
    return <span className={className}>{text}</span>;
  }
  const pieces = text.split(new RegExp(`(${escapeRe(needle)})`, "i"));
  return (
    <span className={className}>
      {pieces.map((piece, index) =>
        index % 2 === 1 ? (
          <mark
            key={index}
            className={cn(
              "rounded px-0.5",
              tone === "decoy"
                ? "bg-warning/30 text-foreground line-through decoration-warning"
                : "bg-primary/25 text-foreground",
            )}
          >
            {piece}
          </mark>
        ) : (
          <span key={index}>{piece}</span>
        ),
      )}
    </span>
  );
}

// --------------------------------------------------------------- play a moment ---

/**
 * The single highest-value control in listening review: play exactly the three
 * seconds where the mark was won or lost, rather than scrubbing for it.
 *
 * The label always names what will be heard, because a row of unlabelled play
 * triangles is unusable with a screen reader and barely better with eyes.
 */
export function PlayMoment({
  label,
  at,
  onPlay,
  disabled,
  active = false,
  tone = "primary",
  className,
}: {
  label: string;
  /** Start offset in ms — shown as a timestamp so the control is honest. */
  at?: number | null;
  onPlay: () => void;
  disabled?: boolean;
  active?: boolean;
  tone?: "primary" | "warn";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      disabled={disabled}
      aria-label={
        typeof at === "number" ? `${label}, from ${formatTimestamp(at)}` : label
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        tone === "warn"
          ? "border-warning/50 bg-warning/10 text-foreground hover:bg-warning/20"
          : "border-primary/40 bg-primary/8 text-foreground hover:bg-primary/15",
        active && "ring-2 ring-ring",
        className,
      )}
    >
      {active ? (
        <Volume2 className="h-3.5 w-3.5 animate-pulse text-primary" aria-hidden="true" />
      ) : (
        <Play className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      )}
      {label}
      {typeof at === "number" && (
        <span className="tabular-nums text-muted-foreground">{formatTimestamp(at)}</span>
      )}
    </button>
  );
}
