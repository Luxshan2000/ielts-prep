/**
 * The reading teaching payload, as the content pack ships it.
 *
 * Three levels, all optional on the wire: `passage.teaching`, `group.teaching` and
 * `question.teaching` (staging-reading/DESIGN.md §§1–3). A pack authored before the
 * payload existed simply omits them, so every field here is optional and every
 * consumer is written to render the shape it actually received rather than the shape
 * it hoped for.
 *
 * Reading is receptive, so none of this is a "model answer": what decides a reading
 * mark is where the answer was, which words carried it, why the other options
 * failed, and which of the twenty-six traps the item was built to spring. Those are
 * the fields below.
 */

import type { PassageDoc, Question, QuestionGroup } from "../../types";

// ------------------------------------------------------------------ question ---

/**
 * The pair that turns "the answer is in paragraph C" into a teachable move: the
 * phrase in the question and the phrase in the text that it was written from.
 */
export interface ParaphraseLink {
  stem_phrase?: string | null;
  text_phrase?: string | null;
  /** Slugs from the 14-device list; two of them (scope/modality) change meaning. */
  devices?: string[] | null;
  note?: string | null;
}

/** One wrong option, autopsied: why it attracts, why it fails, and the code for it. */
export interface Distractor {
  key?: string | null;
  why_tempting?: string | null;
  why_wrong?: string | null;
  diagnosis?: string | null;
}

export type Gear = "skim" | "scan" | "search" | "close";

export interface QuestionTeaching {
  schema_version?: number;
  paraphrase_link?: ParaphraseLink | null;
  decision_rule?: string | null;
  distractors?: Distractor[] | null;
  reusable_rule?: string | null;
  traps?: string[] | null;
  /** Present only on NOT GIVEN keys: the sentence that nearly says it. */
  nearest_text?: string | null;
  grammar_cue?: string | null;
  gear?: Gear | string | null;
}

export interface CoachQuestion extends Question {
  teaching?: QuestionTeaching | null;
}

// --------------------------------------------------------------------- group ---

export type AnswerOrder = "sequential" | "scattered" | "section_local";

/** One unused bank option and the gap it was built to steal. */
export interface BankAnalysisEntry {
  key?: string | null;
  designed_to_tempt?: number | null;
  why_wrong?: string | null;
}

export interface GroupTeaching {
  schema_version?: number;
  answer_order?: AnswerOrder | string | null;
  section_scope?: string[] | null;
  strategy?: string | null;
  order_note?: string | null;
  time_budget_s?: number | null;
  watch_out?: string | null;
  bank_analysis?: BankAnalysisEntry[] | null;
}

export interface CoachGroup extends QuestionGroup {
  teaching?: GroupTeaching | null;
  questions?: CoachQuestion[] | null;
}

// ------------------------------------------------------------------- passage ---

export interface DifficultyRationale {
  levers?: string[] | null;
  note?: string | null;
  hardest_paragraph?: string | null;
  why_hardest?: string | null;
}

export interface SkimMapEntry {
  paragraph?: string | null;
  label?: string | null;
}

export interface SkimPlan {
  kind?: "paragraph_map" | "field_scan" | string | null;
  read_first?: string | null;
  skip?: string | null;
  budget_s?: number | null;
  map?: SkimMapEntry[] | null;
  fields?: string[] | null;
}

export interface ParaphraseFamily {
  concept?: string | null;
  passage_form?: string | null;
  paragraph?: string | null;
  rewordings?: string[] | null;
  cefr?: string | null;
}

export interface HingeWord {
  word?: string | null;
  kind?: string | null;
  why_here?: string | null;
}

export interface MineableItem {
  item?: string | null;
  paragraph?: string | null;
  cefr?: string | null;
  meaning?: string | null;
  /** The question this word could cost you — the whole discipline of the field. */
  blocks_q?: number | null;
}

export interface PassageMetrics {
  awl_pct?: number | null;
  mean_sentence_length?: number | null;
  longest_sentence?: number | null;
  unknown_token_pct?: number | null;
  attributed_opinions?: number | null;
  quantified_comparisons?: number | null;
  abstraction?: string | null;
}

export interface PassageTeaching {
  schema_version?: number;
  time_budget_min?: number | null;
  difficulty_rationale?: DifficultyRationale | null;
  skim_plan?: SkimPlan | null;
  paraphrase_families?: ParaphraseFamily[] | null;
  hinge_words?: HingeWord[] | null;
  mineable?: MineableItem[] | null;
  metrics?: PassageMetrics | null;
}

export interface CoachPassage extends PassageDoc {
  teaching?: PassageTeaching | null;
  question_groups?: CoachGroup[] | null;
}

// ------------------------------------------------------------------- helpers ---

/** A flat "one question with everything it needs to be explained" row. */
export interface SolutionRow {
  number: number;
  qtype: string;
  group: CoachGroup;
  question: CoachQuestion;
  teaching: QuestionTeaching | null;
  /** The first anchor paragraph, which is where the answer physically was. */
  anchor: string | null;
  anchors: string[];
}

export function solutionRows(passage: CoachPassage | null): SolutionRow[] {
  if (!passage) return [];
  const out: SolutionRow[] = [];
  for (const group of passage.question_groups ?? []) {
    for (const question of group.questions ?? []) {
      const anchors = (question.anchor_paragraphs ?? []).map(String);
      out.push({
        number: Number(question.number) || 0,
        qtype: group.type,
        group,
        question,
        teaching: question.teaching ?? null,
        anchor: anchors[0] ?? null,
        anchors,
      });
    }
  }
  return out.sort((a, b) => a.number - b.number);
}

/** True when the pack shipped anything worth teaching from on this passage. */
export function hasTeaching(passage: CoachPassage | null): boolean {
  if (!passage) return false;
  if (passage.teaching && Object.keys(passage.teaching).length > 1) return true;
  for (const group of passage.question_groups ?? []) {
    if (group.teaching && Object.keys(group.teaching).length > 1) return true;
    for (const question of group.questions ?? []) {
      if (question.teaching && Object.keys(question.teaching).length > 1) return true;
    }
  }
  return false;
}

/** True when the document carries the key — i.e. it came back from `mode=review`. */
export function hasKey(passage: CoachPassage | null): boolean {
  if (!passage) return false;
  for (const group of passage.question_groups ?? []) {
    for (const question of group.questions ?? []) {
      if ((question.answers?.length ?? 0) > 0) return true;
      if (question.explanation) return true;
    }
  }
  return false;
}

/** Every question type used on this passage, in document order, de-duplicated. */
export function typesUsed(passage: CoachPassage | null): string[] {
  const seen: string[] = [];
  for (const group of passage?.question_groups ?? []) {
    if (group.type && !seen.includes(group.type)) seen.push(group.type);
  }
  return seen;
}

/** The accepted answers of one question, flattened for display. */
export function acceptedAnswers(question: CoachQuestion): string[] {
  return (question.answers ?? [])
    .map((answer) => String(answer?.value ?? "").trim())
    .filter(Boolean);
}

/** Paragraph text by id, across every text block of the passage. */
export function paragraphTextMap(passage: CoachPassage | null): Map<string, string> {
  const map = new Map<string, string>();
  for (const block of passage?.texts ?? []) {
    for (const para of block.paragraphs ?? []) {
      map.set(String(para.id), para.text ?? "");
    }
  }
  return map;
}
