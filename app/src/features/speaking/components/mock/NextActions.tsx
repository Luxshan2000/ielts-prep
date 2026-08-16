/**
 * The loop back into learning.
 *
 * A mock report that ends at a number is a verdict; a mock report that ends here is a
 * lesson plan. Every action names something specific from this sitting and, where it
 * can, links to the exact screen that fixes it — most importantly the Topic Coach for
 * the cards just sat, whose model answers are unlocked *because* the attempt happened
 * (the gate opens on a completed session, `routes/speaking_coach.py`).
 */

import { useNavigate } from "react-router-dom";
import { ArrowRight, GraduationCap, ListChecks, Unlock } from "lucide-react";
import { Button, Card, CardContent } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { SetCard } from "./api";
import type { NextAction } from "./analysis";

export interface NextActionsProps {
  actions: NextAction[];
  /** The cards sat, so the learner can go straight to the one they struggled with. */
  cards: SetCard[];
  setId: string | null;
  setTitle: string | null;
  className?: string;
}

export function NextActions({ actions, cards, setId, setTitle, className }: NextActionsProps) {
  const navigate = useNavigate();

  if (actions.length === 0 && cards.length === 0) {
    return (
      <p className={cn("text-[13px] text-muted-foreground", className)}>
        The marking produced no specific notes to work from. Sit another mock, or work a topic in
        the Topic Coach.
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
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
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>

      {setId && cards.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/12">
                <Unlock className="h-4 w-4 text-success" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  Model answers are now unlocked for the cards you sat
                </p>
                <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">
                  {setTitle ? `“${setTitle}”: ` : ""}the same story told at every band from 5 to
                  9, annotated against the four criteria, plus the prep plan and the language the
                  subject needs. They stayed locked until you had attempted them, because a model
                  read beforehand is a script to memorise.
                </p>
              </div>
            </div>

            {/* Listed, not linked: the coach opens the whole set — its prep plan, its
                language bank and its vocabulary belong to the set, not to one card —
                so four buttons that all go to the same place would promise a deep
                link that does not exist, and cost four tab stops on the way past. */}
            <ul className="grid gap-2 sm:grid-cols-2">
              {cards.map((card) => (
                <li
                  key={card.id}
                  className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-semibold text-muted-foreground">
                    {card.part}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{card.title}</span>
                  <ListChecks
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </li>
              ))}
            </ul>

            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate(`/speaking/coach/${encodeURIComponent(setId)}`)}
            >
              <GraduationCap className="h-4 w-4" />
              Open the topic coach
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
