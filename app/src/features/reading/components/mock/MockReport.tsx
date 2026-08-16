/**
 * `/reading/mock/report/:attemptId` — the loop from testing back into learning.
 *
 * **The report leads with pacing, then the raw score, then the band.** That ordering
 * is the argument. Minutes are the thing a learner can change tomorrow; the band is
 * a lagging summary of everything else, and the middle of the Academic table is four
 * marks wide, so a learner improving inside it would see the band sit still and
 * conclude nothing had happened.
 *
 * It ends on the coach for the three passages just sat, whose worked solutions are
 * unlocked *because* the paper was sat.
 */

import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Clock, Info, Timer } from "lucide-react";
import {
  Badge,
  BandScore,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  Progress,
  Skeleton,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { cn } from "@/lib/cn";
import { formatDuration, scorePct } from "@/lib/format";
import { scoreTone } from "../../model";
import { qtypeLabel } from "../../qtypes";
import { useReadingStore } from "../../store";
import { BAND_FACTS, FORMAT_LABEL, MOCK_SECONDS, pacingPlan } from "./script";
import {
  buildNextActions,
  costOfSlowQuestions,
  hasTiming,
  pacingRows,
  verdictOf,
} from "./analysis";
import { useMockStore } from "./store";
import type { ReadingFormat } from "../../types";

export function MockReport() {
  const { attemptId = "" } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const status = useReadingStore((s) => s.reviewStatus);
  const error = useReadingStore((s) => s.reviewError);
  const review = useReadingStore((s) => s.review);
  const timeMs = useReadingStore((s) => s.reviewTimeMs);
  const lookedUp = useReadingStore((s) => s.reviewLookedUp);
  const loadReview = useReadingStore((s) => s.loadReview);

  const recordFor = useMockStore((s) => s.recordFor);
  const loadRecords = useMockStore((s) => s.loadRecords);
  const record = useMemo(() => recordFor(attemptId), [attemptId, recordFor]);

  useEffect(() => {
    loadRecords();
    if (attemptId) void loadReview(attemptId);
  }, [attemptId, loadRecords, loadReview]);

  const rows = useMemo(() => (review ? pacingRows(review, timeMs) : []), [review, timeMs]);
  const cost = useMemo(() => (review ? costOfSlowQuestions(review, timeMs) : null), [review, timeMs]);
  const verdict = useMemo(() => (review ? verdictOf(review, timeMs) : null), [review, timeMs]);
  const actions = useMemo(
    () => (review ? buildNextActions(review, timeMs, attemptId) : []),
    [attemptId, review, timeMs],
  );

  if (status === "loading" || status === "idle") {
    return (
      <PageShell
        title="Mock reading report"
        description="Collecting the marked paper."
        back={{ to: "/reading", label: "Reading" }}
      >
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </PageShell>
    );
  }

  if (status === "error" || !review) {
    return (
      <PageShell title="Mock reading report" back={{ to: "/reading/mock", label: "the mock room" }}>
        <ErrorState
          error={error}
          title="This report could not be opened"
          onRetry={() => void loadReview(attemptId)}
        />
      </PageShell>
    );
  }

  const format = (record?.format ?? (review.format as ReadingFormat) ?? "academic") as ReadingFormat;
  const plan = pacingPlan(format);
  const timed = hasTiming(rows);
  const types = Object.entries(review.per_type ?? {}).sort(
    (a, b) => scorePct(a[1].correct, a[1].total) - scorePct(b[1].correct, b[1].total),
  );

  return (
    <PageShell
      title="Mock reading report"
      description="How you spent the hour, then what the paper scored."
      back={{ to: "/reading", label: "Reading" }}
      status={<Badge tone="outline">{FORMAT_LABEL[format]}</Badge>}
      actions={
        <Button variant="outline" size="sm" onClick={() => navigate("/reading/mock")}>
          Sit another
        </Button>
      }
    >
      <div className="space-y-6">
        {/* ------------------------------------------ pacing, before score --- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
              How you spent the hour
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {verdict && (
              <div
                className={cn(
                  "rounded-xl border p-3.5",
                  verdict.tone === "warn"
                    ? "border-warning/40 bg-warning/8"
                    : "border-success/40 bg-success/8",
                )}
              >
                <p className="text-[15px] font-semibold leading-7 text-foreground">
                  {verdict.headline}
                </p>
                <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{verdict.detail}</p>
              </div>
            )}

            {cost?.sentence && (
              <p className="text-[13px] leading-6 text-foreground">{cost.sentence}</p>
            )}

            {!timed ? (
              <p className="text-[13px] leading-6 text-muted-foreground">
                Per-question times were not recorded for this sitting, so the split across passages
                is unavailable. The whole paper took {formatDuration(review.duration_s)} of the{" "}
                {formatDuration(MOCK_SECONDS)} available.
              </p>
            ) : (
              <ul className="space-y-3">
                {rows.map((row) => {
                  const over = row.spentSeconds > row.targetSeconds;
                  const width = Math.min(100, (row.spentSeconds / (row.targetSeconds * 1.5)) * 100);
                  return (
                    <li key={row.passageId} className="space-y-1">
                      <p className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
                        <span className="font-semibold text-foreground">
                          {format === "general_training" ? "Section" : "Passage"} {row.position} ·{" "}
                          {row.title}
                        </span>
                        <span className="tabular text-muted-foreground">
                          {formatDuration(row.spentSeconds)} of {row.targetSeconds / 60} min ·{" "}
                          <span className={over ? "text-warning" : "text-success"}>
                            {over ? "+" : "−"}
                            {formatDuration(Math.abs(row.spentSeconds - row.targetSeconds))}
                          </span>{" "}
                          · {row.correct}/{row.total}
                        </span>
                      </p>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn("block h-full", over ? "bg-warning" : "bg-primary")}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="text-[12px] tabular text-muted-foreground">
              The plan for this paper: {plan[0]} / {plan[1]} / {plan[2]} minutes, front-loaded
              because the last passage carries the most expensive marks.
              {review.auto_submitted ? " This paper was submitted for you at zero." : ""}
            </p>
          </CardContent>
        </Card>

        {/* -------------------------------------------------- raw, then band --- */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-6 p-5">
            <div className="text-center">
              <p className="text-[32px] font-semibold leading-none tabular text-foreground">
                {review.raw_score}
                <span className="text-[18px] text-muted-foreground">/{review.total_questions}</span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">Raw score, the real metric</p>
            </div>
            {review.band !== null && (
              <BandScore band={review.band} size="md" label="Estimated band" reveal />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <Progress
                value={scorePct(review.raw_score, review.total_questions)}
                label="Accuracy"
                detail={`${Math.round(scorePct(review.raw_score, review.total_questions))}%`}
                tone={scoreTone(review.raw_score, review.total_questions)}
              />
              <p className="text-[12px] leading-5 text-muted-foreground">
                {review.band_disclaimer}
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-[12.5px] leading-6 text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {BAND_FACTS[format]}
        </p>

        {/* ---------------------------------------------------- breakdowns --- */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>By question type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {types.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No per-type data on this paper.</p>
              ) : (
                types.map(([type, stats]) => (
                  <Progress
                    key={type}
                    value={scorePct(stats.correct, stats.total)}
                    label={qtypeLabel(type)}
                    detail={`${stats.correct}/${stats.total}`}
                    tone={scoreTone(stats.correct, stats.total)}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <Timer className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
                By passage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {rows.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No per-passage data.</p>
              ) : (
                rows.map((row) => (
                  <Progress
                    key={row.passageId}
                    value={scorePct(row.correct, row.total)}
                    label={`${row.position}. ${row.title}`}
                    detail={`${row.correct}/${row.total}`}
                    tone={scoreTone(row.correct, row.total)}
                  />
                ))
              )}
              {lookedUp.length > 0 && (
                <p className="pt-1 text-[12px] leading-5 text-muted-foreground">
                  {lookedUp.length} word{lookedUp.length === 1 ? "" : "s"} you tried to look up
                  during the paper {lookedUp.length === 1 ? "is" : "are"} waiting on the review
                  screen: {lookedUp.slice(0, 6).join(", ")}
                  {lookedUp.length > 6 ? "…" : ""}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* -------------------------------------------------- next actions --- */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">What to do with this</h2>
          {actions.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Nothing specific came out of the marking. Read two or three worked solutions in the
              coach anyway and check that your reasoning matched theirs.
            </p>
          ) : (
            <ol className="space-y-2">
              {actions.map((action, index) => (
                <li key={action.id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-start gap-4 pt-4">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[13px] font-semibold text-primary">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{action.title}</p>
                        <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
                          {action.detail}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => navigate(action.to)}>
                        {action.cta}
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          )}
          <p className="text-[12px] leading-5 text-muted-foreground">
            A full paper measures; it does not train. One every two or three days at most. The days
            between are for the review, the trap drills and the coach.
          </p>
        </section>
      </div>
    </PageShell>
  );
}

export default MockReport;
