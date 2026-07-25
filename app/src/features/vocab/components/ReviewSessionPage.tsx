import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Inbox, PartyPopper, X } from "lucide-react";
import { Button, EmptyState, Progress, Skeleton } from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { useVocabStore } from "../store";
import { ExerciseCard } from "./ExerciseCard";
import { SessionSummary } from "./SessionSummary";

/**
 * The review player at `/vocab/review`.
 *
 * Space flips, 1–4 rate, Escape leaves. Every rating is POSTed immediately, so
 * leaving mid-session never loses work — the summary just says where you stopped.
 */
export function ReviewSessionPage() {
  const navigate = useNavigate();
  const session = useVocabStore((s) => s.session);
  const startSession = useVocabStore((s) => s.startSession);
  const submitRating = useVocabStore((s) => s.submitRating);
  const finishSession = useVocabStore((s) => s.finishSession);
  const resetSession = useVocabStore((s) => s.resetSession);

  const { items, index, loading, error, finished, outcomes, startedAt } = session;

  // Auto-build a session when the player is opened directly (deep link/refresh).
  // Once per mount: arriving from the Review tab, the session is already built.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    if (loading || startedAt !== null) return;
    void startSession();
  }, [loading, startSession, startedAt]);

  const leave = useCallback(() => {
    resetSession();
    navigate("/vocab");
  }, [navigate, resetSession]);

  const exit = useCallback(() => {
    if (!finished && outcomes.length > 0) {
      finishSession();
      return;
    }
    leave();
  }, [finished, finishSession, leave, outcomes.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      exit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exit]);

  const current = items[index];
  const total = items.length;
  const elapsedMs = startedAt ? Date.now() - startedAt : 0;

  const toolbar =
    total > 0 && !finished ? (
      <Progress
        value={total === 0 ? 0 : (index / total) * 100}
        label={`Card ${Math.min(index + 1, total)} of ${total}`}
        detail={`${session.counts?.due_today ?? 0} due today`}
      />
    ) : undefined;

  return (
    <PageShell
      title="Review"
      description="Space shows the answer · 1–4 rate the card · Esc leaves"
      maxWidth="max-w-2xl"
      toolbar={toolbar}
      actions={
        <Button variant="ghost" onClick={exit}>
          <X className="h-4 w-4" />
          Exit
        </Button>
      }
    >
      {loading && (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-52 w-full" />
          <div className="grid grid-cols-4 gap-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        </div>
      )}

      {!loading && error && (
        <EmptyState
          icon={AlertCircle}
          title="The review session could not be built"
          description={error}
          action={
            <div className="flex gap-2">
              <Button onClick={() => void startSession()}>Try again</Button>
              <Button variant="outline" onClick={leave}>
                Back to vocabulary
              </Button>
            </div>
          }
        />
      )}

      {!loading && !error && finished && (
        <SessionSummary
          outcomes={outcomes}
          planned={total}
          counts={session.counts}
          streak={session.streak}
          elapsedMs={elapsedMs}
          starting={loading}
          onReviewMore={() => void startSession()}
          onDone={leave}
        />
      )}

      {!loading && !error && !finished && !current && (
        <EmptyState
          icon={outcomes.length > 0 ? PartyPopper : Inbox}
          title="Nothing is due right now"
          description="Accept a few suggestions or opt into a study deck, and cards will start arriving here."
          action={
            <Button onClick={leave}>Back to vocabulary</Button>
          }
        />
      )}

      {!loading && !error && !finished && current && (
        <ExerciseCard
          key={current.card_id}
          item={current}
          submitting={session.submitting}
          error={session.submitError}
          onRate={(rating, meta) => void submitRating(rating, meta)}
        />
      )}
    </PageShell>
  );
}
