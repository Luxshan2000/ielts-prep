import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Lightbulb } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { gradeAnswer } from "../../grading";
import { GappedText, Section, type CommitResult, type ExerciseBodyProps } from "./shared";
import type { ClozePayload } from "../../types";

/**
 * §5.2.2 cloze — the gap is cut out of the learner's OWN context sentence, which
 * is why this exercise only appears when that sentence contains the word.
 */
export function ClozeExercise({ item, revealed, onCommit, autoFocus }: ExerciseBodyProps) {
  const payload = item.exercise.payload as ClozePayload;
  const [answer, setAnswer] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [hint, setHint] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const committed = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const commit = (opts: { revealedOnly: boolean }) => {
    if (committed.current) return;
    committed.current = true;
    const grade = gradeAnswer(item.exercise, answer, {
      attempts: Math.max(1, attempts + 1),
      revealed: opts.revealedOnly,
      entry: item.entry,
    });
    const payloadResult: CommitResult = {
      correct: grade.correct,
      suggestedRating: grade.suggestedRating,
      detail: grade.detail,
    };
    setResult(payloadResult);
    onCommit(payloadResult);
  };

  // A bare reveal from the Space key / "Show answer" button.
  useEffect(() => {
    if (!revealed || committed.current) return;
    commit({ revealedOnly: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!answer.trim()) return;
    setAttempts((a) => a + 1);
    commit({ revealedOnly: false });
  };

  const expected = item.exercise.expected?.[0] ?? null;

  return (
    <div className="space-y-5">
      <Section title="Fill the gap">
        <p className="text-[17px] leading-relaxed">
          <GappedText text={payload.masked_sentence} filled={revealed ? expected : null} />
        </p>
      </Section>

      {!revealed && (
        <div className="space-y-3">
          <Input
            ref={inputRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type the missing word"
            aria-label="The missing word"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!answer.trim()} onClick={() => {
              setAttempts((a) => a + 1);
              commit({ revealedOnly: false });
            }}>
              Check
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setHint((h) => !h)}
              aria-expanded={hint}
            >
              <Lightbulb className="h-4 w-4" />
              {hint ? "Hide hint" : "Hint"}
            </Button>
            {hint && (
              <span className="text-[13px] text-muted-foreground">
                Starts with “{payload.hint_first_letter}”, {payload.hint_length} letters
                {payload.pos ? ` · ${payload.pos}` : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {revealed && (
        <div className="space-y-3 border-t border-border pt-4">
          {answer.trim() && (
            <p className="text-[13px]">
              <span className="text-muted-foreground">You typed </span>
              <span
                className={cn(
                  "font-medium",
                  result?.correct ? "text-success" : "text-destructive",
                )}
              >
                {answer.trim()}
              </span>
            </p>
          )}
          {payload.definition && (
            <Section title="Meaning">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {payload.definition}
              </p>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
