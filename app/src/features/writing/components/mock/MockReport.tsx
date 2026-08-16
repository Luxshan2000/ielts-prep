/**
 * `/writing/mock/report/:mockId` — the loop from testing back into learning.
 *
 * **The report leads with time allocation, before any band.** That ordering is the
 * argument: the most expensive mistake in this paper is not a tense error, it is
 * giving Task 1 half the hour, and no band score anywhere on this screen would
 * reveal it.
 *
 * Then the two band sets with the criteria and the exact evidence the marking used,
 * then — clearly labelled as an estimate, once — the weighted paper figure. This is
 * the only screen in BandReady that shows a combined Writing band.
 *
 * It ends on the coach for the two prompts just sat, whose model answers are
 * unlocked *because* the attempt happened.
 */

import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Clock, FileText, Info } from "lucide-react";
import {
  Badge,
  BandScore,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Notice,
  Skeleton,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { cn } from "@/lib/cn";
import { CriterionCards } from "../CriterionCards";
import { TASK_SHORT, genreLabel, type WritingAttempt } from "../../store";
import { buildNextActions, timeVerdict, unmarkedReason } from "./analysis";
import { deltaMinutes, minutesLabel } from "./format";
import { WEIGHTING_NOTE } from "./script";
import {
  TARGET_SECONDS,
  TASK_ORDER,
  estimatedPaperBand,
  useMockStore,
  type MockTaskKey,
} from "./store";

const TASK_HEADING: Record<MockTaskKey, string> = { task1: "Task 1", task2: "Task 2" };

export function MockReport() {
  const { mockId = "" } = useParams<{ mockId: string }>();
  const navigate = useNavigate();

  const record = useMockStore((s) => s.active);
  const loading = useMockStore((s) => s.reportLoading);
  const error = useMockStore((s) => s.reportError);
  const report = useMockStore((s) => s.report);
  const loadReport = useMockStore((s) => s.loadReport);

  useEffect(() => {
    void loadReport(mockId);
  }, [loadReport, mockId]);

  const task1 = report.task1;
  const task2 = report.task2;

  const estimate = useMemo(
    () =>
      estimatedPaperBand(
        task1?.evaluation?.overall_band ?? null,
        task2?.evaluation?.overall_band ?? null,
      ),
    [task1?.evaluation?.overall_band, task2?.evaluation?.overall_band],
  );

  const actions = useMemo(
    () => (record ? buildNextActions({ record, task1, task2 }) : []),
    [record, task1, task2],
  );

  if (loading || (!record && !error)) {
    return (
      <PageShell title="Mock writing report" description="Collecting both marked answers.">
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </PageShell>
    );
  }

  if (error || !record) {
    return (
      <PageShell title="Mock writing report">
        <ErrorState
          error={error}
          title="This report could not be opened"
          onRetry={() => void loadReport(mockId)}
        />
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" onClick={() => navigate("/writing/mock")}>
            Back to the mock room
          </Button>
        </div>
      </PageShell>
    );
  }

  const verdict = timeVerdict(record);

  return (
    <PageShell
      title="Mock writing report"
      description="How you spent the hour, then what the two answers earned."
      actions={
        <Button variant="outline" size="sm" onClick={() => navigate("/writing/mock")}>
          Sit another
        </Button>
      }
    >
      <div className="space-y-6">
        {/* --------------------------------------------- time, before bands --- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
              How you spent the hour
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <ul className="space-y-3">
              {TASK_ORDER.map((key) => {
                const spent = record.perTaskSeconds[key];
                const target = TARGET_SECONDS[key];
                const width = Math.min(100, (spent / (target * 1.5)) * 100);
                const over = spent > target;
                return (
                  <li key={key} className="space-y-1">
                    <p className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
                      <span className="font-semibold text-foreground">{TASK_HEADING[key]}</span>
                      <span className="tabular text-muted-foreground">
                        {minutesLabel(spent)} of a {minutesLabel(target)} target ·{" "}
                        <span className={over ? "text-warning" : "text-success"}>
                          {deltaMinutes(spent, target)}
                        </span>
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

            {record.overtimeSeconds > 0 && (
              <p className="text-[13px] leading-6 text-destructive">
                {minutesLabel(record.overtimeSeconds)} of what you wrote came after the hour ran
                out. It is marked, but in the room it would not exist.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------------- the two answers --- */}
        {TASK_ORDER.map((key) => (
          <TaskSection
            key={key}
            heading={TASK_HEADING[key]}
            attempt={key === "task1" ? task1 : task2}
            onCoach={(promptId) => navigate(`/writing/coach/${encodeURIComponent(promptId)}`)}
            onOpenAttempt={(attemptId) => navigate(`/writing/attempt/${attemptId}`)}
          />
        ))}

        {/* ------------------------------------------------- the estimate --- */}
        <Card>
          <CardHeader>
            <CardTitle>Estimated Writing band</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {estimate === null ? (
              <p className="text-[13px] leading-6 text-muted-foreground">
                Both answers have to be marked before there is a paper estimate. Whichever one is
                missing above is why.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                <BandScore band={estimate} size="lg" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">
                    An estimate, and the only combined figure in the app
                  </p>
                  <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">
                    Task 1 {task1?.evaluation?.overall_band?.toFixed(1) ?? "-"} · Task 2{" "}
                    {task2?.evaluation?.overall_band?.toFixed(1) ?? "-"}
                  </p>
                </div>
              </div>
            )}
            <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-[12.5px] leading-6 text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {WEIGHTING_NOTE}
            </p>
          </CardContent>
        </Card>

        {/* ------------------------------------------------- next actions --- */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">What to do with this</h2>
          {actions.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Nothing specific came out of the marking. Sit another paper, or work one of these
              two prompts in the coach.
            </p>
          ) : (
            <ol className="space-y-2">
              {actions.map((action, i) => (
                <li key={action.id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-start gap-4 pt-4">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[13px] font-semibold text-primary">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{action.title}</p>
                        <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
                          {action.detail}
                        </p>
                      </div>
                      {action.to && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(action.to as string)}
                        >
                          {action.cta ?? "Open"}
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </PageShell>
  );
}

function TaskSection({
  heading,
  attempt,
  onCoach,
  onOpenAttempt,
}: {
  heading: string;
  attempt: WritingAttempt | null;
  onCoach: (promptId: string) => void;
  onOpenAttempt: (attemptId: string) => void;
}) {
  if (!attempt) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{heading}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={FileText}
            title="This answer is not on this machine"
            description="The sitting record points at an attempt the engine no longer has."
          />
        </CardContent>
      </Card>
    );
  }

  const evaluation = attempt.evaluation;
  const prompt = attempt.prompt;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {heading}
          {prompt && (
            <>
              <Badge tone="outline">{TASK_SHORT[prompt.task_type] ?? prompt.task_type}</Badge>
              <Badge tone="outline">{genreLabel(prompt.genre)}</Badge>
            </>
          )}
          <span className="text-[12px] font-normal tabular text-muted-foreground">
            {attempt.word_count} words
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!evaluation ? (
          <UnmarkedTask attempt={attempt} onOpenAttempt={onOpenAttempt} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <BandScore band={evaluation.overall_band} size="md" />
              <p className="text-[13px] leading-6 text-muted-foreground">
                {prompt?.prompt_text?.split("\n")[0] ?? "This task's marked answer."}
              </p>
            </div>

            <CriterionCards
              criteria={evaluation.criteria}
              bands={evaluation.bands}
              taskType={prompt?.task_type ?? null}
            />

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenAttempt(attempt.id)}>
                The full marked answer
              </Button>
              {prompt && (
                <Button size="sm" onClick={() => onCoach(prompt.id)}>
                  Study this prompt
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One task of the pair with no band on it, and the true reason why.
 *
 * The reason is never guessed: it comes from the attempt's own status and word count
 * (`unmarkedReason`). When the cause is the setup rather than the answer, the way out
 * is a link to Settings — telling somebody their essay "was not marked" and leaving
 * them to work out that a model has to be installed is where this screen used to end.
 */
function UnmarkedTask({
  attempt,
  onOpenAttempt,
}: {
  attempt: WritingAttempt;
  onOpenAttempt: (attemptId: string) => void;
}) {
  const navigate = useNavigate();
  const reason = unmarkedReason(attempt);

  return (
    <div className="space-y-3">
      <Notice tone="warning" title={reason.headline}>
        {reason.detail}
      </Notice>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => onOpenAttempt(attempt.id)}>
          Open the draft
        </Button>
        {reason.setup && (
          <Button size="sm" onClick={() => navigate("/settings")}>
            Set up marking
          </Button>
        )}
      </div>
    </div>
  );
}

export default MockReport;
