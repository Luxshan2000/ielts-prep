/**
 * The band ladder: the same two-minute answer at every rung the card carries, annotated.
 *
 * Round 1 authored 6/7/8; round 2 extended twenty cards down to 5 and up to 9. Nothing
 * here assumes a rung count — the tabs, the headings and the rung note are all derived
 * from the answers the card actually ships.
 *
 * All three transcripts tell the same story with the same facts — that is the whole
 * design (DESIGN.md §3.8). It isolates language from content, so a learner can see
 * that the gap between two rungs is not a better memory or a more interesting life.
 * The band selector therefore swaps only the text; nothing else on the screen moves.
 *
 * Default position is 7, not 6 and not 8: 7 is the target most candidates are
 * actually chasing, and opening on 8 invites copying rather than noticing.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Lock, Mic, Sparkles } from "lucide-react";
import { Badge, Button, EmptyState, Tabs, type TabItem } from "@/components/ui";
import { cn } from "@/lib/cn";
import { AnnotatedModel, sameSelection, type MarkSelection } from "./AnnotatedModel";
import { AddToBank } from "./primitives";
import {
  bandPointHeading,
  bandTabLabel,
  bankableType,
  criterionLabel,
  criterionStyle,
  KIND_LABEL,
  ladderStepKey,
} from "./labels";
import { wordCount } from "./spans";
import type { ModelAnswer, Part2Teaching } from "./types";

// ------------------------------------------------------------------ the ladder ---

function BandPointStrip({ answer, ladder }: { answer: ModelAnswer; ladder: number[] }) {
  const lifts = answer.what_lifts_it ?? [];
  const caps = answer.what_caps_it ?? [];
  const showing = lifts.length > 0 ? lifts : caps;
  const heading = bandPointHeading(answer.band_target, ladder, lifts.length > 0);

  if (showing.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {heading}
      </p>
      <ul className="space-y-2">
        {showing.map((point, i) => {
          const style = criterionStyle(point.criterion);
          return (
            <li key={i} className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  style.chip,
                )}
              >
                {criterionLabel(point.criterion)}
              </span>
              <span className="text-[13px] leading-6 text-foreground">{point.point}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StealRail({
  answer,
  topicTags,
  cardTitle,
  selected,
  onSelect,
}: {
  answer: ModelAnswer;
  topicTags: string[];
  cardTitle: string;
  selected: MarkSelection | null;
  onSelect: (s: MarkSelection | null) => void;
}) {
  const items = (answer.annotations ?? [])
    .map((a, index) => ({ a, index }))
    .filter(({ a }) => a.transferable);

  if (items.length === 0) {
    return (
      <p className="text-[13px] leading-6 text-muted-foreground">
        Nothing on this version is meant to be lifted whole. Read it for the shape, then say
        your own version out loud.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map(({ a, index }) => {
        const type = bankableType(a.kind);
        const active = sameSelection(selected, { layer: "annotation", index });
        const style = criterionStyle(a.criterion);
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
              className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              <span className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    style.chip,
                  )}
                >
                  {KIND_LABEL[a.kind] ?? a.kind}
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
                  sourceDetail: `Speaking model answer: ${cardTitle}`,
                }}
                label="Add to bank"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface ModelAnswerViewerProps {
  teaching: Part2Teaching;
  cardTitle: string;
  topicTags?: string[];
  className?: string;
}

export function ModelAnswerViewer({
  teaching,
  cardTitle,
  topicTags = [],
  className,
}: ModelAnswerViewerProps) {
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
        icon={Sparkles}
        title="No model answers on this card"
        description="This topic set was authored before the band ladder existed. Any set with a teaching payload shows the same answer at every band it was written for."
        className={className}
      />
    );
  }

  const answer = answers.find((a) => String(a.band_target) === band) ?? answers[0];
  const swaps = answer.band_target === 7 ? (teaching.swap_slots ?? []) : [];
  const note =
    selected?.layer === "annotation" ? (answer.annotations ?? [])[selected.index] : null;

  const ladder = answers.map((a) => a.band_target);
  const tabs: TabItem[] = answers.map((a) => ({
    value: String(a.band_target),
    label: bandTabLabel(a.band_target, ladder),
  }));
  // The rung note for the band the learner is *looking at* — the single next change.
  const step = teaching.ladder_note?.[ladderStepKey(answer.band_target)];

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
        <span className="text-[12px] text-muted-foreground">
          {answer.approx_seconds ? `about ${answer.approx_seconds}s spoken · ` : ""}
          {wordCount(answer.transcript)} words
        </span>
      </div>

      {step && (
        <p className="rounded-xl border border-border bg-muted/40 p-3 text-[13px] leading-6 text-foreground">
          <span className="font-semibold">
            From band {answer.band_target} to {answer.band_target + 1}:{" "}
          </span>
          {step}
        </p>
      )}

      <BandPointStrip answer={answer} ladder={ladder} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.4fr)]">
        <div className="space-y-3">
          <p className="text-[12px] text-muted-foreground">
            Underlined phrases carry a note. Hover, tap or tab to one to see why it earns what
            it earns.
            {swaps.length > 0 &&
              " Shaded phrases are this speaker's own life, so swap them for yours."}
          </p>

          <AnnotatedModel
            transcript={answer.transcript}
            annotations={answer.annotations ?? []}
            swapSlots={swaps}
            selected={selected}
            onSelect={setSelected}
            showSwaps={swaps.length > 0}
          />

          {note && (
            <div className="rounded-xl border border-primary/40 bg-primary/8 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {KIND_LABEL[note.kind] ?? note.kind} · {criterionLabel(note.criterion)}
              </p>
              <p className="mt-1 text-[14px] font-semibold text-foreground">{note.label}</p>
              <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">{note.why}</p>
            </div>
          )}
        </div>

        <aside className="space-y-2.5">
          <h4 className="text-[13px] font-semibold text-foreground">Steal this</h4>
          <p className="text-[12px] leading-5 text-muted-foreground">
            The transferable moves: the parts that work on any topic, not just this one.
          </p>
          <StealRail
            answer={answer}
            topicTags={topicTags}
            cardTitle={cardTitle}
            selected={selected}
            onSelect={setSelected}
          />
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- attempt gate ---

export interface AttemptGateProps {
  /** What the learner would see once unlocked. */
  children: ReactNode;
  locked: boolean;
  /** Sentence explaining the lock — one line, no scolding. */
  reason: string;
  onPractise?: () => void;
  practiseLabel?: string;
}

/**
 * DESIGN.md §7 F1. Locked is the default and the lock is the pedagogy: a model shown
 * before the attempt is a script to memorise, and memorised language is precisely
 * what the descriptors refuse to credit. One line of reason, one button out.
 */
export function AttemptGate({
  children,
  locked,
  reason,
  onPractise,
  practiseLabel = "Rehearse this card",
}: AttemptGateProps) {
  if (!locked) return <>{children}</>;
  return (
    <EmptyState
      icon={Lock}
      title="Have a go first"
      description={reason}
      action={
        onPractise && (
          <Button onClick={onPractise}>
            <Mic className="h-4 w-4" aria-hidden="true" />
            {practiseLabel}
          </Button>
        )
      }
    />
  );
}
