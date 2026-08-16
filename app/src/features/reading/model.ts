/**
 * Pure derivations over a reading document — no store, no network, no React.
 *
 * The player needs a flat, ordered view of "every markable question in this
 * attempt" (for the palette, keyboard navigation and the answered counter)
 * while the panes still render the nested `passages → question_groups → questions`
 * shape the pack ships.
 */

import type { QuestionStatus } from "@/components/ui";
import { MULTI_TYPES, splitLetters } from "./qtypes";
import type { DrillItem, PassageDoc, Question, QuestionGroup } from "./types";

export interface FlatQuestion {
  /** Answer key — the question number for tests, the item index for drills. */
  key: string;
  number: number;
  passageIndex: number;
  passageId: string;
  groupId: string;
  qtype: string;
  /** The group's first anchor paragraph, used by jump-to-question. */
  anchor: string | null;
}

function firstAnchor(question: Question, group: QuestionGroup): string | null {
  const own = question.anchor_paragraphs?.[0];
  if (own) return String(own);
  for (const sibling of group.questions ?? []) {
    const anchor = sibling.anchor_paragraphs?.[0];
    if (anchor) return String(anchor);
  }
  return null;
}

/** Every question of a test/passage document, in document order. */
export function flattenQuestions(passages: PassageDoc[]): FlatQuestion[] {
  const out: FlatQuestion[] = [];
  passages.forEach((passage, passageIndex) => {
    const passageId = passage.passage_id ?? passage.id;
    for (const group of passage.question_groups ?? []) {
      for (const question of group.questions ?? []) {
        const number = Number(question.number) || 0;
        out.push({
          key: String(number),
          number,
          passageIndex,
          passageId,
          groupId: group.id,
          qtype: group.type,
          anchor: firstAnchor(question, group),
        });
      }
    }
  });
  return out;
}

/** The same flat view for a drill (one "passage" per item, anchors only). */
export function flattenDrill(items: DrillItem[]): FlatQuestion[] {
  return items.map((item) => ({
    key: String(item.index),
    number: item.index,
    passageIndex: 0,
    passageId: item.passage_id,
    groupId: `drill:${item.question_id}`,
    qtype: item.qtype,
    anchor: item.anchor_paragraphs?.[0] ?? null,
  }));
}

export interface Range {
  start: number;
  end: number;
}

/** Contiguous 1-based window covering every question number in the attempt. */
export function numberWindow(questions: FlatQuestion[]): Range {
  if (questions.length === 0) return { start: 1, end: 1 };
  let start = Infinity;
  let end = -Infinity;
  for (const q of questions) {
    if (q.number < start) start = q.number;
    if (q.number > end) end = q.number;
  }
  return { start, end };
}

/** Human "Questions 1–7" (or "Question 4") for a group header. */
export function groupRangeLabel(group: QuestionGroup): string {
  const numbers = (group.questions ?? []).map((q) => Number(q.number) || 0).filter(Boolean);
  if (numbers.length === 0) return "Questions";
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  return min === max ? `Question ${min}` : `Questions ${min}-${max}`;
}

/**
 * Whether a stored answer counts as given. Multi-letter slots share one
 * checkbox set, so any member holding letters marks the whole set answered.
 */
export function isAnswered(answers: Record<string, string>, key: string): boolean {
  return (answers[key] ?? "").trim().length > 0;
}

/** `QuestionPalette` status map for the current attempt. */
export function paletteStatus(
  questions: FlatQuestion[],
  answers: Record<string, string>,
  flags: number[],
): Record<number, QuestionStatus> {
  const flagged = new Set(flags);
  const status: Record<number, QuestionStatus> = {};
  for (const q of questions) {
    if (flagged.has(q.number)) status[q.number] = "flagged";
    else if (isAnswered(answers, q.key)) status[q.number] = "answered";
    else status[q.number] = "blank";
  }
  return status;
}

export function answeredCount(
  questions: FlatQuestion[],
  answers: Record<string, string>,
): number {
  return questions.filter((q) => isAnswered(answers, q.key)).length;
}

/** Option letters already used by a no-reuse group (for greying out the bank). */
export function usedLetters(group: QuestionGroup, answers: Record<string, string>): Set<string> {
  const used = new Set<string>();
  for (const question of group.questions ?? []) {
    for (const letter of splitLetters(answers[String(question.number)])) used.add(letter);
  }
  return used;
}

/**
 * Distribute a chosen letter set across a multi-select group's answer slots:
 * one letter per question number, extras cleared. The sidecar unions the
 * slots back together when marking (`_mark`, MULTI_TYPES branch).
 */
export function distributeLetters(
  group: QuestionGroup,
  letters: string[],
): Record<string, string> {
  const numbers = (group.questions ?? []).map((q) => String(q.number));
  const patch: Record<string, string> = {};
  numbers.forEach((key, index) => {
    patch[key] = letters[index] ?? "";
  });
  return patch;
}

/** Letters currently chosen for a multi-select group, de-duplicated. */
export function chosenLetters(
  group: QuestionGroup,
  answers: Record<string, string>,
): string[] {
  if (!MULTI_TYPES.has(group.type)) return [];
  const out: string[] = [];
  for (const question of group.questions ?? []) {
    for (const letter of splitLetters(answers[String(question.number)])) {
      if (!out.includes(letter)) out.push(letter);
    }
  }
  return out;
}

// ------------------------------------------------------------------ passages ---

export interface ParagraphRef {
  passageId: string;
  passageIndex: number;
  textId: string;
  paragraphId: string;
  text: string;
}

/** Flat lookup of every paragraph, keyed `${passageId}:${paragraphId}`. */
export function paragraphIndex(passages: PassageDoc[]): Map<string, ParagraphRef> {
  const map = new Map<string, ParagraphRef>();
  passages.forEach((passage, passageIndex) => {
    const passageId = passage.passage_id ?? passage.id;
    for (const block of passage.texts ?? []) {
      for (const para of block.paragraphs ?? []) {
        map.set(`${passageId}:${para.id}`, {
          passageId,
          passageIndex,
          textId: block.id,
          paragraphId: String(para.id),
          text: para.text ?? "",
        });
      }
    }
  });
  return map;
}

export function passageIndexOf(passages: PassageDoc[], passageId: string): number {
  const index = passages.findIndex((p) => (p.passage_id ?? p.id) === passageId);
  return index < 0 ? 0 : index;
}

/** DOM id for a paragraph block — shared by the pane and locate-in-passage. */
export function paragraphDomId(passageId: string, paragraphId: string): string {
  return `rd-para-${passageId}-${paragraphId}`.replace(/[^\w-]/g, "_");
}

/** DOM id for a question card — shared by the palette and keyboard jumps. */
export function questionDomId(number: number): string {
  return `rd-q-${number}`;
}

// --------------------------------------------------------------------- notes ---

/** Notes keys the learner never sees (reserved for player bookkeeping). */
export const RESERVED_NOTE_PREFIX = "_";

export function noteKey(passageId: string, paragraphId: string): string {
  return `${passageId}:${paragraphId}`;
}

export function visibleNotes(notes: Record<string, string>): [string, string][] {
  return Object.entries(notes).filter(
    ([key, value]) => !key.startsWith(RESERVED_NOTE_PREFIX) && value.trim().length > 0,
  );
}

// ------------------------------------------------------------- highlighting ---

export interface TextSpan {
  text: string;
  highlight: boolean;
  evidence: boolean;
  /** Index of the covering highlight in the attempt's `highlights[]`, if any. */
  highlightId: number | null;
}

export interface SpanRange {
  start: number;
  end: number;
  kind: "highlight" | "evidence";
  /** Identity carried through so a rendered span can be removed again. */
  id?: number;
}

/**
 * Slice a paragraph into non-overlapping spans carrying their annotation flags.
 * Used for both learner highlights and review's evidence quote.
 */
export function sliceSpans(text: string, ranges: SpanRange[]): TextSpan[] {
  const clean = ranges
    .map((r) => ({
      ...r,
      start: Math.max(0, Math.min(r.start, text.length)),
      end: Math.max(0, Math.min(r.end, text.length)),
    }))
    .filter((r) => r.end > r.start);
  if (clean.length === 0) {
    return [{ text, highlight: false, evidence: false, highlightId: null }];
  }

  const cuts = new Set<number>([0, text.length]);
  for (const r of clean) {
    cuts.add(r.start);
    cuts.add(r.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const spans: TextSpan[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    if (to <= from) continue;
    const covering = clean.filter((r) => r.start <= from && r.end >= to);
    const owner = covering.find((r) => r.kind === "highlight");
    spans.push({
      text: text.slice(from, to),
      highlight: Boolean(owner),
      evidence: covering.some((r) => r.kind === "evidence"),
      highlightId: owner?.id ?? null,
    });
  }
  return spans;
}

/** Locate an evidence quote inside a paragraph (exact, then whitespace-loose). */
export function findQuote(text: string, quote: string): Range | null {
  const needle = (quote ?? "").trim();
  if (!needle) return null;
  const exact = text.indexOf(needle);
  if (exact >= 0) return { start: exact, end: exact + needle.length };

  // Whitespace-insensitive fallback: build a regex from the escaped words.
  const words = needle.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (words.length === 0) return null;
  const loose = new RegExp(words.join("\\s+"), "i");
  const match = loose.exec(text);
  if (!match) return null;
  return { start: match.index, end: match.index + match[0].length };
}

/** The sentence around an offset — the `sentence_context` a vocab entry keeps. */
export function sentenceAround(text: string, offset: number): string {
  const before = text.slice(0, offset);
  const after = text.slice(offset);
  const startMatch = before.lastIndexOf(". ");
  const start = startMatch >= 0 ? startMatch + 2 : 0;
  const endMatch = /[.!?](\s|$)/.exec(after);
  const end = endMatch ? offset + endMatch.index + 1 : text.length;
  return text.slice(start, end).trim();
}
