/**
 * The typed items: gap fill, rewrite, fix-the-error, dictation, and word order.
 *
 * These carry most of the volume (DESIGN §1.4 — "S2 carries most of the
 * volume"), so they have to be fast: one field, Enter to check, a first-letter
 * hint after ten seconds for the gap fill, and no ceremony anywhere.
 *
 * Dictation is graded on its authored `scored_tokens` only. A learner who hears
 * `I'd been commuting` correctly and misspells *commuting* has passed the item
 * they were given, and telling them otherwise teaches them that the app is
 * unfair rather than that the reduction is hard to hear.
 */

import { useEffect, useRef, useState } from "react";
import { Lightbulb, RotateCcw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { Cue } from "../primitives";
import { useLineAudio } from "../useLineAudio";
import {
  AnswerField,
  ContextBlock,
  Stem,
  StemWithBlank,
  useTypedAnswer,
  type ItemViewProps,
} from "./shared";

/** The check button every typed item ends with. */
function CheckRow({
  onSubmit,
  disabled,
  canSubmit,
  children,
}: {
  onSubmit: () => void;
  disabled: boolean;
  canSubmit: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={onSubmit} disabled={disabled || !canSubmit} size="sm">
        Check
      </Button>
      {children}
    </div>
  );
}

// -------------------------------------------------------------- gap_fill ----

export function GapFillItem({ item, attempt, disabled, onAnswer }: ItemViewProps) {
  const payload = item.payload;
  const [value, setValue] = useTypedAnswer(item.id);
  const [hint, setHint] = useState(false);
  const [hintOffered, setHintOffered] = useState(false);

  // The first-letter hint is offered, never forced, and only after ten seconds —
  // long enough that it does not short-circuit retrieval.
  useEffect(() => {
    setHint(false);
    setHintOffered(false);
    const timer = window.setTimeout(() => setHintOffered(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [item.id]);

  const firstLetters = (attempt.reveal?.accepted?.[0] ?? "")
    .split(/\s+/)
    .map((word) => `${word.slice(0, 1)}${"·".repeat(Math.max(0, word.length - 1))}`)
    .join(" ");

  return (
    <div className="space-y-4">
      {payload.context && <ContextBlock>{payload.context}</ContextBlock>}
      <StemWithBlank stem={payload.stem ?? ""} filled={value || null} />
      {payload.lemma_hints && payload.lemma_hints.length > 0 && (
        <p className="text-[12px] text-muted-foreground">
          Use: <span className="font-mono text-foreground">{payload.lemma_hints.join(", ")}</span>
        </p>
      )}
      {!attempt.revealed && (
        <>
          <AnswerField
            value={value}
            onChange={setValue}
            onSubmit={() => onAnswer(value.trim())}
            disabled={disabled}
            label="Your answer"
            placeholder="Type the missing words"
          />
          <CheckRow onSubmit={() => onAnswer(value.trim())} disabled={disabled} canSubmit={!!value.trim()}>
            {hintOffered && !hint && (
              <Button variant="ghost" size="sm" onClick={() => setHint(true)}>
                <Lightbulb className="h-4 w-4" />
                Show the first letters
              </Button>
            )}
            {hint && firstLetters && (
              <span className="font-mono text-[13px] text-muted-foreground">{firstLetters}</span>
            )}
          </CheckRow>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------- transform ----

export function TransformItem({ item, attempt, disabled, onAnswer }: ItemViewProps) {
  const payload = item.payload;
  const [value, setValue] = useTypedAnswer(item.id);

  return (
    <div className="space-y-4">
      {payload.given && <ContextBlock>{payload.given}</ContextBlock>}
      {payload.instruction && <p className="text-sm text-foreground">{payload.instruction}</p>}
      {payload.starter && (
        <p className="font-mono text-[13px] text-muted-foreground">
          Start with: <span className="text-foreground">{payload.starter}</span>
        </p>
      )}
      {!attempt.revealed && (
        <>
          <AnswerField
            value={value}
            onChange={setValue}
            onSubmit={() => onAnswer(value.trim())}
            disabled={disabled}
            multiline
            label="Your rewrite"
            placeholder="Write the sentence"
          />
          <CheckRow onSubmit={() => onAnswer(value.trim())} disabled={disabled} canSubmit={!!value.trim()} />
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------- error_fix ----

/**
 * One error per item, and the learner replaces the marked span. The span is
 * shown from the start: hunting for the mistake is a different (and worse)
 * exercise — this one is about knowing the repair.
 */
export function ErrorFixItem({ item, attempt, disabled, onAnswer }: ItemViewProps) {
  const payload = item.payload;
  const [value, setValue] = useTypedAnswer(item.id);
  const sentence = payload.sentence ?? "";
  const span = payload.error_span ?? "";
  const at = span ? sentence.indexOf(span) : -1;

  return (
    <div className="space-y-4">
      <Stem>
        {at >= 0 ? (
          <>
            {sentence.slice(0, at)}
            <span className="rounded bg-destructive/12 px-1 text-muted-foreground line-through decoration-destructive/60">
              {span}
            </span>
            {sentence.slice(at + span.length)}
          </>
        ) : (
          sentence
        )}
      </Stem>
      {!attempt.revealed && (
        <>
          <AnswerField
            value={value}
            onChange={setValue}
            onSubmit={() => onAnswer(value.trim())}
            disabled={disabled}
            label="Your replacement"
            placeholder="Type what should be there instead"
          />
          <CheckRow onSubmit={() => onAnswer(value.trim())} disabled={disabled} canSubmit={!!value.trim()} />
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------- dictation ----

export function DictationItem({ item, attempt, disabled, onAnswer, onReplay }: ItemViewProps & {
  onReplay: () => void;
}) {
  const payload = item.payload;
  const [value, setValue] = useTypedAnswer(item.id);
  const [played, setPlayed] = useState(false);
  const audio = useLineAudio(payload.audio_url ?? null, payload.audio_text ?? "");
  const autoRef = useRef<string | null>(null);

  // Plays once, on its own, at natural speed — the point of the item is the first
  // hearing. Replays are the learner's to ask for, and they are logged, not punished.
  useEffect(() => {
    setPlayed(false);
    if (autoRef.current === item.id) return;
    autoRef.current = item.id;
    void audio.play(payload.speed ?? 1).then(() => setPlayed(true));
    // `audio` is a stable object from the hook; re-running on it would replay the line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const marks = attempt.reveal?.token_marks ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={audio.status === "unavailable"}
          onClick={() => {
            onReplay();
            void audio.play(payload.speed ?? 1);
          }}
        >
          <Volume2 className={cn("h-4 w-4", audio.status === "playing" && "animate-pulse")} />
          {played ? "Play it again" : "Play"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={audio.status === "unavailable"}
          onClick={() => {
            onReplay();
            void audio.play(payload.replay_slow ?? 0.8);
          }}
        >
          <RotateCcw className="h-4 w-4" />
          Slower
        </Button>
        {audio.status === "unavailable" && (
          <span className="text-[12px] text-muted-foreground">
            This computer has no speech voice installed, so the line cannot be played. The written
            version is below.
          </span>
        )}
      </div>

      {audio.status === "unavailable" && payload.audio_text && (
        <ContextBlock>{payload.audio_text}</ContextBlock>
      )}

      {payload.scored_tokens && payload.scored_tokens.length > 0 && (
        <p className="text-[12px] text-muted-foreground">
          Only these are marked:{" "}
          <span className="font-mono text-foreground">{payload.scored_tokens.join(" · ")}</span>. A
          typo anywhere else costs you nothing.
        </p>
      )}

      {!attempt.revealed ? (
        <>
          <AnswerField
            value={value}
            onChange={setValue}
            onSubmit={() => onAnswer(value.trim())}
            disabled={disabled}
            multiline
            label="What you heard"
            placeholder="Write what you heard"
          />
          <CheckRow onSubmit={() => onAnswer(value.trim())} disabled={disabled} canSubmit={!!value.trim()} />
        </>
      ) : (
        <div className="space-y-2">
          <Stem>
            <Cue text={payload.audio_text ?? ""} cue={item.decision_cue ?? null} />
          </Stem>
          {marks && (
            <div className="flex flex-wrap gap-1.5">
              {marks.map((mark, i) => (
                <span
                  key={i}
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[12px]",
                    mark.correct ? "bg-success/12 text-success" : "bg-warning/15 text-warning",
                  )}
                >
                  {mark.token}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- order ----

/**
 * Draggable in spirit, tappable in practice: tap a chip to add it, tap it in the
 * line to take it back. Tapping beats dragging for keyboard users and for anyone
 * on a trackpad, and the operation being modelled — word order — is identical.
 */
export function OrderItem({ item, attempt, disabled, onAnswer }: ItemViewProps) {
  const payload = item.payload;
  const tokens = payload.tokens ?? [];
  const [placed, setPlaced] = useState<number[]>([]);
  useEffect(() => setPlaced([]), [item.id]);

  const remaining = tokens.map((_, i) => i).filter((i) => !placed.includes(i));

  return (
    <div className="space-y-4">
      {payload.context && <ContextBlock>{payload.context}</ContextBlock>}

      <div
        className="min-h-[3.25rem] rounded-lg border border-dashed border-border bg-background p-2"
        aria-label="Your sentence"
      >
        <div className="flex flex-wrap gap-1.5">
          {placed.length === 0 && (
            <span className="px-1 py-1 text-[13px] text-muted-foreground">
              Tap the words below, in order.
            </span>
          )}
          {placed.map((tokenIndex, position) => (
            <button
              key={`${tokenIndex}-${position}`}
              type="button"
              disabled={disabled}
              onClick={() => setPlaced(placed.filter((_, p) => p !== position))}
              className="rounded-md border border-primary/40 bg-primary/8 px-2 py-1 text-[13px] text-foreground hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tokens[tokenIndex]}
            </button>
          ))}
        </div>
      </div>

      {!attempt.revealed && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {remaining.map((tokenIndex) => (
              <button
                key={tokenIndex}
                type="button"
                disabled={disabled}
                onClick={() => setPlaced([...placed, tokenIndex])}
                className="rounded-md border border-border bg-muted px-2 py-1 text-[13px] text-foreground hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {tokens[tokenIndex]}
              </button>
            ))}
          </div>
          <CheckRow
            onSubmit={() => onAnswer(placed)}
            disabled={disabled}
            canSubmit={placed.length === tokens.length}
          >
            {placed.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setPlaced([])} disabled={disabled}>
                Clear
              </Button>
            )}
          </CheckRow>
        </>
      )}
    </div>
  );
}
