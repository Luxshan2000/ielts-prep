/**
 * A contrast board — one permanent screen per pair of rivals.
 *
 * This is the one exception to "no reference section" in the module design. A
 * browse-all-rules section answers every question nobody asked; a board answers
 * the single question this learner keeps getting wrong, and it is the screen a
 * wild failure opens onto — because someone who just got it wrong in a real
 * essay needs the decision restated, not another drill (DESIGN §6 F6).
 *
 * So the order here is: the question, the two rivals, the three worked pairs with
 * the deciding span lit, what the wrong choice would have said, the learner's own
 * hit rate — and only then the practice button.
 */

import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Play, Scale } from "lucide-react";
import { Badge, Button, ErrorState, Skeleton } from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { useGrammarStore } from "../store";
import { WorkedPairs } from "./DecisionPanel";
import { PairGrid, Section, StateBadge } from "./primitives";

export function BoardScreen() {
  const { boardId = "" } = useParams();
  const navigate = useNavigate();
  const board = useGrammarStore((s) => s.board);
  const loading = useGrammarStore((s) => s.boardLoading);
  const error = useGrammarStore((s) => s.boardError);
  const loadBoard = useGrammarStore((s) => s.loadBoard);

  useEffect(() => {
    void loadBoard(boardId);
  }, [boardId, loadBoard]);

  if (loading) {
    return (
      <PageShell title="Contrast" maxWidth="max-w-3xl">
        <Skeleton className="h-64 w-full rounded-xl" />
      </PageShell>
    );
  }

  if (error || !board) {
    return (
      <PageShell title="Contrast" maxWidth="max-w-3xl">
        <ErrorState
          error={error ?? "not found"}
          title="That contrast board could not be opened"
          onRetry={() => void loadBoard(boardId)}
        />
      </PageShell>
    );
  }

  const accuracy = board.accuracy;
  const rate =
    accuracy && accuracy.total > 0 ? Math.round((accuracy.correct / accuracy.total) * 100) : null;

  return (
    <PageShell
      back={{ to: "/grammar", label: "Grammar" }}
      title={board.question}
      description="Ask yourself this one question and the choice makes itself."
      maxWidth="max-w-3xl"
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={board.drillable === 0}
            onClick={() => navigate(`/grammar/practice?board=${encodeURIComponent(board.board_id)}`)}
          >
            <Play className="h-4 w-4" />
            Practise this contrast
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pb-10">
        <section className="rounded-xl border-2 border-primary/40 bg-primary/8 p-5">
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-primary">
            <Scale className="h-3.5 w-3.5" aria-hidden="true" />
            Two ways to say it, one right answer per situation
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {board.members.map((member) => (
              <button
                key={member.point_id}
                type="button"
                onClick={() => navigate(`/grammar/point/${encodeURIComponent(member.point_id)}`)}
                className="rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground">
                    {member.selects ?? member.grammar_name ?? member.title}
                  </span>
                  <StateBadge state={member.state} />
                </span>
                <span className="mt-1 block text-[12px] leading-relaxed text-muted-foreground">
                  {member.title}
                </span>
              </button>
            ))}
          </div>
          {rate !== null && (
            <p className="mt-3 text-[12px] text-muted-foreground">
              You have got this choice right{" "}
              <span className="font-medium text-foreground">
                {accuracy?.correct} of {accuracy?.total}
              </span>{" "}
              times ({rate}%).
            </p>
          )}
        </section>

        {board.minimal_pair && (
          <Section title="One difference, two meanings">
            <PairGrid>
              {[board.minimal_pair.a, board.minimal_pair.b].map((side, i) => (
                <div key={i} className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[14px] font-medium leading-relaxed text-foreground">{side.text}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{side.means}</p>
                </div>
              ))}
            </PairGrid>
            {board.minimal_pair.only_difference && (
              <p className="mt-2 text-[12px] text-muted-foreground">
                The only difference:{" "}
                <span className="rounded bg-warning/20 px-1.5 py-0.5 font-mono text-foreground">
                  {board.minimal_pair.only_difference}
                </span>
              </p>
            )}
          </Section>
        )}

        {board.worked_pairs?.length > 0 && (
          <Section title="Three pairs, worked" hint="The words that decide it are highlighted.">
            <WorkedPairs pairs={board.worked_pairs} />
          </Section>
        )}

        {board.wrong_choice_note && (
          <Section title="What the other one would have said">
            <p className="text-[13px] leading-relaxed text-foreground">{board.wrong_choice_note}</p>
          </Section>
        )}

        {board.stronger_test && (
          <Section title="A test that always works">
            <p className="text-[13px] leading-relaxed text-foreground">{board.stronger_test}</p>
          </Section>
        )}

        {board.edge_case?.text && (
          <Section title="The exception, once">
            <p className="text-[13px] leading-relaxed text-muted-foreground">{board.edge_case.text}</p>
            {board.edge_case.ignore_the_rest && (
              <Badge tone="outline" className="mt-2">
                Know it exists, then ignore it
              </Badge>
            )}
          </Section>
        )}
      </div>
    </PageShell>
  );
}
