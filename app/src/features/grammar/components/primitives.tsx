/**
 * The small pieces every grammar screen shares.
 *
 * Two of them carry design weight and are worth reading before they are changed.
 *
 * `StageBar` is the algorithm made visible (DESIGN §1.4, F2): six named rungs,
 * the current one lit, the cleared ones filled. A learner who can see that the
 * ladder ends will climb it; a learner shown a percentage will not.
 *
 * `Cue` highlights the exact span of a context that decides the answer. The pack
 * guarantees `decision_cue` is a literal substring of the item's context, so the
 * match is plain `indexOf` — no regex, no fuzzy matching, and a span that does
 * not match renders the text untouched rather than throwing.
 */

import type { ReactNode } from "react";
import { Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui";
import { STAGES, STAGE_ORDER, POINT_STATE_LABEL } from "../labels";
import type { PointState, Stage } from "../types";

// ------------------------------------------------------------- stage bar ----

export interface StageBarProps {
  /** The rung the card is on now. */
  stage: Stage;
  /** Rungs cleared, for the filled segments. Defaults to everything below `stage`. */
  cleared?: Stage[];
  /** Compact strips the labels — for a row on the path, not the point header. */
  compact?: boolean;
  className?: string;
}

export function StageBar({ stage, cleared, compact = false, className }: StageBarProps) {
  const done = new Set<Stage>(cleared ?? STAGE_ORDER.filter((s) => s < stage));
  return (
    <div
      className={cn("flex w-full items-end gap-1", className)}
      role="img"
      aria-label={`Stage ${stage} of 5 — ${STAGES[stage].name}`}
    >
      {STAGE_ORDER.map((s) => {
        const isDone = done.has(s) || s < stage;
        const isNow = s === stage;
        return (
          <div key={s} className="flex min-w-0 flex-1 flex-col gap-1">
            {!compact && (
              <span
                className={cn(
                  "truncate text-[10px] font-medium uppercase tracking-wide",
                  isNow ? "text-primary" : isDone ? "text-muted-foreground" : "text-muted-foreground/50",
                )}
                title={STAGES[s].asks}
              >
                {STAGES[s].name}
              </span>
            )}
            <span
              className={cn(
                "h-1.5 rounded-full transition-colors",
                isNow ? "bg-primary" : isDone ? "bg-primary/40" : "bg-muted",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}

/** The rung name as a chip — used on every practice card (F9). */
export function StageChip({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <Badge tone="primary" className={cn("uppercase tracking-wide", className)}>
      {STAGES[stage].name}
    </Badge>
  );
}

// ----------------------------------------------------------- point states ----

const STATE_TONE: Record<PointState, string> = {
  locked: "bg-muted text-muted-foreground",
  next: "bg-primary/12 text-primary",
  in_progress: "bg-warning/15 text-warning",
  practised: "bg-success/12 text-success",
  mastered: "bg-success text-background",
};

export function StateBadge({ state, className }: { state: PointState; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium leading-none",
        STATE_TONE[state],
        className,
      )}
    >
      {state === "locked" && <Lock className="h-3 w-3" aria-hidden="true" />}
      {state === "mastered" && <Sparkles className="h-3 w-3" aria-hidden="true" />}
      {POINT_STATE_LABEL[state]}
    </span>
  );
}

// ----------------------------------------------------------------- cue ------

export interface CueProps {
  text: string;
  /** The exact substring to highlight, or null to render the text plain. */
  cue?: string | null;
  /** Highlight even before the reveal — used by the "signal" beat. */
  active?: boolean;
  className?: string;
}

/**
 * A context with its deciding span marked. The span is authored as a literal
 * substring (DESIGN §2.7), so a miss means the item is wrong, not the renderer —
 * and the honest response to that is to show the sentence and say nothing.
 */
export function Cue({ text, cue, active = true, className }: CueProps) {
  if (!cue || !active) return <span className={className}>{text}</span>;
  const at = text.indexOf(cue);
  if (at < 0) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {text.slice(0, at)}
      <mark className="rounded bg-warning/25 px-0.5 text-foreground">{cue}</mark>
      {text.slice(at + cue.length)}
    </span>
  );
}

// -------------------------------------------------------------- sections ----

export interface SectionProps {
  title: string;
  /** One line under the heading. Concrete — what this section is for. */
  hint?: string;
  /** A tone-setting accent down the left edge, for the section that matters most. */
  emphasis?: boolean;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

export function Section({ title, hint, emphasis, action, children, className, id }: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-xl border bg-card p-5",
        emphasis ? "border-primary/40 shadow-sm ring-1 ring-primary/10" : "border-border",
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={cn("text-sm font-semibold", emphasis && "text-primary")}>{title}</h2>
          {hint && <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** A learner-facing sentence in a quiet block — worked examples, models, contexts. */
export function Example({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "wrong";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "rounded-lg px-3 py-2 text-[13px] leading-relaxed",
        tone === "neutral" && "bg-muted text-foreground",
        tone === "good" && "bg-success/12 text-foreground",
        tone === "wrong" && "bg-destructive/8 text-muted-foreground line-through decoration-destructive/60",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Two sentences side by side with one difference between them. */
export function PairGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-3 sm:grid-cols-2", className)}>{children}</div>;
}
