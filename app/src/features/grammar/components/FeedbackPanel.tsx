/**
 * What the app says after an answer.
 *
 * This panel is the module's trust budget, so it follows four rules that are not
 * negotiable (DESIGN §2.7, §2.9, §6 F3/F5):
 *
 * 1. **Name the meaning, not the verdict.** "Incorrect" teaches nothing. *"You
 *    chose worked. That says the six years are over."* is a sentence a learner
 *    can act on tomorrow, and it is the authored `why_key`.
 * 2. **One imperative next time.** `feed_forward` is the only line that changes
 *    behaviour, so it gets its own row and its own icon.
 * 3. **Never red.** A wrong answer is amber. Red is reserved across this app for
 *    things that are broken, and a learner mid-lesson is not broken.
 * 4. **Every rejection can be appealed.** One field, the learner's own words, and
 *    a re-check. A module that cannot be told it is wrong stays wrong.
 */

import { useState } from "react";
import { ArrowRight, BookmarkPlus, Check, MessageSquareWarning, Sparkles } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useGrammarStore, type AttemptState } from "../store";
import type { SessionItem } from "../types";
import { Example } from "./primitives";

export interface FeedbackPanelProps {
  item: SessionItem;
  attempt: AttemptState;
  /** Rendered inside the panel so "Continue" is where the eye already is. */
  onContinue: () => void;
  continueLabel: string;
}

export function FeedbackPanel({ item, attempt, onContinue, continueLabel }: FeedbackPanelProps) {
  const [appealOpen, setAppealOpen] = useState(false);
  const [meant, setMeant] = useState("");
  const appeal = useGrammarStore((s) => s.appeal);
  const submitting = useGrammarStore((s) => s.session.submitting);
  const saveRule = useGrammarStore((s) => s.saveRule);
  const savedRules = useGrammarStore((s) => s.savedRules);

  const reveal = attempt.reveal;
  const result = attempt.result;
  const correct = attempt.correct === true;
  const ruleSaved = savedRules.includes(item.point_id);

  // Free production is the only place an appeal makes sense: the mechanical kinds
  // check against an authored list, and a disagreement there is a content bug.
  const appealable =
    !correct && (item.kind === "produce" || item.kind === "combine" || item.kind === "dictation");

  return (
    <div
      className={cn(
        "animate-fade-in rounded-xl border p-4",
        correct ? "border-success/40 bg-success/8" : "border-warning/40 bg-warning/8",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-semibold",
            correct ? "text-success" : "text-warning",
          )}
        >
          {correct ? <Check className="h-4 w-4" /> : <MessageSquareWarning className="h-4 w-4" />}
          {correct ? (attempt.attempt > 1 ? "Right, second time" : "Right") : "Not this one"}
        </span>
        {result?.next_label && <Badge tone="outline">Back in {result.next_label}</Badge>}
        {result?.stage_after != null && result.stage_before != null && result.stage_after > result.stage_before && (
          <Badge tone="success">Moved up a rung</Badge>
        )}
        {reveal?.checked === false && (
          <Badge tone="warning">Checked offline: rate yourself below</Badge>
        )}
        {attempt.appealed && correct && <Badge tone="success">Appeal accepted</Badge>}
      </div>

      {result?.twin_note && (
        <p className="mt-3 flex items-center gap-2 text-[13px] font-medium text-foreground">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          {result.twin_note}
        </p>
      )}

      {reveal?.why_key && (
        <p className="mt-3 text-[13px] leading-relaxed text-foreground">{reveal.why_key}</p>
      )}

      {reveal?.minimal_fix && (
        <p className="mt-3 text-[13px] leading-relaxed text-foreground">
          <span className="text-muted-foreground">
            {correct ? "Also fine, and slightly more natural:" : "The smallest fix:"}
          </span>{" "}
          <span className="font-medium">{reveal.minimal_fix}</span>
        </p>
      )}

      {reveal?.accepted && reveal.accepted.length > 0 && !correct && (
        <p className="mt-3 text-[13px] text-foreground">
          <span className="text-muted-foreground">This works:</span>{" "}
          <span className="font-medium">{reveal.accepted[0]}</span>
          {reveal.accepted.length > 1 && (
            <span className="text-muted-foreground">, and {reveal.accepted.length - 1} other wording{reveal.accepted.length > 2 ? "s" : ""}</span>
          )}
        </p>
      )}

      {reveal?.models && reveal.models.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[12px] font-medium text-muted-foreground">Three ways, all fine:</p>
          {reveal.models.map((model, i) => (
            <Example key={i}>{model}</Example>
          ))}
        </div>
      )}

      {reveal?.feed_forward && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-background/70 px-3 py-2 text-[13px] font-medium text-foreground">
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          {reveal.feed_forward}
        </p>
      )}

      {result?.note && <p className="mt-2 text-[12px] text-muted-foreground">{result.note}</p>}

      {result?.mastered && (
        <p className="mt-3 rounded-lg bg-success/12 px-3 py-2 text-[13px] font-medium text-success">
          That is this one mastered. You have now used it correctly in your own words.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={onContinue} autoFocus>
          {continueLabel}
        </Button>

        {reveal?.rule_line && (
          <Button
            variant="ghost"
            size="sm"
            disabled={ruleSaved}
            onClick={() =>
              void saveRule({
                pointId: item.point_id,
                ruleLine: reveal.rule_line ?? "",
                learnerSentence: correct ? null : null,
              })
            }
          >
            <BookmarkPlus className="h-4 w-4" />
            {ruleSaved ? "In your rules" : "Add to my rules"}
          </Button>
        )}

        {appealable && !appealOpen && !attempt.appealed && (
          <Button variant="ghost" size="sm" onClick={() => setAppealOpen(true)}>
            I think this is right
          </Button>
        )}
      </div>

      {appealOpen && !attempt.appealed && (
        <div className="mt-3 space-y-2 rounded-lg border border-border bg-background p-3">
          <label htmlFor="grammar-appeal" className="block text-[13px] font-medium text-foreground">
            What did you mean by it?
          </label>
          <textarea
            id="grammar-appeal"
            rows={2}
            value={meant}
            onChange={(e) => setMeant(e.target.value)}
            placeholder="In your own words, one line is enough"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={submitting}
              disabled={!meant.trim()}
              onClick={() => void appeal(meant.trim())}
            >
              Check it again
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAppealOpen(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Every appeal is read. If our item is wrong, that is how it gets fixed.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The signal beat (F3, beat 1). No answer, no explanation — a nudge toward the
 * words that decide it, and one more try. Around seven in ten corrections go
 * unnoticed when the answer arrives first, which is the whole reason this beat
 * exists.
 */
export function SignalPanel({ item, onRetry }: { item: SessionItem; onRetry: () => void }) {
  const where = item.decision_cue
    ? "Look at the part of the situation that is highlighted."
    : "Read the situation once more before you choose.";
  return (
    <div className="animate-fade-in rounded-xl border border-warning/40 bg-warning/8 p-4" role="status" aria-live="polite">
      <p className="text-sm font-medium text-warning">Not this one.</p>
      <p className="mt-1 text-[13px] text-foreground">{where} Then try again. You get one more go.</p>
      <Button className="mt-3" size="sm" onClick={onRetry} autoFocus>
        Try again
      </Button>
    </div>
  );
}
