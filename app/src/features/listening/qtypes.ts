/**
 * Question-type helpers for the Listening player.
 *
 * The families mirror `sidecar/bandready/content/generate_listening.py`
 * (`QUESTION_TYPES`, 07 §5). The word counter here is a *live hint* only — the
 * sidecar's `count_words` is the authority at marking time and the UI never
 * blocks submission on it.
 */

import type { ListeningQuestion, OptionBank, QuestionAsset } from "./types";

/** Types whose answer is a letter chosen from a lettered bank. */
export const LETTER_TYPES: ReadonlySet<string> = new Set(["multiple_choice", "matching"]);

/** Types whose gaps sit inside a layout skeleton in `prompt`. */
export const LAYOUT_TYPES: ReadonlySet<string> = new Set([
  "form_completion",
  "note_completion",
  "table_completion",
  "map_labelling",
]);

const TYPE_LABELS: Record<string, string> = {
  form_completion: "Form completion",
  note_completion: "Note completion",
  table_completion: "Table completion",
  sentence_completion: "Sentence completion",
  multiple_choice: "Multiple choice",
  matching: "Matching",
  map_labelling: "Map and plan labelling",
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

/** `{A: "…"}` or `["…"]` → `[["A", "…"], …]`. Unknown shapes give `[]`. */
export function optionEntries(options: OptionBank): [string, string][] {
  if (!options) return [];
  if (Array.isArray(options)) {
    return options.map((text, i) => [String.fromCharCode(65 + i), String(text)]);
  }
  if (typeof options === "object") {
    return Object.entries(options).map(([letter, text]) => [String(letter), String(text)]);
  }
  return [];
}

/** How many letters this question wants (multi-select MCQ carries `select_n`). */
export function letterCount(question: ListeningQuestion): number {
  return Math.max(1, question.select_n ?? question.slots ?? 1);
}

/** Canonical stored form for a letter answer: `"B, D"` — the sidecar splits on commas. */
export function joinLetters(letters: string[]): string {
  return [...letters].sort().join(", ");
}

export function splitLetters(value: string): string[] {
  return value
    .split(/[,;/\s]+/)
    .map((piece) => piece.trim().toUpperCase())
    .filter(Boolean);
}

/** IELTS word counting: a hyphenated compound is one word, a numeral is one word. */
export function countWords(raw: string): number {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** "NO MORE THAN TWO WORDS AND/OR A NUMBER" style hint from the folded integer limit. */
const NUMERALS = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX"];

export function wordLimitLabel(limit: number | null): string | null {
  if (!limit || limit < 1) return null;
  const word = NUMERALS[limit] ?? String(limit);
  return limit === 1 ? "ONE WORD AND/OR A NUMBER" : `NO MORE THAN ${word} WORDS AND/OR A NUMBER`;
}

/** Matches the authored gap markers: `______`, `....`, `……`. */
export const GAP_RE = /_{2,}|\.{4,}|…+/;

export function hasGap(text: string | null | undefined): boolean {
  return Boolean(text && GAP_RE.test(text));
}

/** A prompt is a markdown pipe table when two or more of its lines contain `|`. */
export function isMarkdownTable(text: string | null | undefined): boolean {
  if (!text) return false;
  const rows = text.split("\n").filter((line) => line.includes("|"));
  return rows.length >= 2;
}

export interface TableModel {
  header: string[];
  rows: string[][];
}

/** Parse a markdown pipe table; separator rows (`|---|---|`) are dropped. */
export function parseMarkdownTable(text: string): TableModel {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("|"));
  const cells = lines.map((line) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim()),
  );
  const body = cells.filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell)));
  const [header, ...rest] = body;
  return { header: header ?? [], rows: rest };
}

/** Absolute media path for a question's map/plan asset, or `null` when absent. */
export function assetMediaPath(asset: QuestionAsset): string | null {
  const raw =
    typeof asset === "string" ? asset : (asset?.src ?? asset?.path ?? null);
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^\/+/, "");
  if (!trimmed) return null;
  if (trimmed.startsWith("api/v1/media/")) return `/${trimmed}`;
  if (trimmed.startsWith("packs/")) return `/api/v1/media/packs/${trimmed.slice("packs/".length)}`;
  return `/api/v1/media/packs/${trimmed}`;
}

export function assetAlt(asset: QuestionAsset, fallback: string): string {
  if (asset && typeof asset === "object" && asset.alt) return asset.alt;
  return fallback;
}

/** Group consecutive questions that share an instruction into one block. */
export interface QuestionGroup {
  instruction: string | null;
  type: string;
  questions: ListeningQuestion[];
}

export function groupQuestions(questions: ListeningQuestion[]): QuestionGroup[] {
  const groups: QuestionGroup[] = [];
  for (const question of questions) {
    const last = groups[groups.length - 1];
    if (last && last.instruction === (question.instruction ?? null) && last.type === question.type) {
      last.questions.push(question);
    } else {
      groups.push({
        instruction: question.instruction ?? null,
        type: question.type,
        questions: [question],
      });
    }
  }
  return groups;
}

/** "Questions 11–20" / "Question 7". */
export function rangeLabel(questions: { number: number }[]): string {
  if (questions.length === 0) return "";
  const numbers = questions.map((q) => q.number);
  const first = Math.min(...numbers);
  const last = Math.max(...numbers);
  return first === last ? `Question ${first}` : `Questions ${first}–${last}`;
}
