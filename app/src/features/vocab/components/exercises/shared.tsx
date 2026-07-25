/** Shared contract + small pieces for the six review exercise renderers. */

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui";
import type { QueueItem } from "../../types";

export interface CommitResult {
  /** `null` for self-rated exercises — nothing was auto-checked. */
  correct: boolean | null;
  /** Pre-highlighted rating, or `null` to leave the choice completely open. */
  suggestedRating: number | null;
  /** One line shown above the rating buttons. */
  detail?: string;
}

export interface ExerciseBodyProps {
  item: QueueItem;
  /** True once the answer is on screen; the rating buttons are live. */
  revealed: boolean;
  /** Commit the learner's answer. Called with no result for a bare reveal. */
  onCommit: (result?: CommitResult) => void;
  /** Focus target request — the session focuses the first input on each card. */
  autoFocus?: boolean;
}

/** Renders the `____` runs a cloze/collocation gap uses as a visible blank. */
export function GappedText({
  text,
  filled,
  className,
}: {
  text: string;
  /** Word to drop into the blanks once the answer is shown. */
  filled?: string | null;
  className?: string;
}) {
  const parts = text.split(/(_{3,})/g);
  return (
    <span className={cn("leading-relaxed", className)}>
      {parts.map((part, i) =>
        /^_{3,}$/.test(part) ? (
          filled ? (
            <strong key={i} className="font-semibold text-primary underline decoration-primary/40">
              {filled}
            </strong>
          ) : (
            <span
              key={i}
              className="mx-0.5 inline-block min-w-[4.5rem] border-b-2 border-dashed border-primary/60 align-baseline"
              aria-label="blank"
            >
              &nbsp;
            </span>
          )
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

export function ChipList({ items, tone = "outline" }: { items: string[]; tone?: "outline" | "default" }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item} tone={tone} className="font-normal">
          {item}
        </Badge>
      ))}
    </div>
  );
}

export function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

/** The word / IPA / part-of-speech stack every exercise reveals eventually. */
export function Headword({
  headword,
  ipa,
  pos,
  size = "lg",
}: {
  headword: string;
  ipa?: string | null;
  pos?: string | null;
  size?: "md" | "lg";
}) {
  return (
    <div className="space-y-1">
      <p className={cn("font-semibold tracking-tight", size === "lg" ? "text-3xl" : "text-xl")}>
        {headword}
      </p>
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        {ipa && <span className="tabular">{ipa}</span>}
        {pos && <span className="italic">{pos}</span>}
      </p>
    </div>
  );
}
