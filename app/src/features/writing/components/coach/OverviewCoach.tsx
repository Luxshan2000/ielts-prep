/**
 * The Overview Builder — Academic Task 1 only, and the reason this tab sits second.
 *
 * The overview is named explicitly at three consecutive bands and is what separates
 * them: a mechanical recount of detail, an overview with the information sensibly
 * selected, and a *clear* overview of the main trends, differences or stages. It is
 * the single biggest lever in the task, so it gets its own surface rather than a
 * sentence in a note.
 *
 * The screen has two halves and the split is the pedagogy:
 *
 *  - **Before the attempt** — how an overview is built, the tense this chart's dates
 *    force, how many figures the answer has room for, and two empty boxes with one
 *    rule: no digits. The Continue affordance greys while a box contains one, which
 *    makes the figure-free rule structural instead of advisory.
 *  - **After the attempt** — the learner's two statements beside the authored ones,
 *    the model overview, the plausible weak overview labelled with what is wrong
 *    with it, and the grouping the body paragraphs should have used.
 *
 * Nothing in the second half is reachable before a submitted attempt. Handing over
 * two ready-made whole-chart sentences beforehand does not teach selection — it
 * removes it.
 */

import { useMemo } from "react";
import { Ban, Check, Eye, Hash, Layers, Lock } from "lucide-react";
import { Badge, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { overviewFailure } from "./labels";
import { Callout, SectionHead } from "./primitives";
import type { OverviewBrief } from "./types";

const DIGIT = /[0-9]/;

export interface OverviewCoachProps {
  brief: OverviewBrief;
  /** The learner's own two statements, kept by the coach store. */
  draft: [string, string];
  onDraftChange: (index: 0 | 1, value: string) => void;
  attempted: boolean;
  onWrite?: () => void;
}

export function OverviewCoach({
  brief,
  draft,
  onDraftChange,
  attempted,
  onWrite,
}: OverviewCoachProps) {
  const withDigits = useMemo(() => draft.map((line) => DIGIT.test(line)), [draft]);
  const bothWritten = draft.every((line) => line.trim().length >= 12);
  const clean = bothWritten && !withDigits.some(Boolean);

  return (
    <div className="space-y-6">
      <Callout tone="teach" title="Why this tab exists">
        One paragraph decides more of your Task Achievement score than the rest of the answer put
        together. It has to be true of the whole visual, it has to be separate from the detail,
        and below band 7 it should carry no figures at all, because an overview with numbers in
        it decays into another data sentence.
      </Callout>

      {/* ------------------------------------------------- the fixed decisions --- */}
      <div className="grid gap-2 sm:grid-cols-2">
        {brief.tense && (
          <div className="rounded-xl border border-border bg-card p-3.5">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Tense
            </p>
            <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{brief.tense}</p>
          </div>
        )}
        {brief.figure_budget && (
          <div className="rounded-xl border border-border bg-card p-3.5">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <Hash className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Figures the whole answer has room for
            </p>
            <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
              <span className="tabular font-semibold text-foreground">
                {brief.figure_budget.min} to {brief.figure_budget.max}
              </span>{" "}
              across the body, and none of them in the overview. Every extra figure costs you a
              comparison, because a comparative claim is worth two bare data sentences.
            </p>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------- the two boxes --- */}
      <section className="space-y-3">
        <SectionHead
          title="Two things that are true of the whole chart"
          hint="Write them before you open the editor. If someone who never saw this chart could repeat your sentence and still be right, it is an overview."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {([0, 1] as const).map((index) => (
            <div key={index} className="space-y-1.5">
              <label
                htmlFor={`overview-box-${index}`}
                className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Statement {index + 1}
              </label>
              <Textarea
                id={`overview-box-${index}`}
                rows={3}
                value={draft[index]}
                onChange={(event) => onDraftChange(index, event.target.value)}
                aria-invalid={withDigits[index] || undefined}
                aria-describedby={withDigits[index] ? `overview-box-${index}-error` : undefined}
                placeholder={
                  index === 0
                    ? "The biggest movement, in words only…"
                    : "What stayed the same, in words only…"
                }
              />
              {withDigits[index] && (
                <p
                  id={`overview-box-${index}-error`}
                  role="alert"
                  className="flex items-center gap-1.5 text-[12px] text-warning"
                >
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                  There is a digit in there. An overview with a figure in it is a data sentence.
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px]",
              clean ? "bg-success/12 text-success" : "bg-muted text-muted-foreground",
            )}
            role="status"
          >
            {clean ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Two figure-free statements. That is your second paragraph.
              </>
            ) : (
              "Both boxes, no digits."
            )}
          </span>
          {onWrite && (
            <button
              type="button"
              onClick={onWrite}
              disabled={!clean}
              className={cn(
                "rounded-md px-2 py-1 text-[13px] font-medium underline-offset-4",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                clean
                  ? "text-primary hover:underline"
                  : "cursor-not-allowed text-muted-foreground/60",
              )}
            >
              Open the editor and write it →
            </button>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------ after the fact --- */}
      {!attempted ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-border p-4">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-[13px] font-semibold text-foreground">
              The two authored statements, the model overview and the grouping open after you
              have written this task
            </p>
            <p className="text-[13px] leading-6 text-muted-foreground">
              Selecting what matters is the skill being assessed. Handing you two finished
              whole-chart sentences first does not teach it. It does it for you.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {(brief.must_capture?.length ?? 0) > 0 && (
            <section className="space-y-3">
              <SectionHead
                title="Yours, beside the two this chart needed"
                hint="Not a score. Two overviews can both be right. Read them for what they cover, not for wording."
              />
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-2 rounded-xl border border-border bg-card p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    What you wrote
                  </p>
                  {draft.some((line) => line.trim() !== "") ? (
                    <ul className="space-y-2">
                      {draft
                        .filter((line) => line.trim() !== "")
                        .map((line, i) => (
                          <li key={i} className="text-[13px] leading-6 text-foreground">
                            {line}
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] leading-6 text-muted-foreground">
                      You went straight to the editor this time. Next chart, spend the two
                      minutes here first. It is the cheapest band in the task.
                    </p>
                  )}
                </div>
                <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/8 p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    What the chart needed
                  </p>
                  <ul className="space-y-2">
                    {(brief.must_capture ?? []).map((line, i) => (
                      <li key={i} className="text-[13px] leading-6 text-foreground">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {brief.model_overview && (
            <section className="space-y-2">
              <SectionHead title="One way to write it" />
              <p className="rounded-xl border border-border bg-card p-4 text-[14px] leading-7 text-foreground">
                {brief.model_overview}
              </p>
              <p className="text-[12px] leading-5 text-muted-foreground">
                Count the digits in that paragraph. There are none, and it still says more than
                any figure would.
              </p>
            </section>
          )}

          {brief.weak_overview && (
            <section className="space-y-2">
              <SectionHead title="And the one most people write" />
              <div className="rounded-xl border border-border bg-muted/50 p-4">
                <p className="text-[14px] leading-7 text-foreground">
                  “{brief.weak_overview.text}”
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone="warning">{overviewFailure(brief.weak_overview.failure)}</Badge>
                  <span className="text-[12px] text-muted-foreground">
                    Fluent, accurate, and it is not an overview.
                  </span>
                </p>
              </div>
            </section>
          )}

          {brief.group_as && (
            <section className="space-y-2">
              <SectionHead
                title="How the two body paragraphs should have been grouped"
                hint="A quick self-test: if your sentences run in the same order as the labels on the visual, you listed rather than grouped."
              />
              <div className="grid gap-2 sm:grid-cols-2">
                {(["body1", "body2"] as const).map((key, i) => (
                  <div key={key} className="rounded-xl border border-border bg-card p-3.5">
                    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                      Body {i + 1}
                    </p>
                    <p className="mt-1 text-[13px] leading-6 text-foreground">
                      {brief.group_as?.[key]}
                    </p>
                  </div>
                ))}
              </div>
              {brief.group_as.why && (
                <Callout tone="teach" title="Why this grouping beats the obvious one">
                  {brief.group_as.why}
                </Callout>
              )}
            </section>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {(brief.must_report?.length ?? 0) > 0 && (
              <section className="space-y-2">
                <SectionHead title="Features worth reporting" />
                <ul className="space-y-1.5">
                  {(brief.must_report ?? []).map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[13px] leading-6 text-foreground"
                    >
                      <Eye
                        className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {(brief.omit?.length ?? 0) > 0 && (
              <section className="space-y-2">
                <SectionHead
                  title="And what to leave out on purpose"
                  hint="Selection means throwing things away. If nothing here was cut, the answer is a list."
                />
                <ul className="space-y-1.5">
                  {(brief.omit ?? []).map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[13px] leading-6 text-muted-foreground"
                    >
                      <Ban className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {(brief.phases?.length ?? 0) > 0 && (
            <section className="space-y-2">
              <SectionHead
                title="The stages this process groups into"
                hint="These names are deliberately not on the diagram: naming the stages yourself is the band-7 overview on a process."
              />
              <ol className="grid gap-2 sm:grid-cols-2">
                {(brief.phases ?? []).map((phase, i) => (
                  <li key={i} className="rounded-xl border border-border bg-card p-3.5">
                    <p className="text-[13px] font-semibold text-foreground">
                      {i + 1}. {phase.name}
                    </p>
                    <p className="mt-0.5 text-[12px] tabular text-muted-foreground">
                      {phase.step_ids.length} step{phase.step_ids.length === 1 ? "" : "s"}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
