/**
 * The `teaching_json` payload a writing prompt carries, as the UI reads it.
 *
 * Authored against `content/core-en/staging-writing/DESIGN.md` §1–§5. Two rules
 * govern every type in this file:
 *
 *  1. **Absent by default.** The sixteen prompts that shipped before this payload
 *     existed have none, and a build whose sidecar predates the `teaching_json`
 *     column serves none either. Every field is therefore optional and every
 *     consumer renders an honest empty state rather than assuming.
 *  2. **Never narrower than the content.** The closed enums in DESIGN.md are typed
 *     as unions *widened with `string`*, so an authored value we have not met yet
 *     renders as itself instead of crashing a lookup or silently disappearing.
 */

/** The four criteria, lowercase, exactly as `rubrics.py` codes them. */
export type Criterion = "ta" | "cc" | "lr" | "gra";

/** DESIGN.md §5.1. `avoid` is band 6 only and never renders in a warning colour. */
export type AnnotationKind =
  | "move"
  | "overview"
  | "grammar"
  | "lexis"
  | "cohesion"
  | "register"
  | "data"
  | "avoid";

export interface TimePhase {
  /** `decode` · `plan` · `write` · `check`, in that order. */
  phase: string;
  minutes: number;
  does: string;
}

export interface PlanLine {
  /** `TENSE` / `OVERVIEW` / `GREETING` / `POSITION` … — the scratchpad's ghost text. */
  label: string;
  note: string;
}

export interface WorkedPlan {
  lines?: PlanLine[];
  /** How the learner knows the plan is good enough. */
  test?: string;
  /** The omission this prompt provokes. Report-only — never shown before submit. */
  trap?: string;
}

export interface StructureParagraph {
  para: number;
  /** `introduction` · `overview` · `detail_group` · `opening` · `bullet` · `body` · `conclusion` · `closing`. */
  role: string;
  /** A budget, not a count. */
  words: number;
  must_do: string;
}

export interface PartCheck {
  part: string;
  evidence_question: string;
}

export interface LanguageFrame {
  /** Always contains at least one `___`. A frame with no gap is a script. */
  frame: string;
  slot_hint: string;
}

export interface LanguageMove {
  /** `describing_trend` · `comparing` · `grouping` · … */
  move: string;
  why_here: string;
  grammar: string;
  frames?: LanguageFrame[];
  /** The plausible canned sentence that sits beside the good version. */
  avoid?: string;
}

export interface LanguageBank {
  warning?: string;
  moves?: LanguageMove[];
}

export interface Collocation {
  chunk: string;
  example: string;
  cefr: string;
}

export interface UpgradePair {
  vague: string;
  precise: string;
  why: string;
}

export interface TargetStructure {
  name: string;
  model: string;
  trap: string;
}

export interface WatchlistItem {
  pattern: string;
  wrong: string;
  right: string;
  why: string;
  criterion: Criterion | string;
}

export interface RewriteFocus {
  focus: string;
  why: string;
  /** A timed retry. Always names a duration.  */
  drill: string;
}

export interface LadderRung {
  band: number;
  text: string;
}

export interface SentenceLadder {
  idea?: string;
  rungs?: LadderRung[];
}

export interface SwapSlot {
  /** An exact substring of the band-7 model. */
  span: string;
  prompt: string;
}

export interface BandPoint {
  criterion: Criterion | string;
  point: string;
}

export interface ModelAnnotation {
  /** An exact substring of its own model text (lint 20). */
  span: string;
  kind: AnnotationKind | string;
  criterion: Criterion | string;
  label: string;
  why: string;
  transferable?: boolean;
}

export interface WritingModelAnswer {
  band_target: number;
  label: string;
  word_count: number;
  text: string;
  /** Band 6 only. */
  what_caps_it?: BandPoint[];
  /** Bands 7 and 8, measured against the rung below. */
  what_lifts_it?: BandPoint[];
  annotations?: ModelAnnotation[];
}

// ------------------------------------------------------- the per-type briefs ---

export interface WeakOverview {
  text: string;
  /** `W1`..`W10` — the failure taxonomy. */
  failure: string;
}

export interface OverviewGrouping {
  body1: string;
  body2: string;
  why: string;
}

export interface ProcessPhase {
  name: string;
  step_ids: string[];
}

/** Academic Task 1 only, and the biggest single scoring lever in the task. */
export interface OverviewBrief {
  /** Exactly two whole-data statements. */
  must_capture?: string[];
  /** One or two sentences containing no digit at all. */
  model_overview?: string;
  weak_overview?: WeakOverview;
  group_as?: OverviewGrouping;
  must_report?: string[];
  omit?: string[];
  figure_budget?: { min: number; max: number };
  tense?: string;
  /** Process diagrams only. Never on the diagram — that would hand over the overview. */
  phases?: ProcessPhase[];
}

export interface BulletNote {
  bullet_index: number;
  function: string;
  must_include: string;
  /** The second sentence. Coverage without extension is the band-6 ceiling here. */
  extension_move: string;
  tone_note: string;
}

export interface RegisterSignal {
  signal: string;
  do: string;
  dont: string;
}

/** General Training Task 1 only. */
export interface LetterBrief {
  purpose?: string;
  purpose_label?: string;
  register?: string;
  recipient?: string;
  greeting?: string;
  signoff?: string;
  moves?: string[];
  bullet_notes?: BulletNote[];
  register_signals?: RegisterSignal[];
  drift_watch?: string;
}

export interface IdeaBankEntry {
  side: string;
  claim: string;
  mechanism: string;
  /** A typical case or a category. Never a statistic, never a study. */
  evidence: string;
  consequence: string;
}

/** Task 2 only. */
export interface EssayBrief {
  question_type?: string;
  obligatory_shape?: string;
  axis?: number;
  axis_label?: string;
  position?: string;
  /** Exactly three: introduction, inside a body paragraph, conclusion. */
  position_touchpoints?: string[];
  idea_bank?: IdeaBankEntry[];
  development_drill?: { claim: string; ask: string };
  memorisation_test?: string;
}

// --------------------------------------------------------------- the payload ---

export interface WritingTeaching {
  schema_version?: number;
  cluster?: string;
  /** A capability, not a topic. */
  teaches?: string;
  /** The one behaviour this prompt trains. The rankable headline. */
  band_move?: string;
  exam_note?: string;
  time_plan?: TimePhase[];
  plan?: WorkedPlan;
  structure_plan?: StructureParagraph[];
  parts_checklist?: PartCheck[];
  language_bank?: LanguageBank;
  collocations?: Collocation[];
  upgrade_pairs?: UpgradePair[];
  target_structures?: TargetStructure[];
  error_watchlist?: WatchlistItem[];
  checklist?: string[];
  rewrite_focus?: RewriteFocus;
  sentence_ladder?: SentenceLadder;
  swap_slots?: SwapSlot[];
  model_answers?: WritingModelAnswer[];
  overview_brief?: OverviewBrief;
  letter_brief?: LetterBrief;
  essay_brief?: EssayBrief;
}

/** True when the payload carries enough to be worth opening the coach for. */
export function hasTeaching(teaching: WritingTeaching | null | undefined): boolean {
  if (!teaching) return false;
  return Boolean(
    teaching.teaches ||
      teaching.band_move ||
      (teaching.model_answers?.length ?? 0) > 0 ||
      (teaching.time_plan?.length ?? 0) > 0 ||
      (teaching.structure_plan?.length ?? 0) > 0,
  );
}
