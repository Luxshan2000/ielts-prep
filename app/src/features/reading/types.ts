/**
 * Wire types for the reading module (06-reading-module.md §3/§4.2, 18 §4.9).
 *
 * These mirror what `sidecar/bandready/server/routes/reading.py` actually
 * returns. Everything the sidecar marks optional is optional here too — the
 * player must render a pack that omits, say, `difficulty` without crashing.
 */
import type { Reveal } from "./components/drills/types";

export type ReadingFormat = "academic" | "general_training";

/** The richer mode the player uses; the DB column only knows exam|practice. */
export type AttemptMode = "full" | "passage" | "drill";

export interface WordLimit {
  max_words: number;
  numbers_allowed: boolean;
}

export interface QuestionOption {
  key: string;
  text: string;
}

export interface Paragraph {
  id: string;
  text: string;
}

export interface TextBlock {
  id: string;
  heading?: string | null;
  paragraphs?: Paragraph[] | null;
}

export interface DiagramLabel {
  number: number;
  x: number;
  y: number;
}

/**
 * `layout` shapes from 06 §3. Packs are validated with `extra="allow"`, so the
 * renderer treats every field as optional and falls back to a plain gap list.
 */
export interface QuestionLayout {
  kind?: string | null;
  /** table */
  columns?: string[] | null;
  rows?: string[][] | null;
  /** flow_chart */
  steps?: string[] | null;
  /** note / summary */
  lines?: string[] | null;
  text?: string | null;
  title?: string | null;
  /** diagram / map */
  image?: string | null;
  alt?: string | null;
  labels?: DiagramLabel[] | null;
}

export interface AnswerVariant {
  value: string;
  note?: string | null;
}

export interface Question {
  number: number;
  prompt: string;
  /** MCQ options are per question in real tests; groups may also carry them. */
  options?: QuestionOption[] | null;
  anchor_paragraphs?: string[] | null;
  /** Only present with `?mode=review` on a submitted attempt. */
  answers?: AnswerVariant[] | null;
  explanation?: string | null;
  trap_note?: string | null;
  evidence_quote?: string | null;
  /** "Choose TWO letters" slots share a set. */
  set_id?: string | null;
  difficulty?: string | null;
  band_target?: number | null;
}

export interface QuestionGroup {
  id: string;
  type: string;
  /** Generated server-side from `word_limit` — never hand-typed. */
  instructions?: string | null;
  instructions_extra?: string | null;
  word_limit?: WordLimit | number | null;
  allow_reuse?: boolean | null;
  options?: QuestionOption[] | null;
  layout?: QuestionLayout | null;
  select_count?: number | null;
  /** Optional intro shown above the group (summary/notes heading). */
  heading?: string | null;
  summary?: string | null;
  summary_text?: string | null;
  questions?: Question[] | null;
}

export interface PassageDoc {
  id: string;
  passage_id?: string;
  position?: number;
  title: string;
  topic?: string | null;
  word_count?: number | null;
  difficulty?: string | null;
  gt_section?: number | null;
  texts?: TextBlock[] | null;
  question_groups?: QuestionGroup[] | null;
}

export interface TestDocument {
  schema_version?: number;
  id: string;
  format: ReadingFormat;
  title: string;
  source?: string | null;
  band_target?: number | null;
  answers_included?: boolean;
  passages: PassageDoc[];
}

// ------------------------------------------------------------------ catalog ---

export interface TestSummaryPassage {
  id: string;
  title: string;
  word_count: number | null;
  questions: number;
}

export interface TestSummary {
  id: string;
  format: ReadingFormat;
  title: string;
  source: string | null;
  generated: boolean;
  created_at: string | null;
  total_questions: number;
  band_target: number | null;
  passages: TestSummaryPassage[];
}

export interface PassageSummary {
  id: string;
  format: ReadingFormat;
  title: string;
  topic: string | null;
  difficulty: string;
  word_count: number | null;
  band_target: number | null;
  source: string | null;
  generated: boolean;
  questions: number;
  question_types: string[];
  created_at: string | null;
}

export interface Paged<T> {
  items: T[];
  next_cursor: string | null;
}

// ------------------------------------------------------------------- drills ---

export interface DrillItem {
  index: number;
  question_id: string;
  passage_id: string;
  passage_title: string | null;
  number: number;
  qtype: string;
  prompt: string;
  options?: QuestionOption[] | null;
  word_limit?: WordLimit | null;
  instructions?: string | null;
  anchor_paragraphs?: string[] | null;
  anchor_texts?: Paragraph[] | null;
}

export interface DrillSet {
  qtype: string;
  size: number;
  seconds_per_question: number;
  items: DrillItem[];
}

// ------------------------------------------------------------------ attempts ---

export interface Highlight {
  passage_id: string;
  text_id: string;
  paragraph_id: string;
  start_offset: number;
  end_offset: number;
  color?: string;
  quote?: string;
}

export interface StartAttemptRequest {
  test_id?: string | null;
  passage_id?: string | null;
  mode: AttemptMode;
  exam_conditions?: boolean;
  qtype?: string | null;
  size?: number;
  timer_s?: number | null;
}

export interface ResumeState {
  answers?: Record<string, unknown> | null;
  flags?: number[] | null;
  highlights?: Highlight[] | null;
  notes?: Record<string, unknown> | null;
  looked_up?: string[] | null;
  timer_s?: number | null;
}

export interface StartAttemptResponse extends Partial<TestDocument> {
  attempt_id: string;
  mode: AttemptMode;
  exam_conditions: boolean;
  timer_s: number;
  total_questions: number;
  resume_state: ResumeState;
  drill?: { qtype: string; items: DrillItem[] } | null;
}

export interface AttemptRecord {
  attempt_id: string;
  test_id: string | null;
  passage_id: string | null;
  mode: string;
  exam_conditions: boolean;
  status: "in_progress" | "submitted" | string;
  raw_score: number | null;
  total_questions: number | null;
  band: number | null;
  duration_s: number | null;
  submitted_at: string | null;
  resume_state: ResumeState;
}

export interface AutosaveAck {
  attempt_id: string;
  saved_at: string;
  answered: number;
  flagged: number;
  timer_s: number | null;
}

// ------------------------------------------------------------------- scoring ---

export interface MarkedQuestion {
  number: number;
  question_id: string | null;
  passage_id: string;
  qtype: string;
  given: string;
  correct: boolean;
  flagged: boolean;
  answered: boolean;
  near_miss_spelling?: boolean;
}

export interface TypeStats {
  correct: number;
  total: number;
}

export interface PassageStats {
  passage_id: string;
  title: string | null;
  correct: number;
  total: number;
}

export interface ScoreRecord {
  attempt_id: string;
  mode: AttemptMode | string;
  format: string;
  raw_score: number;
  total_questions: number;
  scaled_raw_40: number;
  band: number | null;
  band_is_estimate: boolean;
  band_disclaimer: string;
  per_question: MarkedQuestion[];
  per_type: Record<string, TypeStats>;
  per_passage: PassageStats[];
  weakest_type: ({ qtype: string } & TypeStats) | null;
  duration_s: number;
  auto_submitted: boolean;
}

export interface WhyWrongResult {
  number: number;
  explanation: string;
  trap?: string | null;
  tip?: string | null;
  model?: string | null;
  cached?: boolean;
  job_id?: string;
}

export interface LocateHint {
  passage_id: string;
  paragraph_id: string | null;
  anchor_paragraphs: string[] | null;
  evidence_quote: string | null;
}

export interface ReviewQuestion extends MarkedQuestion {
  prompt: string;
  options: QuestionOption[] | null;
  word_limit: WordLimit | null;
  instructions: string;
  accepted_answers: string[];
  explanation: string | null;
  trap_note: string | null;
  locate: LocateHint;
  why_wrong: WhyWrongResult | null;
  can_ask_why: boolean;
  /**
   * The authored Solution Card (staging-reading/DESIGN.md §1, §10 F1) — paraphrase link,
   * decision rule, distractor autopsy, trap slugs, rule to reuse. Built server-side by the
   * same `reveal_for` the drill reveal uses, so both surfaces show one card in one order.
   *
   * `null` on a `schema_version: 1` row that carries no teaching payload, and on a drill
   * attempt whose passage document could not be resolved. The card degrades to the
   * explanation alone rather than rendering an empty frame.
   */
  solution: Reveal | null;
}

export interface ReviewRecord extends Omit<ScoreRecord, "per_question"> {
  per_question: ReviewQuestion[];
  submitted_at: string | null;
}

// --------------------------------------------------------------- dictionary ---

export interface DictionarySense {
  pos: string;
  pos_code: string;
  definition: string;
  examples: string[];
  synonyms: string[];
}

export interface DictionaryEntry {
  available: boolean;
  status: string;
  detail: string | null;
  word: string;
  lemma: string;
  found: boolean;
  senses: DictionarySense[];
}
