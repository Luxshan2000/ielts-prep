/**
 * The band ladder: the same answer at bands 6, 7 and 8, annotated — plus the two
 * gates that stand in front of it.
 *
 * All three models say the same thing with the same content. On a chart they cite
 * the same figures and use the same grouping; on a letter they give the same three
 * bullet specifics; on an essay they argue the same position from the same two
 * ideas. That is the whole design (DESIGN.md §5.1): it isolates language from
 * content, so a learner cannot conclude that band 8 means better ideas. The band
 * selector therefore swaps only the text — nothing else on the screen moves.
 *
 * **Gate one: the attempt.** A model read before the attempt is a template to
 * memorise, and memorised language is exactly what the descriptors refuse to credit.
 *
 * **Gate two: the noticing.** Unlocking does not open the model. It opens a
 * find-the-difference task — one paragraph at band 6 beside the same paragraph at
 * band 7, and a box to say what changed. Ten seconds of friction turns reading into
 * noticing, and the noticing is where the effect lives (DESIGN.md §9 F1).
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Eye, Lock, PenLine, Sparkles } from "lucide-react";
import { Badge, Button, EmptyState, Tabs, Textarea, type TabItem } from "@/components/ui";
import { cn } from "@/lib/cn";
import { AnnotatedModel, sameSelection, type MarkSelection } from "./AnnotatedModel";
import {
  bandPointHeading,
  bankableType,
  criterionCode,
  criterionName,
  criterionStyle,
  kindLabel,
  wordCount,
} from "./labels";
import { AddToBank } from "./primitives";
import { splitParagraphs } from "./spans";
import type { WritingModelAnswer, WritingTeaching } from "./types";
import type { TaskType } from "../../store";

export const GATE_REASON =
  "The model answers unlock once you have written this task yourself. Reading one first turns preparation into memorising, and memorised language is the one thing the descriptors will not credit.";

// ---------------------------------------------------------------- attempt gate ---

export interface AttemptGateProps {
  children: ReactNode;
  locked: boolean;
  reason?: string;
  onWrite?: () => void;
  writeLabel?: string;
}

/**
 * Locked is the default and the lock is the pedagogy, not a paywall. One line of
 * reason, one button out, no scolding.
 */
export function AttemptGate({
  children,
  locked,
  reason = GATE_REASON,
  onWrite,
  writeLabel = "Write this one first",
}: AttemptGateProps) {
  if (!locked) return <>{children}</>;
  return (
    <EmptyState
      icon={Lock}
      title="Have a go first"
      description={reason}
      action={
        onWrite && (
          <Button onClick={onWrite}>
            <PenLine className="h-4 w-4" aria-hidden="true" />
            {writeLabel}
          </Button>
        )
      }
    />
  );
}

// ----------------------------------------------------------------- notice gate ---

export interface NoticeGateProps {
  answers: WritingModelAnswer[];
  /** What the learner has already written into the gate this session, if anything. */
  answer: string;
  onAnswerChange: (value: string) => void;
  onPass: () => void;
}

/** Which paragraph of the two models to put side by side. */
function comparablePair(answers: WritingModelAnswer[]): { six: string; seven: string } | null {
  const six = answers.find((a) => a.band_target === 6);
  const seven = answers.find((a) => a.band_target === 7);
  if (!six || !seven) return null;
  const sixParas = splitParagraphs(six.text);
  const sevenParas = splitParagraphs(seven.text);
  if (sixParas.length === 0 || sevenParas.length === 0) return null;
  // The body paragraph, not the introduction: an introduction differs mostly in its
  // paraphrase, which teaches the learner the wrong lesson about what moves a band.
  const index = Math.min(2, sixParas.length - 1, sevenParas.length - 1);
  return { six: sixParas[index], seven: sevenParas[index] };
}

export function NoticeGate({ answers, answer, onAnswerChange, onPass }: NoticeGateProps) {
  const pair = useMemo(() => comparablePair(answers), [answers]);

  // Nothing to compare (a single-model prompt): the gate has no task to set, so it
  // would only be an obstacle. Let it through.
  useEffect(() => {
    if (!pair) onPass();
  }, [onPass, pair]);
  if (!pair) return null;

  const ready = answer.trim().length >= 12;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/40 bg-primary/8 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Eye className="h-4 w-4 text-primary" aria-hidden="true" />
          Before the notes: what actually changed?
        </p>
        <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
          These two paragraphs report the same content. One is a band-6 rendering, the other a
          band-7 one. Name two differences you can see, then the annotations open.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {(
          [
            { band: 6, text: pair.six },
            { band: 7, text: pair.seven },
          ] as const
        ).map((column) => (
          <div key={column.band} className="space-y-2 rounded-xl border border-border bg-card p-4">
            <Badge tone={column.band === 7 ? "primary" : "default"}>Band {column.band}</Badge>
            <p className="text-[14px] leading-7 text-foreground">{column.text}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="writing-notice-gate"
          className="block text-[13px] font-semibold text-foreground"
        >
          Name two things that changed
        </label>
        <Textarea
          id="writing-notice-gate"
          rows={3}
          value={answer}
          onChange={(event) => onAnswerChange(event.target.value)}
          placeholder="e.g. the second one groups two categories in one sentence, and it replaces &quot;a lot&quot; with a share"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!ready} onClick={onPass}>
            Show the annotated models
          </Button>
          <p className="text-[12px] text-muted-foreground">
            {ready
              ? "Your answer stays on screen beside the notes, so you can check yourself."
              : "A few words is enough. This is noticing, not an exam."}
          </p>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- the ladder ---

function BandPointStrip({
  answer,
  taskType,
}: {
  answer: WritingModelAnswer;
  taskType: TaskType | null;
}) {
  const lifts = answer.what_lifts_it ?? [];
  const caps = answer.what_caps_it ?? [];
  const showing = lifts.length > 0 ? lifts : caps;
  if (showing.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {bandPointHeading(answer.band_target, lifts.length > 0)}
      </p>
      <ul className="space-y-2">
        {showing.map((point, i) => (
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
  );
}

function StealRail({
  answer,
  promptId,
  topicTags,
  promptTitle,
  selected,
  onSelect,
}: {
  answer: WritingModelAnswer;
  promptId: string;
  topicTags: string[];
  promptTitle: string;
  selected: MarkSelection | null;
  onSelect: (s: MarkSelection | null) => void;
}) {
  const items = (answer.annotations ?? [])
    .map((a, index) => ({ a, index }))
    .filter(({ a }) => a.transferable);

  if (items.length === 0) {
    return (
      <p className="text-[13px] leading-6 text-muted-foreground">
        Nothing on this version is meant to be lifted whole. Read it for the shape, then write
        your own version of the same move.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map(({ a, index }) => {
        const type = bankableType(a.kind);
        const active = sameSelection(selected, { layer: "annotation", index });
        return (
          <li
            key={`${a.span}-${index}`}
            className={cn(
              "space-y-1.5 rounded-lg border p-2.5",
              active ? "border-primary bg-primary/8" : "border-border bg-card",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(active ? null : { layer: "annotation", index })}
              className="block w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    criterionStyle(a.criterion).chip,
                  )}
                >
                  {kindLabel(a.kind)}
                </span>
                <span className="text-[12px] font-semibold text-foreground">{a.label}</span>
              </span>
              <span className="mt-1 block text-[12px] italic leading-5 text-muted-foreground">
                “{a.span}”
              </span>
            </button>
            {type === null ? (
              <p className="text-[11px] text-muted-foreground">
                A technique, not a phrase. Practise it, don't bank it.
              </p>
            ) : (
              <AddToBank
                item={{
                  term: a.span,
                  definition: a.why,
                  example: a.span,
                  topicTags,
                  isPhrase: type === "phrase" || a.span.trim().includes(" "),
                  sourceDetail: `Writing model answer: ${promptTitle}`,
                  sourceItemId: promptId,
                }}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface ModelAnswerViewerProps {
  teaching: WritingTeaching;
  promptId: string;
  promptTitle: string;
  taskType: TaskType | null;
  topicTags?: string[];
  /** The learner's own criterion-1 band, if they have one. Opens one rung above it. */
  ownBand?: number | null;
  className?: string;
}

export function ModelAnswerViewer({
  teaching,
  promptId,
  promptTitle,
  taskType,
  topicTags = [],
  ownBand = null,
  className,
}: ModelAnswerViewerProps) {
  const answers = useMemo(
    () => (teaching.model_answers ?? []).slice().sort((a, b) => a.band_target - b.band_target),
    [teaching.model_answers],
  );

  /**
   * One band above where the learner actually is, not a fixed 7. Opening on the
   * ceiling invites copying; opening on the rung they already stand on teaches
   * nothing.
   */
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

  if (answers.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No model answers on this prompt"
        description="Prompts authored with the teaching payload carry the same answer at bands 6, 7 and 8, annotated against the four criteria."
        className={className}
      />
    );
  }

  const answer = answers.find((a) => String(a.band_target) === band) ?? answers[0];
  // Swap slots are authored against the band-7 text only.
  const swaps = answer.band_target === 7 ? (teaching.swap_slots ?? []) : [];

  const tabs: TabItem[] = answers.map((a) => ({
    value: String(a.band_target),
    label: `Band ${a.band_target}`,
  }));

  return (
    <div className={cn("space-y-4", className)}>
      <Tabs
        aria-label="Band versions of the same answer"
        items={tabs}
        value={String(answer.band_target)}
        onChange={(v) => {
          setBand(v);
          setSelected(null);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={answer.band_target >= 7 ? "primary" : "default"}>{answer.label}</Badge>
        <span className="text-[12px] tabular text-muted-foreground">
          {wordCount(answer.text)} words
        </span>
        {ownBand !== null && (
          <span className="text-[12px] text-muted-foreground">
            Opened one band above your own {criterionName("ta", taskType)} score.
          </span>
        )}
      </div>

      <BandPointStrip answer={answer} taskType={taskType} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.4fr)]">
        <div className="space-y-3">
          <AnnotatedModel
            text={answer.text}
            annotations={answer.annotations ?? []}
            swapSlots={swaps}
            selected={selected}
            onSelect={setSelected}
          />
        </div>

        <aside className="space-y-2.5">
          <h3 className="text-[13px] font-semibold text-foreground">Steal this</h3>
          <p className="text-[12px] leading-5 text-muted-foreground">
            The moves that work on any prompt of this kind, not just this one.
          </p>
          <StealRail
            answer={answer}
            promptId={promptId}
            promptTitle={promptTitle}
            topicTags={topicTags}
            selected={selected}
            onSelect={setSelected}
          />
        </aside>
      </div>
    </div>
  );
}
