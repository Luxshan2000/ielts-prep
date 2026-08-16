import { useMemo } from "react";
import { Clock, Target, Timer } from "lucide-react";
import {
  BandScore,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { qtypeLabel } from "../qtypes";
import type { ReviewRecord } from "../types";

export interface ResultsSummaryProps {
  record: ReviewRecord;
  /** `notes._time_ms` from the attempt — absent for attempts saved before it. */
  timeMs: Record<string, number>;
  onDrillType?: (qtype: string) => void;
  onJumpToQuestion?: (number: number) => void;
}

function pct(correct: number, total: number): number {
  return total > 0 ? (correct / total) * 100 : 0;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * The results header (06 §4.2/§6.1): band, raw score, per-type and per-passage
 * breakdowns, the weakest type with a drill shortcut, and time-per-question.
 */
export function ResultsSummary({
  record,
  timeMs,
  onDrillType,
  onJumpToQuestion,
}: ResultsSummaryProps) {
  const types = useMemo(
    () =>
      Object.entries(record.per_type ?? {}).sort(
        (a, b) => pct(a[1].correct, a[1].total) - pct(b[1].correct, b[1].total),
      ),
    [record.per_type],
  );

  const times = useMemo(() => {
    const rows = (record.per_question ?? [])
      .map((question) => ({
        number: question.number,
        correct: question.correct,
        ms: timeMs[String(question.number)] ?? 0,
      }))
      .filter((row) => row.ms > 0);
    const peak = rows.reduce((max, row) => Math.max(max, row.ms), 0);
    return { rows, peak, med: median(rows.map((row) => row.ms)) };
  }, [record.per_question, timeMs]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 p-5">
          {record.band !== null ? (
            <BandScore band={record.band} size="lg" label="Reading band" reveal />
          ) : (
            <div className="text-center">
              <p className="text-[24px] font-semibold tabular">
                {record.raw_score}/{record.total_questions}
              </p>
              <p className="text-[11px] text-muted-foreground">Drills are not band-scored</p>
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold tabular">
                {record.raw_score} / {record.total_questions} correct
              </span>
              {record.band_is_estimate && record.band !== null && (
                <Badge tone="outline">scaled to {record.scaled_raw_40}/40</Badge>
              )}
              {record.auto_submitted && <Badge tone="warning">Auto-submitted at zero</Badge>}
              <Badge tone="default">
                {record.format === "general_training" ? "General Training" : "Academic"}
              </Badge>
            </div>
            <Progress
              value={pct(record.raw_score, record.total_questions)}
              label="Accuracy"
              detail={`${Math.round(pct(record.raw_score, record.total_questions))}%`}
              tone={
                pct(record.raw_score, record.total_questions) >= 75
                  ? "success"
                  : pct(record.raw_score, record.total_questions) >= 50
                    ? "primary"
                    : "warning"
              }
            />
            <p className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 tabular">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {formatDuration(record.duration_s)} spent
              </span>
              {record.band !== null && <span>{record.band_disclaimer}</span>}
            </p>
          </div>
        </CardContent>
      </Card>

      {record.weakest_type && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-[13px]">
              <Target className="mr-1.5 inline h-3.5 w-3.5 text-warning" aria-hidden="true" />
              Your weakest type this attempt:{" "}
              <span className="font-semibold">{qtypeLabel(record.weakest_type.qtype)}</span>,{" "}
              <span className="tabular">
                {record.weakest_type.correct}/{record.weakest_type.total}
              </span>
            </p>
            {onDrillType && (
              <Button size="sm" onClick={() => onDrillType(record.weakest_type!.qtype)}>
                Drill it
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By question type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {types.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No per-type data for this attempt.</p>
            ) : (
              types.map(([type, stats]) => (
                <Progress
                  key={type}
                  value={pct(stats.correct, stats.total)}
                  label={qtypeLabel(type)}
                  detail={`${stats.correct}/${stats.total}`}
                  tone={
                    pct(stats.correct, stats.total) >= 75
                      ? "success"
                      : pct(stats.correct, stats.total) >= 50
                        ? "primary"
                        : "warning"
                  }
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By passage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {(record.per_passage ?? []).length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No per-passage data.</p>
            ) : (
              record.per_passage.map((passage) => (
                <Progress
                  key={passage.passage_id}
                  value={pct(passage.correct, passage.total)}
                  label={passage.title ?? passage.passage_id}
                  detail={`${passage.correct}/${passage.total}`}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <Timer className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
            Time per question
          </CardTitle>
        </CardHeader>
        <CardContent>
          {times.rows.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Time per question was not recorded for this attempt. It is captured from the moment
              you focus each question, so attempts answered without focusing a field have none.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] text-muted-foreground tabular">
                Median {formatDuration(times.med / 1000)} per question · aim for under 1:30 in a
                full test.
              </p>
              <ul className="space-y-1">
                {times.rows.map((row) => (
                  <li key={row.number} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onJumpToQuestion?.(row.number)}
                      className={cn(
                        "w-8 shrink-0 rounded text-left text-[11px] font-medium tabular",
                        "text-muted-foreground hover:text-foreground focus-visible:outline-none",
                        "focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                    >
                      Q{row.number}
                    </button>
                    <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          row.correct ? "bg-primary" : "bg-warning",
                        )}
                        style={{
                          width: `${times.peak > 0 ? Math.max(2, (row.ms / times.peak) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right text-[11px] tabular text-muted-foreground">
                      {formatDuration(row.ms / 1000)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">
                Filled bars are correct answers; amber bars are wrong ones.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
