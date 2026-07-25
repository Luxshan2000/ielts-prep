import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { gradeAnswer } from "../../grading";
import { WordAudioButton } from "../WordAudioButton";
import { Headword, Section, type CommitResult, type ExerciseBodyProps } from "./shared";
import type { AudioRecallPayload } from "../../types";

/**
 * §5.2.5 audio recall: hear the word, type it. Only reached by mature cards, so
 * the spelling test is the point.
 */
export function AudioRecallExercise({ item, revealed, onCommit, autoFocus }: ExerciseBodyProps) {
  const payload = item.exercise.payload as AudioRecallPayload;
  const [answer, setAnswer] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [result, setResult] = useState<CommitResult | null>(null);
  const committed = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const commit = (revealedOnly: boolean) => {
    if (committed.current) return;
    committed.current = true;
    const grade = gradeAnswer(item.exercise, answer, {
      attempts: Math.max(1, attempts + 1),
      revealed: revealedOnly,
      entry: item.entry,
    });
    const next: CommitResult = {
      correct: grade.correct,
      suggestedRating: grade.suggestedRating,
      detail: grade.detail,
    };
    setResult(next);
    onCommit(next);
  };

  useEffect(() => {
    if (!revealed || committed.current) return;
    commit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!answer.trim()) return;
    setAttempts((a) => a + 1);
    commit(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-6">
        <WordAudioButton
          mediaPath={payload.audio_url}
          text={item.entry.headword}
          label="Play the word"
          variant="secondary"
          size="lg"
          autoPlay
        />
        <p className="text-[11px] text-muted-foreground">
          Play it as many times as you need before you answer.
        </p>
      </div>

      {!revealed ? (
        <div className="space-y-3">
          <Input
            ref={inputRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type what you heard"
            aria-label="The word you heard"
            autoComplete="off"
            spellCheck={false}
          />
          <Button
            size="sm"
            disabled={!answer.trim()}
            onClick={() => {
              setAttempts((a) => a + 1);
              commit(false);
            }}
          >
            Check
          </Button>
        </div>
      ) : (
        <div className="space-y-4 border-t border-border pt-4">
          <Headword
            headword={item.entry.headword}
            ipa={item.entry.ipa}
            pos={payload.pos}
            size="md"
          />
          {answer.trim() && (
            <p className="text-[13px]">
              <span className="text-muted-foreground">You typed </span>
              <span className={cn("font-medium", result?.correct ? "text-success" : "text-destructive")}>
                {answer.trim()}
              </span>
            </p>
          )}
          {payload.replay_sentence && (
            <Section title="In context">
              <p className="rounded-lg bg-muted/60 p-3 text-[13px] italic leading-relaxed">
                {payload.replay_sentence}
              </p>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
