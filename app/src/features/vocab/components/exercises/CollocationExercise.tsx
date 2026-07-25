import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { gradeAnswer, normalizeAnswer } from "../../grading";
import { GappedText, Section, type ExerciseBodyProps } from "./shared";
import type { CollocationPayload } from "../../types";

/**
 * §5.2.4 collocation match: which headword completes all of these fragments?
 * Decoys are other words from the learner's own bank, so a wrong pick is a real
 * confusion rather than noise.
 */
export function CollocationExercise({ item, revealed, onCommit }: ExerciseBodyProps) {
  const payload = item.exercise.payload as CollocationPayload;
  const [picked, setPicked] = useState<string | null>(null);
  const committed = useRef(false);

  const expected = item.exercise.expected?.[0] ?? null;

  useEffect(() => {
    if (!revealed || committed.current) return;
    committed.current = true;
    const grade = gradeAnswer(item.exercise, "", { revealed: true, entry: item.entry });
    onCommit({
      correct: grade.correct,
      suggestedRating: grade.suggestedRating,
      detail: grade.detail,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  const choose = (option: string) => {
    if (committed.current) return;
    committed.current = true;
    setPicked(option);
    const grade = gradeAnswer(item.exercise, option, { entry: item.entry });
    onCommit({
      correct: grade.correct,
      suggestedRating: grade.suggestedRating,
      detail: grade.detail,
    });
  };

  return (
    <div className="space-y-5">
      <Section title="Which word completes all of these?">
        <ul className="space-y-2">
          {payload.fragments.map((fragment, i) => (
            <li
              key={`${fragment}-${i}`}
              className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[15px]"
            >
              <GappedText text={fragment} filled={revealed ? expected : null} />
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid gap-2 sm:grid-cols-2">
        {payload.options.map((option) => {
          const isAnswer = expected !== null && normalizeAnswer(option) === expected;
          const isPicked = picked === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => choose(option)}
              disabled={revealed}
              aria-pressed={isPicked}
              className={cn(
                "flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5 text-left text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
                "disabled:pointer-events-none",
                revealed && isAnswer && "border-success bg-success/10 text-success",
                revealed && isPicked && !isAnswer && "border-destructive bg-destructive/10 text-destructive",
                revealed && !isAnswer && !isPicked && "border-border opacity-60",
                !revealed && "border-border hover:border-primary/60 hover:bg-accent",
              )}
            >
              <span className="truncate">{option}</span>
              {revealed && isAnswer && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              {revealed && isPicked && !isAnswer && <X className="h-4 w-4 shrink-0" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {revealed && payload.definition && (
        <Section title="Meaning">
          <p className="text-[13px] leading-relaxed text-muted-foreground">{payload.definition}</p>
        </Section>
      )}
    </div>
  );
}
