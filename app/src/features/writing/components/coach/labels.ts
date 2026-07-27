/**
 * The words and colours the writing coach uses, in one place.
 *
 * One rule from the speaking module's teaching layer carries over unchanged and is
 * the reason the palette is written out longhand: **no red anywhere**. A band-6
 * model answer is not a mistake — it is where most candidates already are — so the
 * `avoid` marks take a neutral dotted underline, and the four criteria take four
 * distinguishable non-alarming tokens. Tailwind only ships classes it can see as
 * literal strings, so nothing here is composed at runtime.
 */

import type { AnnotationKind, Criterion } from "./types";
import type { TaskType } from "../../store";

const CRITERIA: Criterion[] = ["ta", "cc", "lr", "gra"];

export function isCriterion(value: string): value is Criterion {
  return (CRITERIA as string[]).includes(value.trim().toLowerCase());
}

/** `TA` / `CC` / `LR` / `GRA` — the badge on an annotation or a band point. */
export function criterionCode(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * The criterion's full name. Criterion 1 is Task Response on an essay and Task
 * Achievement on either Task 1 — same code, different label, exactly as the
 * examiner's own sheet does it.
 */
export function criterionName(value: string, taskType?: TaskType | null): string {
  switch (value.trim().toLowerCase()) {
    case "ta":
      return taskType === "task2" ? "Task Response" : "Task Achievement";
    case "cc":
      return "Coherence and Cohesion";
    case "lr":
      return "Lexical Resource";
    case "gra":
      return "Grammatical Range and Accuracy";
    default:
      return value;
  }
}

export interface CriterionStyle {
  /** Tinted badge: background plus foreground. */
  chip: string;
  /** `text-decoration-color` for an underlined span. */
  mark: string;
  /** Solid fill for the dot that says "there is a note here". */
  dot: string;
}

const CRITERION_STYLE: Record<Criterion, CriterionStyle> = {
  ta: { chip: "bg-primary/12 text-primary", mark: "decoration-primary", dot: "bg-primary" },
  cc: {
    chip: "bg-band-good/12 text-band-good",
    mark: "decoration-band-good",
    dot: "bg-band-good",
  },
  lr: {
    chip: "bg-band-strong/12 text-band-strong",
    mark: "decoration-band-strong",
    dot: "bg-band-strong",
  },
  gra: { chip: "bg-warning/15 text-warning", mark: "decoration-warning", dot: "bg-warning" },
};

const NEUTRAL_STYLE: CriterionStyle = {
  chip: "bg-muted text-muted-foreground",
  mark: "decoration-muted-foreground",
  dot: "bg-muted-foreground",
};

export function criterionStyle(value: string): CriterionStyle {
  const key = value.trim().toLowerCase();
  return isCriterion(key) ? CRITERION_STYLE[key as Criterion] : NEUTRAL_STYLE;
}

/** `avoid` never borrows the criterion colour — see the file header. */
export function isCappingKind(kind: AnnotationKind | string): boolean {
  return kind === "avoid";
}

/** What each annotation kind is *for*, in the learner's language. */
export const KIND_LABEL: Record<string, string> = {
  move: "Move",
  overview: "Overview",
  grammar: "Grammar",
  lexis: "Word choice",
  cohesion: "Cohesion",
  register: "Register",
  data: "Using the data",
  avoid: "What holds it back",
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind.replace(/_/g, " ");
}

/**
 * An annotation kind mapped onto a vocabulary entry type for the "Steal this" rail.
 * A `move` is a technique, not a lexical item: showing it is right, filing it in a
 * flashcard deck is a category error.
 */
export function bankableType(kind: AnnotationKind | string): "collocation" | "phrase" | null {
  if (kind === "lexis") return "collocation";
  if (kind === "grammar" || kind === "cohesion") return "phrase";
  return null;
}

// ------------------------------------------------------------------- the plan ---

export const PHASE_LABEL: Record<string, string> = {
  decode: "Decode",
  plan: "Plan",
  write: "Write",
  check: "Check",
};

export function phaseLabel(phase: string): string {
  return PHASE_LABEL[phase] ?? phase.replace(/_/g, " ");
}

/**
 * The four phases in a fixed visual order regardless of hue, so the bar reads the
 * same on every prompt. Deliberately quiet: it is a plan, not a warning.
 */
export const PHASE_FILL: Record<string, string> = {
  decode: "bg-muted-foreground/40",
  plan: "bg-primary/45",
  write: "bg-primary",
  check: "bg-band-good/70",
};

export function phaseFill(phase: string): string {
  return PHASE_FILL[phase] ?? "bg-muted";
}

export const ROLE_LABEL: Record<string, string> = {
  introduction: "Introduction",
  overview: "Overview",
  detail_group: "Detail group",
  opening: "Opening",
  bullet: "Bullet",
  body: "Body",
  conclusion: "Conclusion",
  closing: "Closing",
};

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role.replace(/_/g, " ");
}

/** The communicative move a set of frames trains. */
export const MOVE_LABEL: Record<string, string> = {
  describing_trend: "Describing a trend",
  comparing: "Comparing",
  grouping: "Grouping",
  sequencing: "Sequencing",
  locating: "Locating",
  hedging: "Hedging",
  conceding: "Conceding",
  exemplifying: "Giving an example",
  evaluating: "Evaluating",
  proposing: "Proposing",
  requesting: "Requesting",
  apologising: "Apologising",
  referencing: "Referring back",
};

export function moveLabel(move: string): string {
  return MOVE_LABEL[move] ?? move.replace(/_/g, " ");
}

export const REGISTER_SIGNAL_LABEL: Record<string, string> = {
  contractions: "Contractions",
  verb_stock: "Verb choice",
  modality: "Modal verbs",
  opening_move: "Opening move",
  sentence_length: "Sentence length",
  hedging: "Hedging",
  exclamations: "Exclamation marks",
  questions: "Questions",
  naming_the_reader: "Naming the reader",
  closing_move: "Closing move",
};

export function registerSignalLabel(signal: string): string {
  return REGISTER_SIGNAL_LABEL[signal] ?? signal.replace(/_/g, " ");
}

/**
 * The overview failure taxonomy, in the learner's words. The code alone is a
 * filing reference; naming the failure is what makes the negative exemplar teach.
 */
export const OVERVIEW_FAILURE: Record<string, string> = {
  W1: "No overview at all",
  W2: "A data sentence in disguise",
  W3: "The title, said again",
  W4: "Counting the categories instead of shaping them",
  W5: "One detail promoted to stand for everything",
  W6: "Explaining why, instead of reporting what",
  W7: "Hedged until it says nothing",
  W8: "Only half the data",
  W9: "Buried — nothing signals it is the overview",
  W10: "Contradicted by the body paragraphs",
};

export function overviewFailure(code: string): string {
  return OVERVIEW_FAILURE[code.trim().toUpperCase()] ?? "A weaker overview";
}

/** The argumentative axis a Task 2 prompt sits on (DESIGN.md §4 rule 7). */
export const AXIS_LABEL: Record<number, string> = {
  1: "Individual vs state",
  2: "Regulation vs freedom",
  3: "Spending trade-off",
  4: "Modern vs traditional",
  5: "Cause vs remedy",
  6: "Is this change good",
  7: "Global vs local",
  8: "Short-term cost vs long-term benefit",
  9: "Who pays and who benefits",
};

// ------------------------------------------------------------------ the ladder ---

/** What changes between two rungs of the sentence ladder. */
export function rungStep(from: number): string {
  if (from === 5) return "Accuracy";
  if (from === 6) return "Specificity and a more flexible structure";
  if (from === 7) return "Density of relevant detail, and reader consideration";
  return "The next step up";
}

/** Heading over `what_lifts_it` / `what_caps_it`, named against the neighbouring rung. */
export function bandPointHeading(band: number, lifts: boolean): string {
  return lifts ? `What lifts it above band ${band - 1}` : `What holds it below band ${band + 1}`;
}

/** `0:45`, `12:04`, `-1:20` — the only clock format these screens use. */
export function clock(totalSeconds: number): string {
  const negative = totalSeconds < 0;
  const s = Math.abs(Math.round(totalSeconds));
  const body = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/** Words in a model answer, counted the way the editor counts them. */
export function wordCount(text: string): number {
  const trimmed = (text ?? "").trim();
  if (trimmed === "") return 0;
  let count = 0;
  for (const token of trimmed.split(/\s+/)) {
    if (token && /[0-9A-Za-z]/.test(token)) count += 1;
  }
  return count;
}
