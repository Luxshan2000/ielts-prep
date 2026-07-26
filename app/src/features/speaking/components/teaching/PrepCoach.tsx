/**
 * The guided preparation minute (DESIGN.md §7 F2).
 *
 * The plain notes textarea is replaced by a grid with one cell per cue-card bullet,
 * each hard-capped at forty characters. The cap is not advice, it is structure: a
 * cell that cannot hold a sentence cannot hold a script, and the commonest
 * self-inflicted wound in Part 2 is a candidate reading out prose they wrote in
 * sixty seconds instead of talking.
 *
 * Three things this screen deliberately does NOT do:
 *  - it never pre-fills the grid. `prep_plan.note_grid` is available behind a "show
 *    me an example" toggle and renders as greyed placeholder text only;
 *  - it never shows `prep_plan.trap` during the turn — a trap named mid-sentence is
 *    an interruption. It appears afterwards, as a check;
 *  - it never stores, transmits or logs the note text. Nothing leaves this component.
 *
 * The clock is either the learner's own (`useRehearsal`) or the server's, when the
 * caller passes `remainingMs` and `phase` down from the live session store.
 */

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Play, RotateCcw, SkipForward, Timer } from "lucide-react";
import { Badge, Button, CircularTimer, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { Callout } from "./primitives";
import { clock, segmentLabel } from "./labels";
import {
  PREP_SECONDS,
  TURN_SECONDS,
  phaseTotalSeconds,
  useRehearsal,
  type RehearsalPhase,
} from "./useRehearsal";
import type { CueCardPayload, PrepPlan, RecoveryMove, TimeSegment } from "./types";

const CELL_LIMIT = 40;

/** DESIGN.md §7 F2: the banner flips at 0:45 and again at 0:10. */
function prepBanner(remainingS: number, ideaPrompt: string): { title: string; body: string } {
  if (remainingS > 45) {
    return {
      title: "Choose now, not perfectly",
      body:
        ideaPrompt ||
        "Take the first usable memory and commit to it. Forty seconds hunting for a better story is the commonest way this minute is wasted.",
    };
  }
  if (remainingS > 10) {
    return {
      title: "Now note, don't write",
      body: "Keywords and arrows only. If a cell reads like a sentence, you will read it aloud.",
    };
  }
  return {
    title: "Read your grid once, top to bottom",
    body: "You are about to speak for two minutes. The grid is a map, not a script.",
  };
}

// ----------------------------------------------------------------- time plan ---

function TimePlanStrip({
  segments,
  elapsedS,
  running,
}: {
  segments: TimeSegment[];
  elapsedS: number;
  running: boolean;
}) {
  const total = segments[segments.length - 1]?.to_s ?? TURN_SECONDS;
  const active = segments.find((s) => elapsedS >= s.from_s && elapsedS < s.to_s) ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Where the two minutes go
        </p>
        {running && active && (
          <p className="text-[12px] font-medium text-foreground">
            {segmentLabel(active.segment)} — {active.goal}
          </p>
        )}
      </div>

      <div
        className="relative flex h-8 w-full overflow-hidden rounded-lg border border-border bg-muted/40"
        role="img"
        aria-label={segments
          .map((s) => `${segmentLabel(s.segment)}: ${clock(s.from_s)} to ${clock(s.to_s)}`)
          .join(". ")}
      >
        {segments.map((segment, i) => (
          <div
            key={segment.segment + i}
            style={{ width: `${((segment.to_s - segment.from_s) / total) * 100}%` }}
            className={cn(
              "flex min-w-0 items-center justify-center border-r border-border/70 px-1 last:border-r-0",
              running && active === segment ? "bg-primary/15" : "bg-transparent",
            )}
          >
            <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {segmentLabel(segment.segment)}
            </span>
          </div>
        ))}
        {running && (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 w-0.5 bg-primary transition-[left] duration-300 ease-linear"
            style={{ left: `${Math.min(100, (elapsedS / total) * 100)}%` }}
          />
        )}
      </div>

      {!running && (
        <ul className="grid gap-1 sm:grid-cols-2">
          {segments.map((segment, i) => (
            <li key={segment.segment + i} className="flex items-start gap-2 text-[12px]">
              <span className="w-[4.5rem] shrink-0 font-mono text-muted-foreground">
                {clock(segment.from_s)}–{clock(segment.to_s)}
              </span>
              <span className="min-w-0 text-foreground">{segment.goal}</span>
            </li>
          ))}
        </ul>
      )}
      {!running && segments.length === 5 && (
        <p className="text-[12px] text-muted-foreground">
          The bullets are not thirty seconds each. The last one carries the band, so it gets
          thirty-five.
        </p>
      )}
    </div>
  );
}

// ----------------------------------------------------------- recovery ladder ---

/**
 * DESIGN.md §7 F3. Appears silently past the one-minute mark of the turn, because
 * that is where a candidate who planned three bullets and no fourth runs dry. No
 * sound, no animation, no penalty — and never a stalling move like "that's an
 * interesting question": stalling produces nothing rateable and every examiner has
 * heard it four times that morning.
 */
function RecoveryLadder({ moves }: { moves: RecoveryMove[] }) {
  if (moves.length === 0) return null;
  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
      <p className="text-[12px] font-semibold text-foreground">Stuck? Climb one rung.</p>
      <ul className="space-y-1.5">
        {moves.map((move) => (
          <li key={move.rung} className="flex items-start gap-2 text-[13px] leading-6">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
              {move.rung}
            </span>
            <span className="min-w-0 text-foreground">{move.prompt}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- the screen ---

export interface PrepCoachProps {
  cueCard: CueCardPayload;
  prepPlan?: PrepPlan;
  timePlan?: TimeSegment[];
  recoveryMoves?: RecoveryMove[];
  bandMove?: string;
  /** Drive the clock from the live session instead of the local rehearsal one. */
  phase?: RehearsalPhase;
  remainingMs?: number;
  /** Fired once the learner finishes a full two-minute turn. */
  onTurnComplete?: () => void;
  className?: string;
}

export function PrepCoach({
  cueCard,
  prepPlan,
  timePlan = [],
  recoveryMoves = [],
  bandMove,
  phase: controlledPhase,
  remainingMs,
  onTurnComplete,
  className,
}: PrepCoachProps) {
  const local = useRehearsal();
  const controlled = controlledPhase !== undefined;

  const phase = controlled ? controlledPhase : local.phase;
  const remainingS = controlled
    ? Math.max(0, Math.round((remainingMs ?? 0) / 1000))
    : local.remainingS;
  const turnElapsedS = controlled
    ? phase === "turn"
      ? Math.max(0, TURN_SECONDS - remainingS)
      : phase === "done"
        ? TURN_SECONDS
        : 0
    : local.turnElapsedS;

  // Note text is component-local and stays that way — never lifted, never persisted,
  // never sent anywhere (DESIGN.md §7 F2: only counts may ever be logged).
  const [cells, setCells] = useState<string[]>(() => cueCard.bullets.map(() => ""));
  const [showExample, setShowExample] = useState(false);

  useEffect(() => {
    setCells(cueCard.bullets.map(() => ""));
    setShowExample(false);
  }, [cueCard.bullets]);

  useEffect(() => {
    if (phase === "done") onTurnComplete?.();
  }, [onTurnComplete, phase]);

  const examples = useMemo(() => {
    const grid = prepPlan?.note_grid ?? [];
    return cueCard.bullets.map((_, i) => grid.find((c) => c.bullet_index === i)?.cell ?? "");
  }, [cueCard.bullets, prepPlan?.note_grid]);

  const banner = prepBanner(remainingS, prepPlan?.idea_prompt ?? "");
  const preparing = phase === "prep";
  const speaking = phase === "turn";
  const finished = phase === "done";
  const total = phaseTotalSeconds(phase) || PREP_SECONDS;

  const setCell = (index: number, value: string) =>
    setCells((prev) => prev.map((c, i) => (i === index ? value.slice(0, CELL_LIMIT) : c)));

  return (
    <div className={cn("space-y-5", className)}>
      {/* ------------------------------------------------------------ header --- */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-4">
          <CircularTimer
            totalSec={total}
            remainingSec={remainingS}
            warnAtSec={preparing ? 10 : 20}
            paused={phase === "idle" || finished}
            size={64}
            label={preparing ? "Preparation" : speaking ? "Your turn" : "Part 2"}
          />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {phase === "idle"
                ? "Part 2 — not started"
                : preparing
                  ? "One minute to prepare"
                  : speaking
                    ? "Speak for two minutes"
                    : "Turn finished"}
            </p>
            <p className="mt-0.5 text-[15px] font-semibold leading-6 text-foreground">
              {cueCard.topic}
            </p>
          </div>
        </div>

        {!controlled && (
          <div className="flex flex-wrap gap-2">
            {phase === "idle" && (
              <Button onClick={local.start}>
                <Play className="h-4 w-4" aria-hidden="true" />
                Start the minute
              </Button>
            )}
            {(preparing || speaking) && (
              <Button variant="outline" onClick={local.advance}>
                <SkipForward className="h-4 w-4" aria-hidden="true" />
                {preparing ? "Start talking now" : "End the turn"}
              </Button>
            )}
            {(preparing || speaking || finished) && (
              <Button variant="ghost" onClick={local.reset}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reset
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ banner --- */}
      {preparing && (
        <Callout tone="teach" title={banner.title}>
          {banner.body}
        </Callout>
      )}
      {phase === "idle" && bandMove && (
        <Callout tone="teach" title="The one thing on this card">
          {bandMove}
        </Callout>
      )}

      {/* -------------------------------------------------------- note grid --- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-foreground">Your grid</h3>
          {examples.some((e) => e !== "") && (
            <Button variant="ghost" size="sm" onClick={() => setShowExample((v) => !v)}>
              {showExample ? (
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {showExample ? "Hide the example" : "Show me an example"}
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {cueCard.bullets.map((bullet, i) => {
            const value = cells[i] ?? "";
            const id = `br-prep-cell-${i}`;
            const last = i === cueCard.bullets.length - 1;
            return (
              <div
                key={i}
                className={cn(
                  "space-y-1.5 rounded-xl border p-3",
                  last ? "border-primary/40 bg-primary/8" : "border-border bg-card",
                  speaking && "opacity-70",
                )}
              >
                <label
                  htmlFor={id}
                  className="block text-[12px] font-medium leading-5 text-foreground"
                >
                  {bullet}
                </label>
                <Input
                  id={id}
                  value={value}
                  maxLength={CELL_LIMIT}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={showExample ? examples[i] : "keywords, arrows, abbreviations"}
                  onChange={(e) => setCell(i, e.target.value)}
                  aria-describedby={`${id}-count`}
                  className="font-mono text-[13px]"
                />
                <p
                  id={`${id}-count`}
                  className={cn(
                    "text-right text-[11px] tabular-nums",
                    value.length >= CELL_LIMIT ? "text-warning" : "text-muted-foreground",
                  )}
                >
                  {value.length}/{CELL_LIMIT}
                </p>
              </div>
            );
          })}
        </div>
        <p className="text-[12px] text-muted-foreground">
          Forty characters a cell, on purpose. Nothing you type here is saved, scored or sent
          anywhere.
        </p>
      </section>

      {speaking && turnElapsedS >= 64 && <RecoveryLadder moves={recoveryMoves} />}

      {/* -------------------------------------------------------- time plan --- */}
      {timePlan.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <TimePlanStrip segments={timePlan} elapsedS={turnElapsedS} running={speaking} />
        </section>
      )}

      {/* ----------------------------------------------------------- after --- */}
      {finished && (
        <div className="space-y-3">
          {prepPlan?.trap && (
            <Callout tone="warn" title="The trap on this card">
              {prepPlan.trap} Did you get past it?
            </Callout>
          )}
          {cueCard.bullets.length > 0 && (
            <Callout tone="info" title="One check before you move on">
              Say honestly whether you reached “{cueCard.bullets[cueCard.bullets.length - 1]}”. It
              is the bullet that carries the band, and it is the one candidates run out of time
              for.
            </Callout>
          )}
          {(cueCard.rounding_off ?? []).length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-border bg-card p-4">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <Timer className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                The examiner would ask you these next
              </p>
              <ul className="space-y-1 pl-4">
                {(cueCard.rounding_off ?? []).map((q, i) => (
                  <li key={i} className="list-disc text-[13px] leading-6 text-foreground">
                    {q}
                  </li>
                ))}
              </ul>
              <p className="text-[12px] text-muted-foreground">
                One or two sentences each. They come from your talk, not from the topic.
              </p>
            </div>
          )}
          <Badge tone="success">Attempt recorded — the model answers are unlocked</Badge>
        </div>
      )}
    </div>
  );
}
