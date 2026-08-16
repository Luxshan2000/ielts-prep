/**
 * Part by part: what you said, what the examiner quoted, and how it was delivered.
 *
 * The one thing this does not do is print a band per part, because there isn't one —
 * the sitting is marked as a single performance (04 §6.4). What it can honestly show
 * is where the examiner's own evidence landed, and the copy says so out loud rather
 * than letting three side-by-side cards imply three side-by-side scores.
 *
 * When the parts cannot be separated — too few quotes, or too little daylight between
 * them — the strongest/weakest labels are simply withheld (`analysis.ts::separable`).
 * A confident-looking "your weakest part was Part 3" drawn from two quotes would send
 * a learner off to fix the wrong thing for a week.
 */

import { ArrowDownRight, ArrowUpRight, Quote } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { CRITERIA } from "../phases";
import type { CriterionKey, FluencyMetrics } from "../../store";
import type { PartQuote, PartSummary, SittingAnalysis } from "./analysis";

function criterionName(key: CriterionKey | null): string | null {
  if (!key) return null;
  return CRITERIA.find((c) => c.key === key)?.short ?? null;
}

/** The two or three delivery numbers that are readable without a glossary. */
function deliveryChips(metrics: FluencyMetrics | null): { label: string; value: string }[] {
  if (!metrics) return [];
  const chips: { label: string; value: string }[] = [];
  if (typeof metrics.wpm === "number") {
    chips.push({ label: "words / min", value: String(Math.round(metrics.wpm)) });
  }
  if (typeof metrics.fillers_per_min === "number") {
    chips.push({ label: "fillers / min", value: metrics.fillers_per_min.toFixed(1) });
  }
  if (typeof metrics.mean_length_of_run_words === "number") {
    chips.push({
      label: "words between pauses",
      value: String(Math.round(metrics.mean_length_of_run_words)),
    });
  }
  return chips;
}

function QuoteRow({ quote }: { quote: PartQuote }) {
  const criterion = criterionName(quote.criterion);
  return (
    <li
      className={cn(
        "rounded-lg border-l-2 py-1.5 pl-3",
        quote.kind === "strength" ? "border-l-success/60" : "border-l-destructive/60",
      )}
    >
      <p className="text-[13px] leading-6 text-foreground">“{quote.text}”</p>
      {(quote.issue || criterion) && (
        <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
          {criterion && <span className="font-medium">{criterion}. </span>}
          {quote.issue}
          {quote.better && <span className="text-success"> Better: {quote.better}</span>}
        </p>
      )}
    </li>
  );
}

function PartCard({
  part,
  strongest,
  weakest,
}: {
  part: PartSummary;
  strongest: boolean;
  weakest: boolean;
}) {
  const chips = deliveryChips(part.metrics);
  const quotes = [...part.strengths.slice(0, 2), ...part.issues.slice(0, 2)];

  return (
    <div
      className={cn(
        "flex h-full flex-col gap-3 rounded-xl border bg-card p-4",
        strongest ? "border-success/40" : weakest ? "border-warning/40" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">{part.label}</p>
        {strongest && (
          <Badge tone="success">
            <ArrowUpRight className="mr-1 inline h-3 w-3" aria-hidden="true" />
            Strongest
          </Badge>
        )}
        {weakest && (
          <Badge tone="warning">
            <ArrowDownRight className="mr-1 inline h-3 w-3" aria-hidden="true" />
            Weakest
          </Badge>
        )}
      </div>

      {part.reached ? (
        <>
          <p className="text-[12px] text-muted-foreground">
            <span className="tabular">{part.words}</span> words across{" "}
            <span className="tabular">{part.turns}</span> answer{part.turns === 1 ? "" : "s"} ·{" "}
            <span className="tabular">{part.strengths.length}</span> quoted well ·{" "}
            <span className="tabular">{part.issues.length}</span> corrected
          </p>

          {chips.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {chips.map((chip) => (
                <li key={chip.label} className="text-[12px] text-muted-foreground">
                  <span className="tabular font-semibold text-foreground">{chip.value}</span>{" "}
                  {chip.label}
                </li>
              ))}
            </ul>
          )}

          {quotes.length > 0 ? (
            <ul className="space-y-2">
              {quotes.map((quote, i) => (
                <QuoteRow key={`${quote.kind}-${i}`} quote={quote} />
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              The examiner quoted nothing from this part, in either direction.
            </p>
          )}
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          You didn't reach this part, so there is nothing to report on it.
        </p>
      )}
    </div>
  );
}

export interface PartBreakdownProps {
  analysis: SittingAnalysis;
  className?: string;
}

export function PartBreakdown({ analysis, className }: PartBreakdownProps) {
  if (!analysis.attributed) {
    return (
      <p className={cn("text-[13px] leading-6 text-muted-foreground", className)}>
        This sitting's transcript doesn't record which part each answer came from, so it can't be
        broken down by part. The band and the evidence below still cover the whole test.
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid gap-3 lg:grid-cols-3">
        {analysis.parts.map((part) => (
          <PartCard
            key={part.part}
            part={part}
            strongest={analysis.strongest?.part === part.part}
            weakest={analysis.weakest?.part === part.part}
          />
        ))}
      </div>

      <p className="text-[12px] leading-6 text-muted-foreground">
        {analysis.strongest || analysis.weakest
          ? "Strongest and weakest describe where the examiner's evidence and your delivery metrics fell, not a band per part. The test is marked once, as a whole."
          : "The three parts were too close, or produced too little quoted evidence, to rank honestly. No part is called out."}
      </p>

      {analysis.unplaced.length > 0 && (
        <details className="rounded-xl border border-border bg-card p-3.5">
          <summary className="cursor-pointer text-[13px] font-medium">
            <Quote className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {analysis.unplaced.length} more quote{analysis.unplaced.length === 1 ? "" : "s"} that
            couldn't be pinned to a part
          </summary>
          <ul className="mt-3 space-y-2">
            {analysis.unplaced.map((quote, i) => (
              <QuoteRow key={i} quote={quote} />
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-muted-foreground">
            These are usually paraphrases rather than things you said word for word, so they
            couldn't be matched back to a turn.
          </p>
        </details>
      )}
    </div>
  );
}
