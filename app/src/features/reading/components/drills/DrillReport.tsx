import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { qtypeLabel } from "../../qtypes";
import type { RunnerParams } from "./api";
import { DiagnosisChip } from "./SelfDiagnose";
import { TWO_STAGE_VERDICT, headlineFor } from "./labels";
import type { DrillReport } from "./types";

/**
 * What the set actually taught, and one thing to do next.
 *
 * Three deliberate absences:
 *
 * * **No band.** A drill is not an assessment instrument, and a band out of eight
 *   questions is a number with nothing attached to it. The server refuses to compute one.
 * * **No list of recommendations.** A results screen offering five next actions gets none
 *   of them done, so there is exactly one headline and exactly one button.
 * * **No averaging of form errors into accuracy.** An over-limit answer and a missed
 *   contradiction are two problems with two fixes; the trap breakdown keeps them apart.
 *
 * What is present is the trap breakdown — the axis that turns "TFNG 4/8" into "you lost
 * three marks to phantom contradictions" — and the self-diagnosis agreement rate, which
 * says whether the reveals are landing at all.
 */
export function DrillReportView({
  report,
  params,
  onExit,
  onRestart,
}: {
  report: DrillReport;
  params: RunnerParams;
  onExit?: () => void;
  onRestart?: (params: RunnerParams) => void;
}) {
  const worst = [...report.per_trap].sort((a, b) => b.lost - a.lost).find((t) => t.lost > 0);
  const headline = headlineFor(report);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <p className="text-2xl font-semibold tabular">
            {report.n_correct}
            <span className="text-base font-normal text-muted-foreground"> / {report.n_items}</span>
          </p>
          <Badge tone="outline">{report.kind} drill</Badge>
          {params.bounded && <Badge tone="outline">Bounded search</Badge>}
          {params.two_stage && <Badge tone="outline">Two-stage</Badge>}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed">{headline}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          No band here on purpose — a drill measures a habit, not a level.
        </p>
      </div>

      {report.two_stage && (
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-[13px] font-medium">
            {report.two_stage.stage_one_lost} of your losses were at step one.
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {report.two_stage.note}
          </p>
        </div>
      )}

      {report.per_trap.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Where the marks went
          </p>
          <ul className="mt-2 space-y-2">
            {report.per_trap.map((trap) => (
              <li key={trap.slug} className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 w-10 shrink-0 text-[13px] font-semibold tabular",
                    trap.lost > 0 ? "text-destructive" : "text-success",
                  )}
                >
                  {trap.lost}/{trap.seen}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{trap.name}</p>
                  <p className="text-[12px] leading-relaxed text-muted-foreground">{trap.what}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.self_diagnosis.compared > 0 && (
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-[13px] font-medium">
            You named the trap correctly on {report.self_diagnosis.agreed} of{" "}
            {report.self_diagnosis.compared}.
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {report.self_diagnosis.note}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <p className="border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Item by item
        </p>
        <ul className="divide-y divide-border">
          {report.results.map((result) => (
            <li key={result.item_id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <Badge tone={result.correct ? "success" : "destructive"}>
                {result.correct ? "✓" : "✗"}
              </Badge>
              <span className="text-[12px] text-muted-foreground">
                {qtypeLabel(result.qtype)}
                {result.number != null ? ` · Q${result.number}` : ""}
              </span>
              {result.reveal.key && (
                <span className="text-[12px] tabular">key: {result.reveal.key}</span>
              )}
              {result.two_stage?.diagnosis && (
                <Badge tone={TWO_STAGE_VERDICT[result.two_stage.diagnosis].tone}>
                  {TWO_STAGE_VERDICT[result.two_stage.diagnosis].title}
                </Badge>
              )}
              {result.self_diagnosis.comparable && (
                <DiagnosisChip agreed={result.self_diagnosis.agreed} />
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        {onRestart && worst && worst.slug !== params.trap && (
          <Button onClick={() => onRestart({ ...params, kind: "trap", trap: worst.slug })}>
            Drill {worst.name.toLowerCase()} next
          </Button>
        )}
        {onRestart && (!worst || worst.slug === params.trap) && (
          <Button onClick={() => onRestart(params)}>Another set</Button>
        )}
        {onExit && (
          <Button variant="ghost" onClick={onExit}>
            Back to drills
          </Button>
        )}
      </div>
    </div>
  );
}
