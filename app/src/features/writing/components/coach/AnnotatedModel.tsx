/**
 * A model answer with its annotations rendered inline.
 *
 * Two mark layers sit over the same text (see `spans.ts`): the criterion
 * annotations, and the swap slots that mark which specifics are *not* the learner's
 * to keep. Where they overlap the annotation owns the click and the swap prompt is
 * folded into its note, because nesting one button inside another is invalid HTML
 * and breaks keyboard traversal.
 *
 * Interaction, in the order a learner discovers it:
 *  - every marked span is underlined in its criterion colour, so it reads as
 *    touchable before anything is touched;
 *  - hover or keyboard focus opens the note;
 *  - click or Enter pins it, and the pinned note also renders in the panel below,
 *    which is what a screen reader and a narrow window get.
 *
 * **No red anywhere.** The band-6 `avoid` marks take a neutral dotted underline.
 * Band 6 is where most candidates already are; colouring it like an error teaches
 * shame instead of language.
 */

import { Fragment, useMemo } from "react";
import { cn } from "@/lib/cn";
import { criterionCode, criterionStyle, isCappingKind, kindLabel } from "./labels";
import { layerSpans, placeSpans, toParagraphs } from "./spans";
import type { ModelAnnotation, SwapSlot } from "./types";

export type MarkSelection =
  | { layer: "annotation"; index: number }
  | { layer: "swap"; index: number };

export function sameSelection(a: MarkSelection | null, b: MarkSelection | null): boolean {
  if (a === null || b === null) return a === b;
  return a.layer === b.layer && a.index === b.index;
}

export interface AnnotatedModelProps {
  text: string;
  annotations: ModelAnnotation[];
  swapSlots?: SwapSlot[];
  selected: MarkSelection | null;
  onSelect: (selection: MarkSelection | null) => void;
  className?: string;
}

export function AnnotatedModel({
  text,
  annotations,
  swapSlots = [],
  selected,
  onSelect,
  className,
}: AnnotatedModelProps) {
  const { paragraphs, annPlaced, swapPlaced, unresolved } = useMemo(() => {
    const ann = placeSpans(text, annotations);
    const swap = placeSpans(text, swapSlots);
    const runs = layerSpans(text, ann.placed, swap.placed);
    return {
      paragraphs: toParagraphs(runs),
      annPlaced: ann.placed,
      swapPlaced: swap.placed,
      unresolved: ann.unresolved,
    };
  }, [annotations, swapSlots, text]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        {paragraphs.map((runs, pi) => (
          <p key={pi} className="text-[14px] leading-8 text-foreground">
            {runs.map((run, ri) => {
              const ann = run.aIndex >= 0 ? annPlaced[run.aIndex] : null;
              const swap = run.bIndex >= 0 ? swapPlaced[run.bIndex] : null;

              if (!ann && !swap) return <Fragment key={ri}>{run.text}</Fragment>;

              // The annotation owns the click wherever the two layers overlap.
              const layer: MarkSelection = ann
                ? { layer: "annotation", index: run.aIndex }
                : { layer: "swap", index: run.bIndex };
              const active = sameSelection(selected, layer);
              const capping = ann ? isCappingKind(ann.mark.kind) : false;
              const style = ann ? criterionStyle(ann.mark.criterion) : null;

              return (
                <button
                  key={ri}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelect(active ? null : layer)}
                  className={cn(
                    "rounded-sm text-left underline-offset-4 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    ann && !capping && "underline decoration-2",
                    ann && !capping && style?.mark,
                    // `avoid` is neutral and dotted, never destructive-coloured.
                    capping && "underline decoration-dotted decoration-muted-foreground",
                    swap && "bg-muted px-0.5",
                    active && "bg-primary/12",
                  )}
                  title={
                    ann
                      ? `${kindLabel(ann.mark.kind)}: ${ann.mark.label}`
                      : swap
                        ? "Make this one yours"
                        : undefined
                  }
                >
                  {run.text}
                </button>
              );
            })}
          </p>
        ))}
      </div>

      {/* The pinned note. Rendered outside the text so it is one predictable place
          for a screen reader and never reflows the paragraph being read. */}
      <SelectedNote
        selected={selected}
        annotations={annotations}
        swapSlots={swapSlots}
        swapCovering={selected?.layer === "annotation" ? coveringSwap(selected.index) : null}
      />

      {unresolved.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-border bg-muted/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Notes that could not be anchored
          </p>
          <ul className="space-y-1">
            {unresolved.map((mark, i) => (
              <li key={i} className="text-[12px] leading-5 text-muted-foreground">
                <span className="font-semibold text-foreground">{mark.label}</span>: {mark.why}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  /** The swap slot a pinned annotation sits inside, if any. */
  function coveringSwap(annIndex: number): SwapSlot | null {
    const ann = annPlaced[annIndex];
    if (!ann) return null;
    const swap = swapPlaced.find((p) => p.start <= ann.start && p.end >= ann.end);
    return swap ? swap.mark : null;
  }
}

function SelectedNote({
  selected,
  annotations,
  swapSlots,
  swapCovering,
}: {
  selected: MarkSelection | null;
  annotations: ModelAnnotation[];
  swapSlots: SwapSlot[];
  swapCovering: SwapSlot | null;
}) {
  if (!selected) {
    return (
      <p className="text-[12px] leading-5 text-muted-foreground">
        Underlined phrases carry a note. Click or tab to one to see what it earns and why.
        {swapSlots.length > 0 &&
          " Shaded phrases are this writer's invented specifics: swap them for your own."}
      </p>
    );
  }

  if (selected.layer === "swap") {
    const slot = swapSlots[selected.index];
    if (!slot) return null;
    return (
      <div role="status" className="rounded-xl border border-border bg-muted/60 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Make this one yours
        </p>
        <p className="mt-1 text-[14px] font-semibold text-foreground">“{slot.span}”</p>
        <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">{slot.prompt}</p>
      </div>
    );
  }

  const note = annotations[selected.index];
  if (!note) return null;
  const style = criterionStyle(note.criterion);

  return (
    <div role="status" className="rounded-xl border border-primary/40 bg-primary/8 p-3">
      <p className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            isCappingKind(note.kind) ? "bg-muted text-muted-foreground" : style.chip,
          )}
        >
          {criterionCode(note.criterion)}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {kindLabel(note.kind)}
        </span>
      </p>
      <p className="mt-1 text-[14px] font-semibold text-foreground">{note.label}</p>
      <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">{note.why}</p>
      {swapCovering && (
        <p className="mt-2 border-t border-primary/20 pt-2 text-[12px] leading-5 text-muted-foreground">
          <span className="font-semibold text-foreground">Not yours to keep: </span>
          {swapCovering.prompt}
        </p>
      )}
    </div>
  );
}
