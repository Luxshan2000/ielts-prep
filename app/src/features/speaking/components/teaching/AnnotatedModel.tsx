/**
 * A model answer with its annotations rendered inline.
 *
 * Two mark layers sit over the same text (see `spans.ts`): the criterion
 * annotations, and the swap slots that mark which specifics are *not* the learner's
 * to keep. Where they overlap the annotation owns the click and the swap prompt is
 * folded into its popover, because nesting one button inside another is invalid HTML
 * and would break keyboard traversal.
 *
 * Interaction, in the order a learner will discover it:
 *  - every marked span is visibly underlined in its criterion colour and carries a
 *    dot, so it reads as touchable before anything is touched;
 *  - hover or keyboard focus opens the note;
 *  - click or Enter pins it, and the same note also renders in the panel below the
 *    transcript, which is what a screen reader and a narrow window get.
 *
 * No red anywhere (DESIGN.md §7 F1): the band-6 `avoid` marks use a neutral dotted
 * underline. Band 6 is where most candidates already are; colouring it like an error
 * teaches shame instead of language.
 */

import { Fragment, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { criterionStyle, isCappingKind, KIND_LABEL, criterionLabel } from "./labels";
import { layerSpans, placeSpans, type HasSpan, type Placed } from "./spans";
import type { ModelAnnotation, SwapSlot } from "./types";

export type MarkSelection =
  | { layer: "annotation"; index: number }
  | { layer: "swap"; index: number };

export function sameSelection(a: MarkSelection | null, b: MarkSelection | null): boolean {
  if (a === null || b === null) return a === b;
  return a.layer === b.layer && a.index === b.index;
}

interface Piece {
  text: string;
  aIndex: number;
  bIndex: number;
}

interface Chunk {
  key: string;
  aIndex: number;
  bIndex: number;
  pieces: Piece[];
}

function buildParagraphs<A extends HasSpan, B extends HasSpan>(
  transcript: string,
  aPlaced: Placed<A>[],
  bPlaced: Placed<B>[],
): Chunk[][] {
  const runs = layerSpans(transcript, aPlaced, bPlaced);
  const paragraphs: Piece[][] = [[]];

  for (const run of runs) {
    const parts = run.text.split(/\n{2,}/);
    parts.forEach((part, i) => {
      if (i > 0) paragraphs.push([]);
      if (part === "") return;
      paragraphs[paragraphs.length - 1].push({
        text: part,
        aIndex: run.aIndex,
        bIndex: run.bIndex,
      });
    });
  }

  let plain = 0;
  return paragraphs
    .filter((p) => p.length > 0)
    .map((pieces) => {
      const chunks: Chunk[] = [];
      for (const piece of pieces) {
        const key =
          piece.aIndex >= 0
            ? `a${piece.aIndex}`
            : piece.bIndex >= 0
              ? `b${piece.bIndex}`
              : `p${(plain += 1)}`;
        const last = chunks[chunks.length - 1];
        if (last && last.key === key) last.pieces.push(piece);
        else chunks.push({ key, aIndex: piece.aIndex, bIndex: piece.bIndex, pieces: [piece] });
      }
      return chunks;
    });
}

const SWAP_PIECE =
  "rounded-[3px] bg-muted px-[1px] border-b border-dashed border-muted-foreground/70";

function Popover({ children, open }: { children: ReactNode; open: boolean }) {
  return (
    <span
      role="tooltip"
      className={cn(
        "pointer-events-none absolute bottom-full left-0 z-40 mb-2 w-[min(20rem,70vw)]",
        "rounded-lg border border-border bg-card p-3 text-left shadow-xl",
        "transition-opacity duration-100",
        open
          ? "opacity-100"
          : "opacity-0 group-hover/mark:opacity-100 group-focus-within/mark:opacity-100",
      )}
    >
      {children}
    </span>
  );
}

export interface AnnotatedModelProps {
  transcript: string;
  annotations: ModelAnnotation[];
  swapSlots?: SwapSlot[];
  selected: MarkSelection | null;
  onSelect: (selection: MarkSelection | null) => void;
  /** Hide the swap layer — Compare wants it, the plain viewer at band 6/8 does not. */
  showSwaps?: boolean;
  className?: string;
}

export function AnnotatedModel({
  transcript,
  annotations,
  swapSlots = [],
  selected,
  onSelect,
  showSwaps = true,
  className,
}: AnnotatedModelProps) {
  // The authored array index rides along on every mark. `placeSpans` sorts by
  // position and drops whatever it cannot locate, so a placement index and an
  // authored index diverge the moment one span is unresolvable — and `MarkSelection`
  // is shared with the "Steal this" rail, which only knows authored order.
  const { paragraphs, aPlaced, bPlaced, unresolved } = useMemo(() => {
    const a = placeSpans(
      transcript,
      annotations.map((mark, idx) => ({ ...mark, idx })),
    );
    const b = showSwaps
      ? placeSpans(
          transcript,
          swapSlots.map((mark, idx) => ({ ...mark, idx })),
        )
      : { placed: [] as Placed<SwapSlot & { idx: number }>[], unresolved: [] };
    return {
      paragraphs: buildParagraphs(transcript, a.placed, b.placed),
      aPlaced: a.placed,
      bPlaced: b.placed,
      unresolved: a.unresolved,
    };
  }, [annotations, showSwaps, swapSlots, transcript]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-3 text-[14px] leading-7 text-foreground">
        {paragraphs.map((chunks, pi) => (
          <p key={pi}>
            {chunks.map((chunk) => {
              const text = chunk.pieces.map((p) => p.text).join("");

              if (chunk.aIndex >= 0) {
                const note = aPlaced[chunk.aIndex]?.mark ?? null;
                const authored = note?.idx ?? chunk.aIndex;
                const active = sameSelection(selected, {
                  layer: "annotation",
                  index: authored,
                });
                const capping = note ? isCappingKind(note.kind) : false;
                const style = criterionStyle(note?.criterion ?? "");
                const swap = chunk.bIndex >= 0 ? (bPlaced[chunk.bIndex]?.mark ?? null) : null;

                return (
                  <span key={chunk.key} className="group/mark relative inline">
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        onSelect(active ? null : { layer: "annotation", index: authored })
                      }
                      className={cn(
                        "inline cursor-pointer rounded-sm text-left underline underline-offset-4",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        capping
                          ? "decoration-muted-foreground decoration-dotted decoration-2"
                          : cn(style.mark, "decoration-2"),
                        active && "bg-accent",
                      )}
                    >
                      {chunk.pieces.map((piece, i) => (
                        <span
                          key={i}
                          className={cn(piece.bIndex >= 0 && showSwaps && SWAP_PIECE)}
                        >
                          {piece.text}
                        </span>
                      ))}
                      <span
                        aria-hidden="true"
                        className={cn(
                          "ml-0.5 inline-block h-1.5 w-1.5 translate-y-[-3px] rounded-full",
                          capping ? "bg-muted-foreground" : style.dot,
                        )}
                      />
                    </button>
                    {note && (
                      <Popover open={active}>
                        <span className="mb-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              capping ? "bg-muted text-muted-foreground" : style.chip,
                            )}
                          >
                            {KIND_LABEL[note.kind] ?? note.kind}
                          </span>
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {criterionLabel(note.criterion)}
                          </span>
                        </span>
                        <span className="block text-[13px] font-semibold text-foreground">
                          {note.label}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-5 text-muted-foreground">
                          {note.why}
                        </span>
                        {swap && (
                          <span className="mt-2 block border-t border-border pt-2 text-[12px] leading-5 text-muted-foreground">
                            <span className="font-semibold text-foreground">Make it yours: </span>
                            {swap.prompt}
                          </span>
                        )}
                      </Popover>
                    )}
                  </span>
                );
              }

              if (chunk.bIndex >= 0 && showSwaps) {
                const swap = bPlaced[chunk.bIndex]?.mark ?? null;
                const authored = swap?.idx ?? chunk.bIndex;
                const active = sameSelection(selected, { layer: "swap", index: authored });
                return (
                  <span key={chunk.key} className="group/mark relative inline">
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        onSelect(active ? null : { layer: "swap", index: authored })
                      }
                      className={cn(
                        "inline cursor-pointer text-left",
                        SWAP_PIECE,
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active && "bg-accent",
                      )}
                    >
                      {text}
                    </button>
                    {swap && (
                      <Popover open={active}>
                        <span className="block text-[13px] font-semibold text-foreground">
                          Not yours to keep
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-5 text-muted-foreground">
                          {swap.prompt}
                        </span>
                      </Popover>
                    )}
                  </span>
                );
              }

              return <Fragment key={chunk.key}>{text}</Fragment>;
            })}
          </p>
        ))}
      </div>

      {unresolved.length > 0 && (
        // A span the lint gate would have caught. The note is still worth reading,
        // so it is listed rather than dropped.
        <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-[12px] font-semibold text-foreground">
            Notes that couldn't be pinned to the text
          </p>
          <ul className="space-y-1">
            {unresolved.map((note, i) => (
              <li key={i} className="text-[12px] leading-5 text-muted-foreground">
                <span className="font-medium text-foreground">{note.label}</span> — {note.why}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
