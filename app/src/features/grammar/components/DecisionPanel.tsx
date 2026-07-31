/**
 * "When do I use this rather than that" — the owner's central ask, on screen.
 *
 * It is a panel and not a paragraph because the five authored parts (DESIGN §2.4)
 * do five different jobs and a learner needs to be able to find one of them
 * again in six weeks:
 *
 *   1. **the question** — one line, the thing to ask yourself before you choose;
 *   2. **the fork** — each answer to that question, and what it selects;
 *   3. **the minimal pair** — two sentences, one difference, both meanings spelled out;
 *   4. **the wrong-choice note** — what the other form *would have said* here;
 *   5. **the edge case** — the exception, named once, then explicitly set aside.
 *
 * The minimal pair renders as two columns rather than two paragraphs because the
 * claim being made is that the sentences are identical apart from one span, and
 * a reader can only check that claim if the sentences are aligned.
 */

import { ArrowRight, Scale } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Contrast } from "../types";
import { Cue, PairGrid } from "./primitives";

export interface DecisionPanelProps {
  contrast: Contrast;
  /** Rendered top-right — normally the "open the contrast board" link. */
  action?: React.ReactNode;
  className?: string;
}

export function DecisionPanel({ contrast, action, className }: DecisionPanelProps) {
  const pair = contrast.minimal_pair;

  return (
    <section
      className={cn(
        "rounded-xl border-2 border-primary/40 bg-primary/8 p-5 ring-1 ring-primary/10",
        className,
      )}
      aria-labelledby="grammar-decision"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-primary">
            <Scale className="h-3.5 w-3.5" aria-hidden="true" />
            The decision
          </p>
          <h2 id="grammar-decision" className="mt-1 text-lg font-semibold leading-snug text-foreground">
            {contrast.question}
          </h2>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {/* the fork */}
      {contrast.fork && contrast.fork.length > 0 && (
        <ul className="mt-4 space-y-2">
          {contrast.fork.map((branch, i) => (
            <li
              key={i}
              className="flex flex-col gap-1 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:gap-3"
            >
              <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-foreground">
                {branch.answer}
              </span>
              <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
              <span className="shrink-0">
                <Badge tone="primary">{branch.selects}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* the minimal pair, aligned so the one difference is checkable */}
      {pair && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Same situation, one difference
            {pair.only_difference && (
              <span className="ml-2 rounded bg-warning/20 px-1.5 py-0.5 font-mono text-[11px] normal-case tracking-normal text-foreground">
                {pair.only_difference}
              </span>
            )}
          </p>
          <PairGrid>
            {[pair.a, pair.b].map((side, i) => (
              <div key={i} className="rounded-lg border border-border bg-background p-3">
                <p className="text-[14px] font-medium leading-relaxed text-foreground">{side.text}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{side.means}</p>
              </div>
            ))}
          </PairGrid>
        </div>
      )}

      {/* what the other one would have said */}
      {contrast.wrong_choice_note && (
        <p className="mt-4 rounded-lg bg-background/70 px-3 py-2 text-[13px] leading-relaxed text-foreground">
          {contrast.wrong_choice_note}
        </p>
      )}

      {contrast.stronger_test && (
        <p className="mt-3 text-[13px] leading-relaxed text-foreground">
          <span className="font-medium">A test that always works: </span>
          {contrast.stronger_test}
        </p>
      )}

      {contrast.edge_case?.text && (
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-medium">The exception, once: </span>
          {contrast.edge_case.text}
        </p>
      )}
    </section>
  );
}

/**
 * The three worked pairs, with the span that decides each one highlighted.
 * These are what the contrast board is built from, and they are the screen a
 * learner returns to after getting it wrong in a real essay (F6).
 */
export function WorkedPairs({
  pairs,
  className,
}: {
  pairs: NonNullable<Contrast["worked_pairs"]>;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {pairs.map((pair, i) => (
        <div key={i} className="rounded-lg border border-border bg-background p-3">
          <PairGrid>
            <p className="text-[14px] leading-relaxed text-foreground">
              <Cue text={pair.a} cue={pair.deciding_span_a} />
            </p>
            <p className="text-[14px] leading-relaxed text-foreground">
              <Cue text={pair.b} cue={pair.deciding_span_b} />
            </p>
          </PairGrid>
          {pair.gloss && (
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{pair.gloss}</p>
          )}
        </div>
      ))}
    </div>
  );
}
