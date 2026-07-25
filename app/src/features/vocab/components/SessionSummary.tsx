import { Flame, RotateCcw } from "lucide-react";
import { Badge, Button, Card, CardContent } from "@/components/ui";
import { formatDuration, pluralize } from "@/lib/format";
import { cn } from "@/lib/cn";
import { EXERCISE_META, RATINGS } from "../labels";
import type { ReviewOutcome } from "../store";
import type { QueueCounts } from "../types";

export interface SessionSummaryProps {
  outcomes: ReviewOutcome[];
  /** How many cards the session was built with. */
  planned: number;
  counts: QueueCounts | null;
  streak: number;
  elapsedMs: number;
  onReviewMore: () => void;
  onDone: () => void;
  starting?: boolean;
}

/** End-of-session debrief: what was rated, how it went, when it comes back. */
export function SessionSummary({
  outcomes,
  planned,
  counts,
  streak,
  elapsedMs,
  onReviewMore,
  onDone,
  starting = false,
}: SessionSummaryProps) {
  const graded = outcomes.filter((o) => o.correct !== null);
  const correct = graded.filter((o) => o.correct === true).length;
  const accuracy = graded.length > 0 ? Math.round((100 * correct) / graded.length) : null;
  const stoppedEarly = outcomes.length < planned;
  const remaining = counts?.due_today ?? 0;

  const byRating = RATINGS.map((rating) => ({
    ...rating,
    count: outcomes.filter((o) => o.rating === rating.value).length,
  }));

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">
              {outcomes.length === 0
                ? "Nothing was rated"
                : stoppedEarly
                  ? `Stopped after ${outcomes.length} of ${planned} cards`
                  : `${pluralize(outcomes.length, "card")} reviewed`}
            </h2>
            <p className="text-[13px] text-muted-foreground">
              {outcomes.length === 0
                ? "Every rating is saved the moment you press it, so nothing was lost."
                : "Each rating is already saved — the schedule below is live."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Time" value={formatDuration(elapsedMs / 1000)} />
            <Stat
              label="Accuracy"
              value={accuracy === null ? "—" : `${accuracy}%`}
              hint={
                graded.length === 0
                  ? "no auto-checked cards"
                  : `${correct}/${graded.length} checked`
              }
            />
            <Stat label="Due left today" value={String(remaining)} />
            <Stat
              label="Streak"
              value={`${streak}`}
              hint={streak === 1 ? "day" : "days"}
              icon={<Flame className="h-3.5 w-3.5 text-warning" aria-hidden="true" />}
            />
          </div>

          {outcomes.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {byRating.map((rating) => (
                <div
                  key={rating.key}
                  className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-center"
                >
                  <p className="tabular text-lg font-semibold">{rating.count}</p>
                  <p className="text-[11px] text-muted-foreground">{rating.label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {remaining > 0 && (
              <Button onClick={onReviewMore} loading={starting}>
                <RotateCcw className="h-4 w-4" />
                Review {remaining} more
              </Button>
            )}
            <Button variant={remaining > 0 ? "outline" : "primary"} onClick={onDone}>
              Back to vocabulary
            </Button>
          </div>
        </CardContent>
      </Card>

      {outcomes.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-left text-[13px]">
              <caption className="sr-only">Words reviewed in this session</caption>
              <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Word
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Exercise
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Rated
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Comes back
                  </th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map((outcome, i) => {
                  const rating = RATINGS[outcome.rating - 1];
                  return (
                    <tr key={`${outcome.entryId}-${i}`} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-medium">{outcome.headword}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {EXERCISE_META[outcome.exercise]?.label ?? outcome.exercise}
                        {outcome.correct === false && (
                          <span className="ml-2 text-destructive">missed</span>
                        )}
                        {outcome.correct === true && (
                          <span className="ml-2 text-success">correct</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          tone={
                            outcome.rating === 1
                              ? "destructive"
                              : outcome.rating === 2
                                ? "warning"
                                : outcome.rating === 4
                                  ? "success"
                                  : "primary"
                          }
                        >
                          {rating?.label ?? outcome.rating}
                        </Badge>
                      </td>
                      <td className="tabular px-4 py-2 text-right text-muted-foreground">
                        {outcome.nextLabel}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-muted/40 px-3 py-2.5", className)}>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="tabular mt-0.5 text-lg font-semibold">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
