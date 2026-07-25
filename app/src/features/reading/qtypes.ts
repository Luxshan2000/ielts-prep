/**
 * Question-type families, labels and the word-limit helpers the player needs.
 *
 * The families mirror `sidecar/bandready/scoring/answers.py` exactly (LETTER /
 * MULTI / CHOICE / TEXT). The word counter here is a *live hint* only — the
 * sidecar's `within_word_limit` is the authority at marking time, and the UI
 * never blocks submission on it (06 §2.1).
 */

import type { QuestionGroup, QuestionLayout, WordLimit } from "./types";

/** Answer is one or more letters / roman numerals from a fixed option list. */
export const LETTER_TYPES: ReadonlySet<string> = new Set([
  "multiple_choice",
  "multiple_choice_multi",
  "matching_headings",
  "matching_information",
  "matching_features",
  "matching_sentence_endings",
  "summary_completion_bank",
  "list_selection",
  "matching",
]);

/** Letter types where the *set* of chosen letters is the answer. */
export const MULTI_TYPES: ReadonlySet<string> = new Set([
  "multiple_choice_multi",
  "list_selection",
]);

/** The three-way judgement types. */
export const CHOICE_TYPES: ReadonlySet<string> = new Set([
  "true_false_not_given",
  "yes_no_not_given",
]);

/** Free text typed by the learner. */
export const TEXT_TYPES: ReadonlySet<string> = new Set([
  "sentence_completion",
  "summary_completion",
  "note_completion",
  "table_completion",
  "flow_chart_completion",
  "form_completion",
  "diagram_labelling",
  "map_labelling",
  "short_answer",
]);

/** Text types whose gaps live in a `layout` skeleton rather than the prompt. */
export const LAYOUT_TYPES: ReadonlySet<string> = new Set([
  "note_completion",
  "table_completion",
  "flow_chart_completion",
  "form_completion",
  "diagram_labelling",
  "map_labelling",
]);

/** Types that render a shared option bank above the questions. */
export const BANK_TYPES: ReadonlySet<string> = new Set([
  "matching_headings",
  "matching_information",
  "matching_features",
  "matching_sentence_endings",
  "summary_completion_bank",
  "matching",
]);

const LABELS: Record<string, string> = {
  multiple_choice: "Multiple choice",
  multiple_choice_multi: "Multiple choice — choose several",
  list_selection: "List selection",
  true_false_not_given: "True / False / Not Given",
  yes_no_not_given: "Yes / No / Not Given",
  matching_headings: "Matching headings",
  matching_information: "Matching information",
  matching_features: "Matching features",
  matching_sentence_endings: "Matching sentence endings",
  matching: "Matching",
  sentence_completion: "Sentence completion",
  summary_completion: "Summary completion",
  summary_completion_bank: "Summary completion (word bank)",
  note_completion: "Note completion",
  table_completion: "Table completion",
  flow_chart_completion: "Flow-chart completion",
  form_completion: "Form completion",
  diagram_labelling: "Diagram labelling",
  map_labelling: "Map labelling",
  short_answer: "Short answer",
};

/** Human label for a `question_groups[].type`, with a readable fallback. */
export function qtypeLabel(qtype: string): string {
  if (LABELS[qtype]) return LABELS[qtype];
  if (!qtype) return "Questions";
  return qtype.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Every type the drill browser knows how to offer, in teaching order. */
export const DRILLABLE_TYPES: readonly string[] = [
  "true_false_not_given",
  "yes_no_not_given",
  "matching_headings",
  "matching_information",
  "matching_features",
  "matching_sentence_endings",
  "multiple_choice",
  "multiple_choice_multi",
  "list_selection",
  "sentence_completion",
  "summary_completion",
  "summary_completion_bank",
  "note_completion",
  "table_completion",
  "flow_chart_completion",
  "form_completion",
  "diagram_labelling",
  "map_labelling",
  "short_answer",
];

/** The three buttons a judgement type offers. */
export function choiceValues(qtype: string): string[] {
  if (qtype === "yes_no_not_given") return ["YES", "NO", "NOT GIVEN"];
  return ["TRUE", "FALSE", "NOT GIVEN"];
}

// --------------------------------------------------------------- word limits ---

/** Coerce whatever the pack stored into `{max_words, numbers_allowed}`. */
export function wordLimitOf(value: WordLimit | number | null | undefined): WordLimit | null {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  if (typeof value === "number") return { max_words: value, numbers_allowed: true };
  if (typeof value === "object" && "max_words" in value) {
    return {
      max_words: Number(value.max_words) || 0,
      numbers_allowed: value.numbers_allowed !== false,
    };
  }
  return null;
}

const NUMBER_WORDS = new Set([
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
  "hundred", "thousand", "million", "billion",
]);

const DIGIT_TOKEN = /^[$£€]?\d[\d.,:/-]*%?(?:st|nd|rd|th|s)?$/i;

/** IELTS tokenisation: hyphenated compound = 1, contraction = 1, number = 1. */
export function tokenize(raw: string): string[] {
  return raw
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s'’$£€%./:-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function isNumberToken(token: string): boolean {
  if (DIGIT_TOKEN.test(token)) return true;
  return token
    .toLowerCase()
    .split("-")
    .every((part) => NUMBER_WORDS.has(part));
}

export interface WordLimitState {
  limit: WordLimit;
  /** Words that count against `max_words` (numbers excluded when allowed). */
  words: number;
  numbers: number;
  over: boolean;
  /** "2 / 2 words" style caption. */
  caption: string;
}

/**
 * Live counter state for a text answer. Mirrors `within_word_limit`:
 * "AND/OR A NUMBER" means one number *in addition to* the word allowance.
 */
export function wordLimitState(
  value: string,
  limitLike: WordLimit | number | null | undefined,
): WordLimitState | null {
  const limit = wordLimitOf(limitLike);
  if (!limit) return null;
  const tokens = tokenize(value);
  const max = Math.max(0, limit.max_words);

  if (!limit.numbers_allowed) {
    const words = tokens.length;
    return {
      limit,
      words,
      numbers: 0,
      over: words > max,
      caption: `${words} / ${max} ${max === 1 ? "word" : "words"}`,
    };
  }

  let words = 0;
  let numbers = 0;
  let prevNumber = false;
  for (const token of tokens) {
    if (isNumberToken(token)) {
      if (!prevNumber) numbers += 1;
      prevNumber = true;
    } else {
      words += 1;
      prevNumber = false;
    }
  }
  const over = tokens.length > 0 && (words > max || numbers > 1);
  const numberPart = numbers > 0 ? ` + ${numbers} number${numbers === 1 ? "" : "s"}` : "";
  return {
    limit,
    words,
    numbers,
    over,
    caption:
      max === 0
        ? `${numbers} / 1 number`
        : `${words} / ${max} ${max === 1 ? "word" : "words"}${numberPart}`,
  };
}

/** Render the 06 §2.1 instruction string (mirrors `instruction_for`). */
export function instructionFor(limitLike: WordLimit | number | null | undefined): string {
  const limit = wordLimitOf(limitLike);
  if (!limit) return "";
  const max = limit.max_words;
  if (max <= 0) return "Write A NUMBER for each answer.";
  if (max === 1) {
    return limit.numbers_allowed
      ? "Write ONE WORD AND/OR A NUMBER for each answer."
      : "Write ONE WORD ONLY for each answer.";
  }
  const names: Record<number, string> = { 2: "TWO", 3: "THREE", 4: "FOUR", 5: "FIVE" };
  const word = names[max] ?? String(max);
  return limit.numbers_allowed
    ? `Write NO MORE THAN ${word} WORDS AND/OR A NUMBER for each answer.`
    : `Write NO MORE THAN ${word} WORDS for each answer.`;
}

// ------------------------------------------------------------------- letters ---

/** Upper-cased letter tokens of a stored multi-select answer. */
export function splitLetters(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

/** How many letters a "choose TWO/THREE" group expects. */
export function selectCount(group: QuestionGroup): number {
  const declared = Number(group.select_count ?? 0);
  if (declared > 0) return declared;
  return group.questions?.length ?? 1;
}

// --------------------------------------------------------------- gap markers ---

/**
 * `{{14}}`, `{{gap}}`, `{{n}}` — the pack's gap placeholder.
 * A fresh instance per call: a shared /g regex carries `lastIndex` between
 * calls and would silently skip gaps.
 */
const GAP_PATTERN = "\\{\\{\\s*([0-9]+|gap|n)\\s*\\}\\}";

export function gapPattern(): RegExp {
  return new RegExp(GAP_PATTERN, "gi");
}

export interface GapToken {
  kind: "text" | "gap";
  value: string;
  /** Question number for a numbered gap; null for a bare `{{gap}}`. */
  number: number | null;
}

/** Split a prompt/layout string into literal text and gap tokens. */
export function splitGaps(source: string): GapToken[] {
  const out: GapToken[] = [];
  let last = 0;
  for (const match of source.matchAll(gapPattern())) {
    const at = match.index ?? 0;
    if (at > last) out.push({ kind: "text", value: source.slice(last, at), number: null });
    const raw = match[1];
    const n = /^[0-9]+$/.test(raw) ? Number(raw) : null;
    out.push({ kind: "gap", value: match[0], number: n });
    last = at + match[0].length;
  }
  if (last < source.length) {
    out.push({ kind: "text", value: source.slice(last), number: null });
  }
  return out;
}

export function hasGap(source: string): boolean {
  return gapPattern().test(source);
}

/** Every string a layout skeleton renders, in reading order. */
export function layoutStrings(
  layout: QuestionLayout | null | undefined,
  fallbackText?: string | null,
): string[] {
  if (!layout) {
    return String(fallbackText ?? "")
      .split(/\n+/)
      .filter((line) => line.trim().length > 0);
  }
  const kind = (layout.kind ?? "").toLowerCase();
  if (kind === "table" && layout.rows?.length) return layout.rows.flat().map(String);
  if (kind === "flow_chart" && layout.steps?.length) return layout.steps.map(String);
  if (layout.lines?.length) return layout.lines.map(String);
  const text = layout.text ?? fallbackText ?? "";
  return String(text)
    .split(/\n+/)
    .filter((line) => line.trim().length > 0);
}

/**
 * Question numbers the layout's gaps resolve to, in order. Bare `{{gap}}`
 * markers fall back to the group's own numbers by position.
 */
export function layoutGapNumbers(
  layout: QuestionLayout | null | undefined,
  fallbackText: string | null | undefined,
  groupNumbers: number[],
): number[] {
  const explicit: (number | null)[] = [];
  if ((layout?.kind ?? "").toLowerCase() === "diagram" || (layout?.kind ?? "").toLowerCase() === "map") {
    for (const label of layout?.labels ?? []) explicit.push(Number(label.number) || null);
  } else {
    for (const line of layoutStrings(layout, fallbackText)) {
      for (const token of splitGaps(line)) {
        if (token.kind === "gap") explicit.push(token.number);
      }
    }
  }
  return explicit.map((value, index) => value ?? groupNumbers[index] ?? 0).filter(Boolean);
}
