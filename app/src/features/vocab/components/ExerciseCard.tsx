import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Badge, Button, Card, CardContent } from "@/components/ui";
import { cn } from "@/lib/cn";
import { EXERCISE_META, MATURITY_META, formatDue, renderEmphasis } from "../labels";
import type { ExerciseKind, QueueItem } from "../types";
import { AudioRecallExercise } from "./exercises/AudioRecallExercise";
import { ClozeExercise } from "./exercises/ClozeExercise";
import { CollocationExercise } from "./exercises/CollocationExercise";
import { FlipExercise } from "./exercises/FlipExercise";
import { SpeakingDrillExercise } from "./exercises/SpeakingDrillExercise";
import { UseInSentenceExercise } from "./exercises/UseInSentenceExercise";
import { RatingBar } from "./RatingBar";
import type { CommitResult, ExerciseBodyProps } from "./exercises/shared";

const BODIES: Record<ExerciseKind, (props: ExerciseBodyProps) => JSX.Element> = {
  flip: FlipExercise,
  cloze: ClozeExercise,
  use_in_sentence: UseInSentenceExercise,
  collocation: CollocationExercise,
  audio_recall: AudioRecallExercise,
  speaking_drill: SpeakingDrillExercise,
};

const REVEAL_LABEL: Record<ExerciseKind, string> = {
  flip: "Show answer",
  cloze: "Show answer",
  use_in_sentence: "Skip the check and rate myself",
  collocation: "Show answer",
  audio_recall: "Show answer",
  speaking_drill: "I said it",
};

export interface ExerciseCardProps {
  item: QueueItem;
  onRate: (rating: number, meta: { correct: boolean | null; elapsedMs: number }) => void;
  submitting: boolean;
  /** Sidecar error from the last review POST — the rating buttons stay live to retry. */
  error?: string | null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

/**
 * One review card: the exercise, then the four ratings.
 *
 * Mount this with `key={item.card_id}` — every card starts from a clean slate and
 * the per-card timer that feeds `elapsed_ms` starts at mount.
 */
export function ExerciseCard({ item, onRate, submitting, error }: ExerciseCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [busyRating, setBusyRating] = useState<number | null>(null);
  const startedAt = useRef(Date.now());

  const kind = item.exercise_type;
  const Body = BODIES[kind] ?? FlipExercise;
  const meta = EXERCISE_META[kind] ?? EXERCISE_META.flip;
  const Icon = meta.icon;

  const onCommit = useCallback((commit?: CommitResult) => {
    setRevealed(true);
    if (commit) setResult(commit);
  }, []);

  const rate = useCallback(
    (rating: number) => {
      setBusyRating(rating);
      onRate(rating, {
        correct: result?.correct ?? null,
        elapsedMs: Date.now() - startedAt.current,
      });
    },
    [onRate, result],
  );

  useEffect(() => {
    setBusyRating(null);
  }, [item.card_id]);

  // Space reveals, 1–4 rate. Typing in a field always wins.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (event.key === " " || event.code === "Space") {
        if (!revealed) {
          event.preventDefault();
          setRevealed(true);
        }
        return;
      }
      if (revealed && !submitting && ["1", "2", "3", "4"].includes(event.key)) {
        event.preventDefault();
        rate(Number(event.key));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rate, revealed, submitting]);

  const maturity = item.entry.srs?.maturity ?? "new";
  const maturityMeta = MATURITY_META[maturity];

  return (
    <Card className="overflow-visible">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary" className="gap-1.5">
            <Icon className="h-3 w-3" aria-hidden="true" />
            {meta.label}
          </Badge>
          <Badge tone={maturityMeta.tone}>{maturityMeta.label}</Badge>
          {item.entry.srs?.due && (
            <span className="text-[11px] text-muted-foreground">
              was {formatDue(item.entry.srs.due)}
            </span>
          )}
          {item.entry.srs && item.entry.srs.lapses > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {item.entry.srs.lapses} lapse{item.entry.srs.lapses === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <p className="text-[13px] text-muted-foreground">
          {renderEmphasis(item.exercise.prompt || meta.hint)}
        </p>

        <Body item={item} revealed={revealed} onCommit={onCommit} autoFocus />

        <div className="space-y-3 border-t border-border pt-4">
          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[13px] text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {error} — press a rating again to retry.
              </span>
            </p>
          )}

          {revealed ? (
            <>
              {result?.detail && (
                <p
                  className={cn(
                    "text-[13px]",
                    result.correct === true && "text-success",
                    result.correct === false && "text-destructive",
                    (result.correct === null || result.correct === undefined) &&
                      "text-muted-foreground",
                  )}
                >
                  {result.detail}
                </p>
              )}
              <RatingBar
                intervals={item.intervals}
                onRate={rate}
                suggested={result?.suggestedRating ?? null}
                disabled={submitting}
                busyRating={busyRating}
              />
              <p className="text-[11px] text-muted-foreground">
                Each button shows when the card comes back. Keys 1–4.
              </p>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={() => setRevealed(true)}>
                {REVEAL_LABEL[kind] ?? "Show answer"}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Press <kbd className="rounded border border-border px-1">Space</kbd>
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
