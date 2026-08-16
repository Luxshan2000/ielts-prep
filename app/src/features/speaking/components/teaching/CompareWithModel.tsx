/**
 * Compare — the learner's own attempt beside a model of the same card.
 *
 * DESIGN.md §7 F1 calls this the single most important surface in the module, and
 * the shape is doing the teaching: the left column never changes while the band
 * selector moves, so the only variable on screen is the language. That is what makes
 * "the gap between 6 and 7 is not a better story" visible rather than assertable.
 *
 * The per-criterion strip underneath comes from the scored report — the same
 * evaluation JSON the report screen renders, re-cut as *gaps and next actions* so it
 * reads as instructions rather than a verdict.
 *
 * Nothing here is reachable before an attempt exists; the caller owns that gate.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Mic, Play, RotateCcw, Square, Target } from "lucide-react";
import { Badge, Button, EmptyState, Tabs, type TabItem } from "@/components/ui";
import { cn } from "@/lib/cn";
import { AnnotatedModel, type MarkSelection } from "./AnnotatedModel";
import { Callout } from "./primitives";
import {
  bandPointHeading,
  bandTabLabel,
  clock,
  criterionLabel,
  criterionStyle,
  KIND_LABEL,
  ladderStepKey,
} from "./labels";
import { wordCount } from "./spans";
import type { Part2Teaching } from "./types";

const DRILL_SECONDS = 45;

/** One criterion's standing, flattened out of the report for this screen. */
export interface CriterionGap {
  criterion: string;
  band: number | null;
  /** The report's `improvements` — verbs, not adjectives. */
  nextActions: string[];
}

// ------------------------------------------------------------- transfer drill ---

/**
 * The compare screen is not finished until the learner has re-produced the moves
 * with their own content (DESIGN.md §7 F1). Forty-five seconds, out loud, no
 * recording: recording here would need the whole WebRTC stack for a drill whose
 * value is entirely in the speaking, not in the playback.
 */
function TransferDrill({ instruction }: { instruction: string }) {
  const [remaining, setRemaining] = useState(DRILL_SECONDS);
  const [running, setRunning] = useState(false);
  const deadlineRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) setRunning(false);
    };
    const handle = window.setInterval(tick, 250);
    tick();
    return () => window.clearInterval(handle);
  }, [running]);

  const start = useCallback(() => {
    deadlineRef.current = Date.now() + DRILL_SECONDS * 1000;
    setRemaining(DRILL_SECONDS);
    setRunning(true);
  }, []);

  return (
    <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/8 p-4">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        <Target className="h-4 w-4 text-primary" aria-hidden="true" />
        Now transfer it
      </p>
      <p className="text-[13px] leading-6 text-foreground">{instruction}</p>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="font-mono text-2xl tabular-nums text-foreground"
          aria-live="off"
          aria-label={`${remaining} seconds remaining`}
        >
          {clock(remaining)}
        </span>
        {running ? (
          <Button variant="outline" onClick={() => setRunning(false)}>
            <Square className="h-4 w-4" aria-hidden="true" />
            Stop
          </Button>
        ) : (
          <Button onClick={start}>
            {remaining === DRILL_SECONDS ? (
              <Play className="h-4 w-4" aria-hidden="true" />
            ) : (
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            )}
            {remaining === DRILL_SECONDS ? "Start speaking" : "Go again"}
          </Button>
        )}
        <span className="text-[12px] text-muted-foreground">
          Out loud, on your own. Nothing is recorded or marked here.
        </span>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- the comparison ---

export interface CompareWithModelProps {
  /** The learner's own Part 2 transcript, already joined into one block. */
  learnerText: string;
  /** Optional replay control — the report passes its `TurnAudio` in here. */
  learnerAudio?: ReactNode;
  teaching: Part2Teaching;
  cardTitle: string;
  gaps?: CriterionGap[];
  /** True when the model could not judge pronunciation from text alone. */
  pronunciationBlind?: boolean;
  className?: string;
}

export function CompareWithModel({
  learnerText,
  learnerAudio,
  teaching,
  cardTitle,
  gaps = [],
  pronunciationBlind = false,
  className,
}: CompareWithModelProps) {
  const answers = useMemo(
    () => (teaching.model_answers ?? []).slice().sort((a, b) => a.band_target - b.band_target),
    [teaching.model_answers],
  );

  const defaultBand = useMemo(() => {
    if (answers.length === 0) return "";
    const seven = answers.find((a) => a.band_target === 7);
    return String((seven ?? answers[0]).band_target);
  }, [answers]);

  const [band, setBand] = useState(defaultBand);
  const [selected, setSelected] = useState<MarkSelection | null>(null);

  useEffect(() => {
    setBand(defaultBand);
    setSelected(null);
  }, [defaultBand]);

  if (answers.length === 0) {
    return (
      <EmptyState
        icon={Mic}
        title="Nothing to compare against"
        description="This card has no model answers, so there is no second column. Any set carrying the teaching payload will show one here."
        className={className}
      />
    );
  }

  const answer = answers.find((a) => String(a.band_target) === band) ?? answers[0];
  const swaps = answer.band_target === 7 ? (teaching.swap_slots ?? []) : [];
  const points =
    (answer.what_lifts_it ?? []).length > 0
      ? (answer.what_lifts_it ?? [])
      : (answer.what_caps_it ?? []);
  const ladder = answers.map((a) => a.band_target);
  const pointsHeading = bandPointHeading(
    answer.band_target,
    ladder,
    (answer.what_lifts_it ?? []).length > 0,
  );
  const note =
    selected?.layer === "annotation" ? (answer.annotations ?? [])[selected.index] : null;

  const tabs: TabItem[] = answers.map((a) => ({
    value: String(a.band_target),
    label: bandTabLabel(a.band_target, ladder),
  }));
  // F1's rankable payload: the single next change for whoever is standing on this rung.
  const step = teaching.ladder_note?.[ladderStepKey(answer.band_target)];

  return (
    <div className={cn("space-y-5", className)}>
      {teaching.band_move && (
        <Callout tone="teach" title="The one thing to change on this card">
          {teaching.band_move}
        </Callout>
      )}

      {step && (
        <Callout
          tone="teach"
          title={`From band ${answer.band_target} to ${answer.band_target + 1}`}
        >
          {step}
        </Callout>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ------------------------------------------------- the learner's own --- */}
        <section className="space-y-3" aria-label="Your answer">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-foreground">Your answer</h3>
            <span className="text-[12px] text-muted-foreground">
              {wordCount(learnerText)} words
            </span>
          </div>
          {learnerAudio}
          {learnerText.trim() === "" ? (
            <p className="rounded-xl border border-border bg-muted/40 p-4 text-[13px] leading-6 text-muted-foreground">
              No Part 2 transcript was saved for this attempt. The comparison still works. Read
              the model, then say your own version out loud.
            </p>
          ) : (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-[14px] leading-7 text-foreground">
              {learnerText.split(/\n{2,}/).map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------- the model --- */}
        <section className="space-y-3" aria-label="One way to say it">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-foreground">One way to say it</h3>
            <span className="text-[12px] text-muted-foreground">
              {answer.approx_seconds ? `about ${answer.approx_seconds}s · ` : ""}
              {wordCount(answer.transcript)} words
            </span>
          </div>

          <Tabs
            aria-label="Band versions of the model answer"
            items={tabs}
            value={String(answer.band_target)}
            onChange={(v) => {
              setBand(v);
              setSelected(null);
            }}
          />

          <Badge tone={answer.band_target >= 7 ? "primary" : "default"}>{answer.label}</Badge>

          <div className="rounded-xl border border-border bg-card p-4">
            <AnnotatedModel
              transcript={answer.transcript}
              annotations={answer.annotations ?? []}
              swapSlots={swaps}
              selected={selected}
              onSelect={setSelected}
              showSwaps={swaps.length > 0}
            />
          </div>

          {note && (
            <div className="rounded-xl border border-primary/40 bg-primary/8 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {KIND_LABEL[note.kind] ?? note.kind} · {criterionLabel(note.criterion)}
              </p>
              <p className="mt-1 text-[14px] font-semibold text-foreground">{note.label}</p>
              <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">{note.why}</p>
            </div>
          )}
        </section>
      </div>

      {/* --------------------------------------------- what changes with band --- */}
      {points.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {pointsHeading}
          </p>
          <ul className="grid gap-2 sm:grid-cols-3">
            {points.map((point, i) => {
              const style = criterionStyle(point.criterion);
              return (
                <li key={i} className="space-y-1">
                  <span
                    className={cn(
                      "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      style.chip,
                    )}
                  >
                    {criterionLabel(point.criterion)}
                  </span>
                  <p className="text-[13px] leading-6 text-foreground">{point.point}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ------------------------------------------------ your own gaps ------- */}
      {gaps.length > 0 && (
        <section className="space-y-3" aria-label="Your gaps and next actions">
          <h3 className="text-[13px] font-semibold text-foreground">
            Where your version differs, and what to do next
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {gaps.map((gap) => {
              const style = criterionStyle(gap.criterion);
              const blind = pronunciationBlind && gap.criterion.toUpperCase() === "PRON";
              return (
                <div
                  key={gap.criterion}
                  className="space-y-2 rounded-xl border border-border bg-card p-3.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn("text-[13px] font-semibold", style.text)}>
                      {criterionLabel(gap.criterion)}
                    </span>
                    <span className="font-mono text-[13px] tabular-nums text-muted-foreground">
                      {gap.band === null ? "-" : gap.band.toFixed(1)}
                    </span>
                  </div>
                  {blind && (
                    <p className="text-[12px] leading-5 text-muted-foreground">
                      Judged from the transcript only, so treat this one as indicative.
                    </p>
                  )}
                  {gap.nextActions.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground">
                      Nothing specific was flagged here.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {gap.nextActions.map((action, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-[13px] leading-6 text-foreground"
                        >
                          <span
                            aria-hidden="true"
                            className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", style.dot)}
                          />
                          <span className="min-w-0">{action}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {teaching.transfer_drill && <TransferDrill instruction={teaching.transfer_drill} />}

      <p className="text-[12px] leading-5 text-muted-foreground">
        The model is one way to say it about {cardTitle.toLowerCase()}, not the answer. The
        shaded phrases belong to whoever wrote it; the moves are yours to take.
      </p>
    </div>
  );
}
