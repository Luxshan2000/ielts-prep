import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Badge, Button, CircularTimer, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { isAnswered } from "../store";
import type { ListeningPart } from "../types";
import { SpellingNotice } from "./SpellingNotice";

/** 07 §1 — we model computer-delivered IELTS: a 2-minute check, not a 10-minute transfer. */
export const CHECK_SECONDS = 120;

export interface CheckStepProps {
  parts: ListeningPart[];
  answers: Record<string, string>;
  onAnswer: (number: number, value: string) => void;
  /** Exam mode runs the countdown and auto-submits at 0:00. */
  exam: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onBack?: () => void;
}

export function CheckStep({
  parts,
  answers,
  onAnswer,
  exam,
  submitting,
  onSubmit,
  onBack,
}: CheckStepProps) {
  const [remaining, setRemaining] = useState(CHECK_SECONDS);
  const submitted = useRef(false);

  const rows = useMemo(
    () =>
      parts.flatMap((part) =>
        part.questions.map((question) => ({
          number: question.number,
          part: part.part,
          prompt: question.prompt ?? "",
        })),
      ),
    [parts],
  );

  useEffect(() => {
    if (!exam) return undefined;
    const id = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(id);
  }, [exam]);

  useEffect(() => {
    if (!exam || remaining > 0 || submitted.current || submitting) return;
    submitted.current = true;
    onSubmit();
  }, [exam, remaining, submitting, onSubmit]);

  const blank = rows.filter((row) => !isAnswered(answers[String(row.number)]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Transfer and check</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {exam
                ? "The audio has finished. You have two minutes to check every answer — fix spelling, fill blanks, then submit. The test submits itself at 0:00."
                : "Check every answer before you submit. Nothing is timed in practice mode."}
            </p>
          </div>
        </div>
        {exam && (
          <div className="flex items-center gap-3">
            <CircularTimer
              totalSec={CHECK_SECONDS}
              remainingSec={remaining}
              warnAtSec={30}
              label="Check step"
            />
            <span className="text-sm font-semibold tabular-nums">{formatDuration(remaining)}</span>
          </div>
        )}
      </div>

      <SpellingNotice />

      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Badge tone={blank.length ? "warning" : "success"}>
          {blank.length ? `${blank.length} unanswered` : "All questions answered"}
        </Badge>
        {blank.length > 0 && (
          <span className="text-muted-foreground">
            Blank answers score nothing — a guess costs you nothing either.
          </span>
        )}
      </div>

      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {rows.map((row) => {
          const value = answers[String(row.number)] ?? "";
          const empty = !isAnswered(value);
          return (
            <div
              key={row.number}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2 py-1.5",
                empty ? "border-warning/50 bg-warning/8" : "border-border",
              )}
            >
              <span className="w-7 shrink-0 text-right text-[12px] font-semibold tabular-nums text-muted-foreground">
                {row.number}
              </span>
              <Input
                value={value}
                onChange={(e) => onAnswer(row.number, e.target.value)}
                aria-label={`Answer for question ${row.number}, part ${row.part}`}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="h-8"
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button onClick={onSubmit} loading={submitting}>
          Submit answers
        </Button>
        {onBack && (
          <Button variant="outline" onClick={onBack} disabled={submitting}>
            Back to the questions
          </Button>
        )}
        <span className="text-[12px] text-muted-foreground">
          Marking is instant and offline — nothing leaves this machine.
        </span>
      </div>
    </div>
  );
}
