import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { BUCKET_SHORT, BUCKET_TONE, KIND_LABEL, modeLabel } from "./labels";
import type { DrillReport } from "./types";

/**
 * The end of a set — one sentence, then the evidence for it.
 *
 * **There is no band, on purpose.** A listening band is five raw marks wide, and a number
 * produced from six fragments of one recording would be noise wearing a decimal point. What
 * a learner can act on is the *class* of what they lost, so that is the headline and the
 * accuracy figure is deliberately secondary.
 *
 * For dictation the important pair is `heard` against `exact`: the gap between them is
 * spelling, it is the entire difference between two bands for a lot of candidates, and it is
 * fixed by looking at words rather than by listening to more English.
 */
export function DrillReportView({
  report,
  onAgain,
  onExit,
}: {
  report: DrillReport;
  onAgain?: () => void;
  onExit?: () => void;
}) {
  const summary = report.summary;
  const mode = modeLabel(report.mode);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{KIND_LABEL[report.kind]}</Badge>
          {mode && <Badge tone="outline">{mode}</Badge>}
          <Badge tone="outline">
            Part {report.script.part} · {report.script.title}
          </Badge>
        </div>
        <p className="mt-3 text-[15px] font-semibold leading-relaxed">{summary.headline}</p>

        {report.kind === "dictation" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat
              label="Words heard"
              value={`${summary.words_heard ?? 0} / ${summary.words_total ?? 0}`}
              note="Counting the ones you spelled wrongly — because you heard those."
            />
            <Stat
              label="Words exactly right"
              value={`${summary.words_exact ?? 0} / ${summary.words_total ?? 0}`}
              note="What the same line would have scored on an answer sheet."
              tone={
                (summary.spelling_only ?? 0) > 0 ? "warn" : undefined
              }
            />
            <Stat
              label="Lost to spelling alone"
              value={String(summary.spelling_only ?? 0)}
              note="Heard correctly, written wrongly. Not a listening problem."
              tone={(summary.spelling_only ?? 0) > 0 ? "warn" : undefined}
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Stat
              label="Right"
              value={`${report.n_correct} / ${report.n_items}`}
              note="No band is shown. Six items is not an assessment."
            />
            {report.kind === "numbers" && (
              <Stat
                label="Heard, spelled wrongly"
                value={String(summary.near_miss_spelling ?? 0)}
                note="Each of these was a mark you had and did not keep."
                tone={(summary.near_miss_spelling ?? 0) > 0 ? "warn" : undefined}
              />
            )}
            {report.kind === "signpost" && summary.median_offset_ms != null && (
              <Stat
                label="Typical press"
                value={`${(summary.median_offset_ms / 1000).toFixed(1)}s`}
                note="Relative to the moment the answer actually began. Negative is early, which is good."
              />
            )}
            {report.kind === "prediction" && (
              <Stat
                label="Right family, wrong shape"
                value={String(summary.same_family ?? 0)}
                note="You read the frame and then did not use what it said."
                tone={(summary.same_family ?? 0) > 0 ? "warn" : undefined}
              />
            )}
          </div>
        )}
      </div>

      {(summary.buckets?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] font-semibold">What you actually lost</p>
          <div className="flex flex-wrap gap-1.5">
            {summary.buckets?.map((bucket) => (
              <Badge
                key={bucket.bucket}
                tone={BUCKET_TONE[bucket.bucket] === "warn" ? "warning" : "destructive"}
              >
                {bucket.count} {BUCKET_SHORT[bucket.bucket] ?? bucket.bucket}
              </Badge>
            ))}
          </div>
          <div className="space-y-2">
            {summary.buckets?.map((bucket) => (
              <div key={bucket.bucket} className="rounded-lg border border-border p-3">
                <p className="text-[13px] font-medium">
                  {bucket.name}{" "}
                  <span className="font-normal text-muted-foreground">×{bucket.count}</span>
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">{bucket.what}</p>
                <p className="mt-1 text-[13px]">{bucket.next}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {onAgain && (
          <Button onClick={onAgain}>Another set from this part</Button>
        )}
        {onExit && (
          <Button variant="ghost" onClick={onExit}>
            Choose a different drill
          </Button>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[12px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[20px] font-semibold tabular-nums",
          tone === "warn" && "text-warning",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{note}</p>
    </div>
  );
}
