/**
 * Per-criterion accordion for the report (04 §7): band, a "what does this band mean"
 * disclosure carrying the paraphrased descriptor, evidence quotes that jump to the
 * transcript, and improvements as an actionable checklist.
 *
 * Built on native <button aria-expanded> rather than a headless disclosure so the whole
 * list is arrow/tab navigable and keeps working with JS-free assistive tooling.
 */

import { useState } from "react";
import { ChevronDown, HelpCircle, Quote, Target } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatBand } from "@/lib/format";
import { CRITERIA, descriptorFor } from "./phases";
import type { CriterionKey, CriterionReport } from "../store";

export interface CriterionAccordionProps {
  criteria: Partial<Record<CriterionKey, CriterionReport>>;
  /** Quotes that failed server-side anchoring — those get no "find it" affordance. */
  unanchored: string[];
  /** Called when a learner clicks an evidence quote (scrolls the transcript). */
  onQuote?: (quote: string) => void;
  pronunciationBlind?: boolean;
  className?: string;
}

export function CriterionAccordion({
  criteria,
  unanchored,
  onQuote,
  pronunciationBlind = false,
  className,
}: CriterionAccordionProps) {
  // Lexical Resource opens first: it is where most learners can act fastest.
  const [open, setOpen] = useState<CriterionKey | null>("lr");
  const unmatched = new Set(unanchored.map((q) => q.trim()));

  return (
    <div className={cn("divide-y divide-border overflow-hidden rounded-xl border border-border", className)}>
      {CRITERIA.map(({ key, label }) => {
        const report = criteria[key];
        const expanded = open === key;
        const band = report?.band ?? null;
        const blind = key === "pron" && (pronunciationBlind || band === null);

        return (
          <div key={key}>
            <h3>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : key)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                )}
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    expanded && "rotate-180",
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
                {blind ? (
                  <Badge tone="outline">Not assessed</Badge>
                ) : (
                  <span className="tabular text-sm font-semibold">{formatBand(band)}</span>
                )}
              </button>
            </h3>

            {expanded && (
              <div className="animate-fade-in space-y-4 border-t border-border bg-muted/25 px-4 py-4">
                {blind && (
                  <p className="text-[13px] text-muted-foreground">
                    Pronunciation signals weren't available for this session, so this criterion
                    was left out of the overall band rather than guessed.
                  </p>
                )}

                <BandMeaning criterion={key} band={band} />

                {report && report.evidence.length > 0 && (
                  <section className="space-y-2">
                    <h4 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Quote className="h-3.5 w-3.5" aria-hidden="true" />
                      Evidence
                    </h4>
                    <ul className="space-y-1.5">
                      {report.evidence.map((quote, i) => {
                        const anchored = !unmatched.has(quote.trim());
                        return (
                          <li key={i}>
                            {anchored && onQuote ? (
                              <button
                                type="button"
                                onClick={() => onQuote(quote)}
                                className={cn(
                                  "w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-[13px] leading-5",
                                  "transition-colors hover:border-primary/50 hover:bg-accent",
                                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                )}
                                title="Show this in the transcript"
                              >
                                “{quote}”
                              </button>
                            ) : (
                              <p className="rounded-lg border border-border bg-card px-3 py-2 text-[13px] leading-5 text-muted-foreground">
                                “{quote}”
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                {report && report.improvements.length > 0 && (
                  <section className="space-y-2">
                    <h4 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Target className="h-3.5 w-3.5" aria-hidden="true" />
                      What to do next
                    </h4>
                    <ul className="space-y-1.5">
                      {report.improvements.map((item, i) => (
                        <li key={i} className="flex gap-2 text-[13px] leading-5">
                          <span
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                            aria-hidden="true"
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {report && report.evidence.length === 0 && report.improvements.length === 0 && (
                  <p className="text-[13px] text-muted-foreground">
                    The examiner gave a band here but no written detail.
                  </p>
                )}

                {!report && (
                  <p className="text-[13px] text-muted-foreground">
                    This criterion is missing from the report.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The "what does band N mean" disclosure — paraphrased descriptors only (04 §6.2). */
function BandMeaning({ criterion, band }: { criterion: CriterionKey; band: number | null }) {
  const [shown, setShown] = useState(false);
  const descriptor = descriptorFor(criterion, band);
  if (!descriptor) return null;

  return (
    <div className="space-y-2">
      <Button size="sm" variant="ghost" onClick={() => setShown((v) => !v)} aria-expanded={shown}>
        <HelpCircle className="h-4 w-4" />
        {shown ? "Hide" : `What does band ${Math.round(band ?? 0)} mean?`}
      </Button>
      {shown && (
        <p className="animate-fade-in rounded-lg border border-border bg-card px-3 py-2 text-[13px] leading-5 text-muted-foreground">
          {descriptor}
          <span className="mt-1.5 block text-[11px]">
            Paraphrased from the public IELTS band descriptors.
          </span>
        </p>
      )}
    </div>
  );
}
