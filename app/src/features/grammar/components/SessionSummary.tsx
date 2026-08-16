/**
 * The end of a sitting.
 *
 * Not a score. The number that matters to an adult with an exam date is *what
 * can I now do that I could not do this morning*, so the headline is the rungs
 * that moved and the sentences the learner got wrong, each with the one
 * imperative that fixes it. Mastery is reported as a sentence about the learner
 * (DESIGN §1.7), never as a percentage.
 */

import { useNavigate } from "react-router-dom";
import { ArrowRight, RotateCcw } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { KIND_LABEL, stageName } from "../labels";
import { useGrammarStore } from "../store";
import type { SessionRequest } from "../api";

export interface SessionSummaryProps {
  request: SessionRequest;
  onExit: () => void;
  onAgain: () => void;
}

export function SessionSummary({ request, onExit, onAgain }: SessionSummaryProps) {
  const navigate = useNavigate();
  const outcomes = useGrammarStore((s) => s.session.outcomes);

  const right = outcomes.filter((o) => o.correct).length;
  const missed = outcomes.filter((o) => !o.correct);
  const points = Array.from(new Set(outcomes.map((o) => o.pointId)));

  return (
    <PageShell
      title="That's the set"
      description={
        outcomes.length === 0
          ? "Nothing was answered, so nothing changed."
          : `${right} of ${outcomes.length} right, across ${points.length} ${points.length === 1 ? "lesson" : "lessons"}. Every answer was saved as you gave it.`
      }
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5 pb-10">
        {missed.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">What to carry out of this</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              One instruction per thing that went wrong. These are the sentences you will meet again.
            </p>
            <ul className="mt-3 space-y-2">
              {missed.map((outcome) => (
                <li
                  key={outcome.itemId}
                  className="rounded-lg border border-border bg-background px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="outline">{stageName(outcome.stage)}</Badge>
                    <span className="text-[12px] text-muted-foreground">
                      {KIND_LABEL[outcome.kind] ?? outcome.kind}
                    </span>
                    {outcome.pointTitle && (
                      <button
                        type="button"
                        onClick={() => navigate(`/grammar/point/${encodeURIComponent(outcome.pointId)}`)}
                        className="truncate text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        {outcome.pointTitle}
                      </button>
                    )}
                  </div>
                  {outcome.feedForward && (
                    <p className="mt-1.5 flex items-start gap-2 text-[13px] font-medium text-foreground">
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      {outcome.feedForward}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {right > 0 && missed.length === 0 && (
          <section className="rounded-xl border border-success/40 bg-success/8 p-5">
            <p className="text-sm font-medium text-foreground">
              Every one right. The next time these come round they will be harder. That is the ladder
              working, not the app being awkward.
            </p>
          </section>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={onExit}>Back to the path</Button>
          <Button variant="outline" onClick={onAgain}>
            <RotateCcw className="h-4 w-4" />
            Another set
          </Button>
          {request.point_id && (
            <Button
              variant="ghost"
              onClick={() => navigate(`/grammar/point/${encodeURIComponent(request.point_id ?? "")}`)}
            >
              Back to the lesson
            </Button>
          )}
        </div>

        <p className="text-[12px] leading-relaxed text-muted-foreground">
          A grammar point takes weeks, not days: a dozen or so spaced retrievals before it holds up
          under pressure. Coming back tomorrow is worth more than doing another five sets tonight.
        </p>
      </div>
    </PageShell>
  );
}
