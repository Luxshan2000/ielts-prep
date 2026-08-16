/**
 * Compare — the learner's own answer beside a model of the same task.
 *
 * The shape does the teaching: the left column never changes while the band
 * selector moves, so the only variable on screen is the language. That is what
 * makes "the gap between 6 and 7 is not better ideas" visible rather than merely
 * asserted — the models cite the same figures, cover the same bullets or argue the
 * same position, in the same order.
 *
 * The screen is not finished at the bottom of the model. It ends with the one
 * change that would most raise this script and a timed retry attached to it,
 * because feedback with no "try it now" is a note, not coaching.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw, Square, Target } from "lucide-react";
import { Badge, Button, Tabs, type TabItem } from "@/components/ui";
import { cn } from "@/lib/cn";
import { AnnotatedModel, type MarkSelection } from "./AnnotatedModel";
import {
  bandPointHeading,
  clock,
  criterionCode,
  criterionName,
  criterionStyle,
  wordCount,
} from "./labels";
import { Callout, SectionHead } from "./primitives";
import { SentenceLadder } from "./SentenceLadder";
import { splitParagraphs } from "./spans";
import type { WritingTeaching } from "./types";
import { CRITERION_ORDER, type CriterionKey, type TaskType, type WritingAttempt } from "../../store";

/** Minutes named in a `rewrite_focus.drill` string, so the timer matches the copy. */
function drillSeconds(drill: string): number {
  const match = /(\d+)\s*(minute|min)/i.exec(drill);
  if (match) return Math.min(15, Math.max(1, Number(match[1]))) * 60;
  return 5 * 60;
}

function DrillTimer({ drill, onRetry }: { drill: string; onRetry?: () => void }) {
  const total = useMemo(() => drillSeconds(drill), [drill]);
  const [remaining, setRemaining] = useState(total);
  const [running, setRunning] = useState(false);
  const deadlineRef = useRef(0);

  useEffect(() => {
    setRemaining(total);
    setRunning(false);
  }, [total]);

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
    deadlineRef.current = Date.now() + total * 1000;
    setRemaining(total);
    setRunning(true);
  }, [total]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className={cn(
          "inline-flex min-w-[4.5rem] items-center justify-center rounded-md px-2 py-1 text-[15px] font-semibold tabular",
          running ? "bg-primary/12 text-primary" : "bg-muted text-foreground",
        )}
        role="timer"
        aria-live="off"
      >
        {clock(remaining)}
      </span>
      {running ? (
        <Button variant="outline" size="sm" onClick={() => setRunning(false)}>
          <Square className="h-3.5 w-3.5" aria-hidden="true" />
          Stop
        </Button>
      ) : (
        <Button size="sm" onClick={start}>
          {remaining === total ? (
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {remaining === total ? "Start the drill" : "Again"}
        </Button>
      )}
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Open a rewrite instead
        </Button>
      )}
    </div>
  );
}

export interface CompareWithModelProps {
  teaching: WritingTeaching;
  taskType: TaskType;
  /** The newest scored attempt on this prompt. Null when there is none yet. */
  attempt: WritingAttempt | null;
  onRewrite?: () => void;
  className?: string;
}

export function CompareWithModel({
  teaching,
  taskType,
  attempt,
  onRewrite,
  className,
}: CompareWithModelProps) {
  const answers = useMemo(
    () => (teaching.model_answers ?? []).slice().sort((a, b) => a.band_target - b.band_target),
    [teaching.model_answers],
  );

  const ownBand = attempt?.evaluation?.bands?.ta ?? null;
  const defaultBand = useMemo(() => {
    if (answers.length === 0) return "";
    const bands = answers.map((a) => a.band_target);
    const target = ownBand === null ? 7 : Math.floor(ownBand) + 1;
    const reachable = bands.filter((b) => b >= target);
    return String(reachable.length > 0 ? Math.min(...reachable) : Math.max(...bands));
  }, [answers, ownBand]);

  const [band, setBand] = useState(defaultBand);
  const [selected, setSelected] = useState<MarkSelection | null>(null);

  useEffect(() => {
    setBand(defaultBand);
    setSelected(null);
  }, [defaultBand]);

  if (answers.length === 0) return null;

  const model = answers.find((a) => String(a.band_target) === band) ?? answers[0];
  const swaps = model.band_target === 7 ? (teaching.swap_slots ?? []) : [];
  const lifts = model.what_lifts_it ?? [];
  const caps = model.what_caps_it ?? [];
  const points = lifts.length > 0 ? lifts : caps;
  const learnerParagraphs = splitParagraphs(attempt?.essay_text ?? "");

  const tabs: TabItem[] = answers.map((a) => ({
    value: String(a.band_target),
    label: `Band ${a.band_target}`,
  }));

  return (
    <div className={cn("space-y-5", className)}>
      {!attempt && (
        <Callout tone="info" title="No marked attempt on this prompt yet">
          The left column stays empty until one of your answers here has been marked. The models,
          the band points and the ladder all still work without one.
        </Callout>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* -------------------------------------------------- your answer --- */}
        <section className="space-y-2">
          <SectionHead title="Your answer" />
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            {learnerParagraphs.length > 0 ? (
              learnerParagraphs.map((paragraph, i) => (
                <p key={i} className="text-[14px] leading-8 text-foreground">
                  {paragraph}
                </p>
              ))
            ) : (
              <p className="text-[13px] leading-6 text-muted-foreground">
                Nothing to show here yet.
              </p>
            )}
          </div>
          {attempt && (
            <p className="text-[12px] tabular text-muted-foreground">
              {attempt.word_count} words
              {attempt.evaluation ? ` · overall band ${attempt.evaluation.overall_band}` : ""}
            </p>
          )}
        </section>

        {/* --------------------------------------------- one way to write it --- */}
        <section className="space-y-2">
          <SectionHead title="One way to write it" />
          <Tabs
            aria-label="Band versions of the same answer"
            items={tabs}
            value={String(model.band_target)}
            onChange={(v) => {
              setBand(v);
              setSelected(null);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={model.band_target >= 7 ? "primary" : "default"}>{model.label}</Badge>
            <span className="text-[12px] tabular text-muted-foreground">
              {wordCount(model.text)} words
            </span>
          </div>
          <AnnotatedModel
            text={model.text}
            annotations={model.annotations ?? []}
            swapSlots={swaps}
            selected={selected}
            onSelect={setSelected}
          />
        </section>
      </div>

      {/* ----------------------------------------------- the difference strip --- */}
      {points.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {bandPointHeading(model.band_target, lifts.length > 0)}
          </p>
          <ul className="grid gap-2 sm:grid-cols-3">
            {points.map((point, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    criterionStyle(point.criterion).chip,
                  )}
                  title={criterionName(point.criterion, taskType)}
                >
                  {criterionCode(point.criterion)}
                </span>
                <span className="text-[13px] leading-6 text-foreground">{point.point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --------------------------------------------- where you actually are --- */}
      {attempt?.evaluation && (
        <section className="space-y-2">
          <SectionHead
            title="Where your answer stands"
            hint="The four criteria from your own marked attempt, so the model above has something to be a step away from."
          />
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {CRITERION_ORDER.map((key: CriterionKey) => {
              const report = attempt.evaluation?.criteria[key];
              const value = report?.band ?? attempt.evaluation?.bands[key];
              return (
                <li key={key} className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {criterionName(key, taskType)}
                  </p>
                  <p className="mt-1 text-[20px] font-semibold tabular text-foreground">
                    {value === undefined ? "-" : value.toFixed(1)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {teaching.sentence_ladder && <SentenceLadder ladder={teaching.sentence_ladder} />}

      {/* --------------------------------------------------------- the retry --- */}
      {teaching.rewrite_focus && (
        <section className="space-y-2">
          <SectionHead title="Now do it yourself" />
          <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/8 p-4">
            <p className="flex items-start gap-2 text-[15px] font-semibold leading-7 text-foreground">
              <Target className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              {teaching.rewrite_focus.focus}
            </p>
            <p className="text-[13px] leading-6 text-muted-foreground">
              {teaching.rewrite_focus.why}
            </p>
            <p className="text-[13px] leading-6 text-foreground">{teaching.rewrite_focus.drill}</p>
            <DrillTimer drill={teaching.rewrite_focus.drill} onRetry={onRewrite} />
          </div>
        </section>
      )}
    </div>
  );
}
