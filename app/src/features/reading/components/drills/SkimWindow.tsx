import { useEffect, useRef, useState } from "react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DrillSet, SkimWindowPlan } from "./types";

/**
 * Phase one of a timed skim: the passage, a countdown, and then it is gone.
 *
 * The window is the drill. A learner given a passage and questions together will read the
 * passage twice, answer accurately, learn nothing about speed, and run out of time in the
 * real paper — where three passages and forty questions share sixty minutes and there is
 * no extra transfer time. Closing the text at the buzzer is what makes the questions
 * answerable only from gist, which is the skill being trained.
 *
 * `read_first` and `skip` come from the authored skim plan and are the two most useful
 * instructions there are, because "skim it" is not a procedure and "read the title and the
 * whole first paragraph, then first-and-last sentences, and do not read the figures" is.
 *
 * On a GT Section 1–2 text the plan is a `field_scan` instead, and the surface changes
 * shape entirely: a checklist of field types to hunt rather than a paragraph map. Those
 * texts have visible structure and their marks are lost to answer-form errors, not
 * location errors, so teaching a paragraph map on them wastes the learner's minutes.
 */
export function SkimWindow({
  set,
  plan,
  onDone,
}: {
  set: DrillSet;
  plan: SkimWindowPlan;
  onDone: () => void;
}) {
  const [remaining, setRemaining] = useState(plan.seconds);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (remaining <= 0) {
      doneRef.current();
      return;
    }
    const timer = window.setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);

  const isFieldScan = plan.plan_kind === "field_scan";
  const pct = plan.seconds > 0 ? Math.max(0, remaining) / plan.seconds : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">{isFieldScan ? "Field scan" : "Two-minute map"}</Badge>
              {set.passage?.gt_section && (
                <Badge tone="outline">Section {set.passage.gt_section}</Badge>
              )}
              <span className="text-[11px] text-muted-foreground tabular">
                {set.passage?.word_count ?? "-"} words
              </span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed">{plan.rule}</p>
          </div>
          <div className="shrink-0 text-right">
            <p
              className={cn(
                "text-2xl font-semibold tabular",
                remaining <= 10 ? "text-destructive" : "text-foreground",
              )}
              role="timer"
              aria-live="off"
            >
              {Math.max(0, remaining)}s
            </p>
            <Button size="sm" variant="ghost" onClick={onDone}>
              I'm done, close it
            </Button>
          </div>
        </div>

        <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full transition-[width] duration-1000 ease-linear",
              remaining <= 10 ? "bg-destructive" : "bg-primary",
            )}
            style={{ width: `${pct * 100}%` }}
          />
        </div>

        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {plan.read_first && (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Read first
              </dt>
              <dd className="text-[13px] leading-relaxed">{plan.read_first}</dd>
            </div>
          )}
          {plan.skip && (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Do not read
              </dt>
              <dd className="text-[13px] leading-relaxed">{plan.skip}</dd>
            </div>
          )}
        </dl>

        {isFieldScan && plan.fields.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {plan.fields.map((field) => (
              <li key={field}>
                <Badge tone="outline">{field}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <article className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold">{set.passage?.title}</h2>
        {(set.passage?.texts ?? []).map((block) => (
          <section key={block.id} className="space-y-2">
            {block.heading && <h3 className="text-[13px] font-semibold">{block.heading}</h3>}
            {(block.paragraphs ?? []).map((para) => (
              <div key={para.id} className="flex gap-2.5">
                <span className="w-5 shrink-0 text-[13px] font-bold tabular text-primary">
                  {para.id}
                </span>
                <p className="min-w-0 text-[13px] leading-relaxed">{para.text}</p>
              </div>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}
