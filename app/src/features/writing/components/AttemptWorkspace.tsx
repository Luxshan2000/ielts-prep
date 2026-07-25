/**
 * `/writing/attempt/:attemptId` — one route for the whole life of an attempt.
 *
 * Which screen shows is a function of the attempt's status, not of navigation, so
 * submitting in place turns the editor into the report and a resumed draft always
 * reopens where the learner left it.
 */

import { useEffect, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, FileQuestion, Hourglass, RefreshCw } from "lucide-react";
import { Button, EmptyState, Skeleton } from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { useWritingStore } from "../store";
import { AttemptEditor } from "./AttemptEditor";
import { AttemptReport } from "./AttemptReport";

/** Chrome for every state that is not the editor or the report. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <PageShell title="Writing attempt" description="One answer, from draft to marked report.">
      {children}
    </PageShell>
  );
}

export function AttemptWorkspace() {
  const { attemptId = "" } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const attempt = useWritingStore((s) => s.attempt);
  const loading = useWritingStore((s) => s.attemptLoading);
  const error = useWritingStore((s) => s.attemptError);
  const loadAttempt = useWritingStore((s) => s.loadAttempt);
  const resetDraft = useWritingStore((s) => s.resetDraft);
  const submitting = useWritingStore((s) => s.submitting);

  useEffect(() => {
    if (!attemptId) return;
    // Switching attempts must never carry the previous draft's text across.
    if (useWritingStore.getState().attempt?.id !== attemptId) resetDraft();
    void loadAttempt(attemptId);
  }, [attemptId, loadAttempt, resetDraft]);

  const back = <Button onClick={() => navigate("/writing")}>Back to Writing</Button>;

  if (!attemptId) {
    return (
      <Shell>
        <EmptyState
          icon={FileQuestion}
          title="No attempt selected"
          description="Open an attempt from the prompt bank or your history."
          action={back}
        />
      </Shell>
    );
  }

  const stale = !attempt || attempt.id !== attemptId;

  if (loading && stale) {
    return (
      <Shell>
        <div className="space-y-4">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-6 w-80" />
          <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
            <Skeleton className="h-72 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        </div>
      </Shell>
    );
  }

  if (error && stale) {
    return (
      <Shell>
        <EmptyState
          icon={AlertTriangle}
          title="That attempt could not be opened"
          description={error}
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void loadAttempt(attemptId)}>
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
              <Button onClick={() => navigate("/writing")}>
                <ArrowLeft className="h-4 w-4" />
                Back to Writing
              </Button>
            </div>
          }
        />
      </Shell>
    );
  }

  if (stale) {
    return (
      <Shell>
        <EmptyState
          icon={FileQuestion}
          title="Attempt not found"
          description="It may have been deleted along with its practice session."
          action={back}
        />
      </Shell>
    );
  }

  if (attempt.status === "scored" && attempt.evaluation) {
    return <AttemptReport attempt={attempt} evaluation={attempt.evaluation} />;
  }

  // Submitted but no evaluation row yet — either another window is polling the
  // job, or this one was reopened while marking is still running.
  if (attempt.status === "submitted" && !submitting) {
    return (
      <Shell>
        <EmptyState
          icon={Hourglass}
          title="This answer is being marked"
          description="The examiner model is running in the background. Marking usually takes under a minute."
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void loadAttempt(attemptId)}>
                <RefreshCw className="h-4 w-4" />
                Check again
              </Button>
              <Button variant="ghost" onClick={() => navigate("/writing")}>
                Back to Writing
              </Button>
            </div>
          }
        />
      </Shell>
    );
  }

  return <AttemptEditor attempt={attempt} />;
}
