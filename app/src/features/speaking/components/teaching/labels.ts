/**
 * Vocabulary the teaching screens share: criterion names, annotation kinds,
 * communicative functions, and the colour each maps to.
 *
 * One rule from DESIGN.md §7 F1 governs the palette: **no red anywhere**. A model
 * answer at band 6 is not a mistake — it is where most candidates already are — and
 * marking it in the destructive colour teaches shame rather than language. The
 * `avoid` markers therefore use a neutral marker, and the criteria use the four
 * distinguishable non-alarming tokens.
 */

import type { AnnotationKind, Criterion } from "./types";

export const CRITERION_LABEL: Record<string, string> = {
  FC: "Fluency & coherence",
  LR: "Lexical resource",
  GRA: "Grammar",
  PRON: "Pronunciation",
};

export const CRITERION_SHORT: Record<string, string> = {
  FC: "Fluency",
  LR: "Vocabulary",
  GRA: "Grammar",
  PRON: "Pronunciation",
};

/** Maps the report's lowercase criterion keys onto the content's uppercase ones. */
export function normaliseCriterion(value: string): Criterion | null {
  const upper = value.trim().toUpperCase();
  if (upper === "FC" || upper === "LR" || upper === "GRA" || upper === "PRON") return upper;
  return null;
}

export function criterionLabel(value: string): string {
  const key = normaliseCriterion(value);
  return key ? CRITERION_LABEL[key] : value;
}

/**
 * Text/border/background triples, keyed by criterion. Written out in full rather
 * than composed at runtime because Tailwind only ships classes it can see as
 * literal strings in the source.
 */
export interface CriterionStyle {
  /** Foreground colour for a label. */
  text: string;
  /** Tinted badge background + foreground. */
  chip: string;
  /** `text-decoration-color` for an underlined span. */
  mark: string;
  /** Solid fill for the small dot that says "there is a note here". */
  dot: string;
}

export const CRITERION_STYLE: Record<Criterion, CriterionStyle> = {
  FC: {
    text: "text-band-good",
    chip: "bg-band-good/12 text-band-good",
    mark: "decoration-band-good",
    dot: "bg-band-good",
  },
  LR: {
    text: "text-primary",
    chip: "bg-primary/12 text-primary",
    mark: "decoration-primary",
    dot: "bg-primary",
  },
  GRA: {
    text: "text-band-strong",
    chip: "bg-band-strong/12 text-band-strong",
    mark: "decoration-band-strong",
    dot: "bg-band-strong",
  },
  PRON: {
    text: "text-warning",
    chip: "bg-warning/15 text-warning",
    mark: "decoration-warning",
    dot: "bg-warning",
  },
};

const NEUTRAL_STYLE: CriterionStyle = {
  text: "text-muted-foreground",
  chip: "bg-muted text-muted-foreground",
  mark: "decoration-muted-foreground",
  dot: "bg-muted-foreground",
};

export function criterionStyle(value: string): CriterionStyle {
  const key = normaliseCriterion(value);
  return key ? CRITERION_STYLE[key] : NEUTRAL_STYLE;
}

/** What each annotation kind is *for*, in the learner's language. */
export const KIND_LABEL: Record<string, string> = {
  move: "Move",
  chunk: "Chunk",
  grammar: "Grammar",
  lexis: "Word choice",
  prosody: "Delivery",
  repair: "Repair",
  swap: "Make it yours",
  avoid: "What holds it back",
};

/** `avoid` never uses the criterion colour — see the file header. */
export function isCappingKind(kind: AnnotationKind | string): boolean {
  return kind === "avoid";
}

/**
 * DESIGN.md §7 F1: the "Steal this" rail maps an annotation kind onto a vocabulary
 * entry type. A `move` is a technique, not a lexical item, so it is shown but never
 * banked — putting "answer the card in one clause" into a flashcard deck would be
 * a category error.
 */
export function bankableType(kind: AnnotationKind | string): "collocation" | "phrase" | null {
  if (kind === "chunk" || kind === "lexis") return "collocation";
  if (kind === "grammar") return "phrase";
  return null;
}

export const FUNCTION_LABEL: Record<string, string> = {
  opinion: "Giving an opinion",
  hedging: "Hedging",
  comparing: "Comparing",
  speculating: "Speculating",
  conceding: "Conceding",
  exemplifying: "Giving an example",
  narrating: "Narrating",
  evaluating: "Evaluating",
};

export function functionLabel(value: string): string {
  return FUNCTION_LABEL[value] ?? value;
}

export const VOCAB_TYPE_LABEL: Record<string, string> = {
  collocation: "Collocation",
  chunk: "Chunk",
  phrasal_verb: "Phrasal verb",
  idiom: "Idiom",
  word: "Word",
};

export const USED_IN_LABEL: Record<string, string> = {
  part1: "Part 1",
  part2: "Part 2",
  part3: "Part 3",
  any: "Any part",
};

/** Human name for a `time_plan` segment id. */
export const SEGMENT_LABEL: Record<string, string> = {
  opening: "Opening",
  bullets_1_2: "Bullets 1 & 2",
  bullet_3: "Bullet 3",
  bullet_4: "Bullet 4",
  landing: "Landing",
};

export function segmentLabel(value: string): string {
  return SEGMENT_LABEL[value] ?? value.replace(/_/g, " ");
}

/** `0:45`, `1:58` — the only clock format these screens use. */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ------------------------------------------------------------------- the ladder ---
//
// Round 2 extended the ladder from 6/7/8 to 5/6/7/8/9, so nothing on these screens may
// assume 6 is the floor or 8 the ceiling. Both helpers read the card's own rungs.

/** Tab label for one rung. Only the top rung of a ladder that stops short gets a `+`. */
export function bandTabLabel(band: number, ladder: number[]): string {
  const top = ladder.length > 0 ? Math.max(...ladder) : band;
  return band === top && band < 9 ? `Band ${band}+` : `Band ${band}`;
}

/** Heading over `what_lifts_it` / `what_caps_it`, named against the neighbouring rung. */
export function bandPointHeading(
  band: number,
  ladder: number[],
  lifts: boolean,
): string {
  const sorted = [...ladder].sort((a, b) => a - b);
  const index = sorted.indexOf(band);
  if (lifts) {
    const below = index > 0 ? sorted[index - 1] : band - 1;
    return `What lifts it above band ${below}`;
  }
  const above = index >= 0 && index < sorted.length - 1 ? sorted[index + 1] : band + 1;
  return `What holds it below band ${above}`;
}

/** The one change a learner standing on `band` should make next, from `ladder_note`. */
export function ladderStepKey(band: number): string {
  return `from_${band}_to_${band + 1}`;
}
