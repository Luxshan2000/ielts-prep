import { Target, X } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { formatBand } from "@/lib/format";
import { CRITERION_LABELS, SKILL_LABELS, type Callout, type WeakCriterion } from "../types";

interface Props {
  callouts: Callout[];
  weakest: WeakCriterion[];
  dismissed: string[];
  onDismiss: (eventId: string) => void;
}

function skillLabel(skill: string): string {
  return SKILL_LABELS[skill as keyof typeof SKILL_LABELS] ?? skill;
}

function criterionLabel(criterion: string): string {
  return CRITERION_LABELS[criterion] ?? criterion;
}

/** Renders the `action` object of an adaptive event as one plain sentence. */
function actionSentence(action: Record<string, unknown> | null): string | null {
  if (!action) return null;
  const type = typeof action.type === "string" ? action.type : null;
  if (!type) return null;
  const count = typeof action.count === "number" ? action.count : null;
  const tag = typeof action.activity_tag === "string" ? action.activity_tag : null;
  switch (type) {
    case "inject_micro_drills":
      return `Added ${count ?? "extra"} ${tag ?? "targeted"} micro-drills to the coming week.`;
    case "replace_next_activity":
      return "Your next session of that skill was swapped for a timed speed set.";
    case "bias_activity_picker":
      return "The activity picker now favours the parts you are losing marks on.";
    case "queue_card_packs":
      return "Topic vocabulary packs were queued for your upcoming speaking topics.";
    case "cap_new_cards":
      return "New vocabulary cards are paused until your retention recovers.";
    case "promote_skill":
      return "That skill was promoted to the next session's main activity.";
    case "shrink_next_session":
      return "Your next session shrank to the 30-minute variant so it is easy to restart.";
    default:
      return `Plan adjusted: ${type.replace(/_/g, " ")}.`;
  }
}

/** Renders the `evidence` object as one short clause, so callouts stay auditable. */
function evidenceSentence(evidence: Record<string, unknown> | null): string | null {
  if (!evidence) return null;
  const parts: string[] = [];
  if (typeof evidence.criterion === "string") parts.push(criterionLabel(evidence.criterion));
  if (typeof evidence.skill === "string" && evidence.skill !== "any") {
    parts.push(skillLabel(evidence.skill));
  }
  if (typeof evidence.value === "number") parts.push(`band ${formatBand(evidence.value)}`);
  if (typeof evidence.consecutive === "number") {
    parts.push(`${evidence.consecutive} attempts in a row`);
  }
  if (typeof evidence.retention === "number") {
    parts.push(`${Math.round(evidence.retention * 100)} % retention`);
  }
  if (Array.isArray(evidence.attempt_ids)) {
    parts.push(`${evidence.attempt_ids.length} attempts reviewed`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Focus this week (10 §7/§8): adaptive-rule firings — evidence AND action, so a
 * plan change is never silent — plus the weakest criterion bands underneath.
 */
export function FocusCard({ callouts, weakest, dismissed, onDismiss }: Props) {
  const visible = callouts.filter((c) => !dismissed.includes(c.id) && !c.dismissed_at);
  const hasContent = visible.length > 0 || weakest.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Focus this week</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasContent && (
          <p className="text-[13px] text-muted-foreground">
            Nothing to flag yet. Once a few attempts are scored, BandReady points at the
            criterion costing you the most marks and says what it changed in your plan.
          </p>
        )}

        {visible.length > 0 && (
          <ul className="space-y-2">
            {visible.map((callout) => {
              const evidence = evidenceSentence(callout.evidence);
              const action = actionSentence(callout.action);
              return (
                <li
                  key={callout.id}
                  className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/[0.06] px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[13px] font-medium text-foreground">
                      {callout.description}
                    </p>
                    {evidence && (
                      <p className="text-[11px] tabular text-muted-foreground">
                        Evidence: {evidence}
                      </p>
                    )}
                    {action && <p className="text-[11px] text-muted-foreground">{action}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => onDismiss(callout.id)}
                    aria-label={`Dismiss callout: ${callout.description}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {weakest.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Target className="h-3 w-3" aria-hidden="true" />
              Weakest criteria
            </p>
            <ul className="space-y-1.5">
              {weakest.map((item) => (
                <li
                  key={`${item.skill}-${item.criterion}`}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <Badge tone="outline" className="shrink-0">
                    {skillLabel(item.skill)}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {criterionLabel(item.criterion)}
                  </span>
                  <span className="shrink-0 tabular text-muted-foreground">
                    {formatBand(item.band)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
