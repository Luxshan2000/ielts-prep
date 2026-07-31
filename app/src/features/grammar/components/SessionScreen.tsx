/**
 * The practice session — one item at a time, delivered by the ladder.
 *
 * The shape of this screen is the algorithm made visible (DESIGN §1.4, §1.9):
 * the rung's name sits on every card, the bar shows how much of the sitting is
 * left, and when the queue pulls in a sibling from the same confusion set it
 * says so in one line, because "both of these are about how you talk about past
 * time" is the lesson rather than an accident of scheduling.
 *
 * Everything the learner has done is already written server-side when it was
 * done, so a crash, a reload or a slammed laptop lid costs at most the item on
 * screen. That is why the exit confirmation is one line and not a dialogue.
 */

import { useCallback, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, GraduationCap, Layers, RefreshCw } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { cn } from "@/lib/cn";
import { KIND_INSTRUCTION, KIND_LABEL, stageName } from "../labels";
import { useGrammarStore } from "../store";
import type { SessionRequest } from "../api";
import { FeedbackPanel, SignalPanel } from "./FeedbackPanel";
import { ItemView } from "./items";
import { StageChip } from "./primitives";
import { SessionSummary } from "./SessionSummary";

/** The four ways in, read off the query string so every entry point is a link. */
function requestFromParams(params: URLSearchParams): SessionRequest {
  const point = params.get("point");
  const code = params.get("code");
  const board = params.get("board");
  if (point) return { point_id: point, mode: "point" };
  if (code) return { code, mode: "code" };
  if (board) return { board_id: board, mode: "board" };
  return { mode: "daily" };
}

function sessionTitle(request: SessionRequest, pointTitle?: string | null): string {
  if (request.point_id) return pointTitle || "Lesson practice";
  if (request.code) return "Fixing one mistake";
  if (request.board_id) return "Practising one contrast";
  return "Today's practice";
}

export function SessionScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const request = useMemo(() => requestFromParams(params), [params]);

  const session = useGrammarStore((s) => s.session);
  const beginSession = useGrammarStore((s) => s.beginSession);
  const answer = useGrammarStore((s) => s.answer);
  const retryAfterSignal = useGrammarStore((s) => s.retryAfterSignal);
  const nextItem = useGrammarStore((s) => s.nextItem);
  const markReplay = useGrammarStore((s) => s.markReplay);
  const resetSession = useGrammarStore((s) => s.resetSession);

  const key = `${request.mode}:${request.point_id ?? request.code ?? request.board_id ?? ""}`;

  useEffect(() => {
    void beginSession(request);
    return () => resetSession();
    // One build per selector. Re-running on `request` identity would rebuild the
    // set every render and hand the learner a different item mid-answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const item = session.items[session.index] ?? null;
  const attempt = session.attempt;
  const total = session.items.length;
  const done = session.index + (attempt.revealed ? 1 : 0);
  const isLast = session.index >= total - 1;

  const onAnswer = useCallback(
    (value: string | number | number[] | null, followUp?: number | null) => {
      void answer({ answer: value, followUp: followUp ?? null });
    },
    [answer],
  );

  // Enter moves on once an item is finished, so a whole session is keyboard-only.
  useEffect(() => {
    if (!attempt.revealed) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (event.key !== "Enter") return;
      event.preventDefault();
      nextItem();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attempt.revealed, nextItem]);

  const leave = () => navigate("/grammar");

  // ------------------------------------------------------------- states ----

  if (session.loading) {
    return (
      <PageShell title="Building your practice" maxWidth="max-w-3xl">
        <div className="flex items-center gap-3 py-16 text-sm text-muted-foreground">
          <Spinner />
          Choosing the sentences you have not seen yet.
        </div>
      </PageShell>
    );
  }

  if (session.error) {
    return (
      <PageShell title="Practice" maxWidth="max-w-3xl">
        <ErrorState
          error={session.error}
          title="This practice set could not be built"
          onRetry={() => void beginSession(request)}
        />
      </PageShell>
    );
  }

  if (session.finished || (!item && total > 0)) {
    return <SessionSummary onExit={leave} onAgain={() => void beginSession(request)} request={request} />;
  }

  if (!item) {
    return (
      <PageShell title="Practice" maxWidth="max-w-3xl">
        <EmptyState
          icon={GraduationCap}
          title="Nothing is due right now"
          description={
            session.emptyReason ??
            "Everything you have started is scheduled for a later day. Starting a new lesson is the useful thing to do next."
          }
          action={<Button onClick={leave}>Back to the path</Button>}
        />
      </PageShell>
    );
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <PageShell
      title={sessionTitle(request, item.point_title)}
      description={item.point_title && request.point_id ? undefined : item.point_title ?? undefined}
      maxWidth="max-w-3xl"
      actions={
        <Button variant="ghost" size="sm" onClick={leave}>
          <ArrowLeft className="h-4 w-4" />
          Leave
        </Button>
      }
      toolbar={
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
            <span>
              {Math.min(done + (attempt.revealed ? 0 : 1), total)} of {total}
            </span>
            <span>
              {stageName(item.stage)} · {KIND_LABEL[item.kind] ?? item.kind}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress through this set">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      }
    >
      <div className="space-y-4 pb-10">
        {item.sibling_note && (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-[13px] text-muted-foreground">
            <Layers className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {item.sibling_note}
          </p>
        )}

        {item.reteach && (
          <div className="rounded-lg border border-primary/40 bg-primary/8 p-3">
            <p className="text-[12px] font-medium uppercase tracking-wide text-primary">
              A reminder before you try again
            </p>
            {item.reteach.rule_line && (
              <p className="mt-1 text-[13px] font-medium text-foreground">{item.reteach.rule_line}</p>
            )}
            {item.reteach.worked_example && (
              <p className="mt-1 text-[13px] text-muted-foreground">{item.reteach.worked_example}</p>
            )}
          </div>
        )}

        <div className={cn("rounded-xl border border-border bg-card p-5", session.submitting && "opacity-70")}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StageChip stage={item.stage} />
            {item.point_title && !request.point_id && (
              <button
                type="button"
                onClick={() => navigate(`/grammar/point/${encodeURIComponent(item.point_id)}`)}
                className="truncate text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {item.point_title}
              </button>
            )}
            {item.register && <Badge tone="outline">{item.register}</Badge>}
          </div>

          <p className="mb-4 text-[13px] text-muted-foreground">
            {KIND_INSTRUCTION[item.kind] ?? "Answer the question."}
          </p>

          <ItemView
            item={item}
            attempt={attempt}
            disabled={session.submitting || attempt.revealed}
            onAnswer={onAnswer}
            onReplay={markReplay}
          />
        </div>

        {session.submitError && (
          <div className="rounded-lg border border-warning/40 bg-warning/8 p-3">
            <p className="text-[13px] text-foreground">{session.submitError}</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => onAnswer(null)}>
              <RefreshCw className="h-4 w-4" />
              Try sending it again
            </Button>
          </div>
        )}

        {attempt.signalled && !attempt.revealed && (
          <SignalPanel item={item} onRetry={retryAfterSignal} />
        )}

        {attempt.revealed && (
          <FeedbackPanel
            item={item}
            attempt={attempt}
            onContinue={nextItem}
            continueLabel={isLast ? "Finish" : "Next"}
          />
        )}
      </div>
    </PageShell>
  );
}
