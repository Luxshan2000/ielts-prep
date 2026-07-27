/**
 * Wire types for `/api/v1/reading/practice` — the drill surface.
 *
 * These mirror `sidecar/bandready/server/routes/reading_drills.py` and
 * `sidecar/bandready/reading/drills.py` exactly. Two shapes are worth reading twice
 * before touching this file:
 *
 * 1. **`DrillItem` has no key.** No `answer_key`, no `traps`, no `evidence_quote`, no
 *    `decision_rule`. The server strips all of it, and none of it is optional-and-absent
 *    — it is *never sent* until the answer is in. If you find yourself reaching for a
 *    field here that would give an answer away, the field does not exist and adding it to
 *    the type will not summon it.
 * 2. **`Reveal` is the reply to a graded response**, not a property of an item. It
 *    arrives inside `ItemResult`, which is the only place a solution ever appears.
 *
 * The pack still contains `schema_version: 1` rows with no teaching payload, so every
 * teaching field below is nullable and the UI must render a solution card that has only
 * `explanation` without looking broken.
 */

export type DrillKind = "trap" | "type" | "paraphrase" | "skim";

export type TrapFamily = "judgement" | "proposition" | "locating" | "form";

export interface TrapInfo {
  slug: string;
  family: TrapFamily;
  /** Learner-facing name, e.g. "Phantom contradiction". */
  name: string;
  /** One or two sentences describing what actually happened. */
  what: string;
}

export interface TrapCount extends TrapInfo {
  count: number;
  drillable: boolean;
  /** Present in the bank but under the six-item floor a drill needs to teach a slug. */
  thin: boolean;
}

export interface TrapLoss extends TrapInfo {
  lost: number;
  drillable: boolean;
}

export interface DeviceInfo {
  slug: string;
  label: string;
  /** The scored distinction: a changing device is what makes a statement FALSE. */
  meaning: "preserving" | "changing";
  gloss: string;
}

export interface DrillKindInfo {
  kind: DrillKind;
  title: string;
  subtitle: string;
  trains: string;
  graded_by: string;
  needs: string;
  options: string[];
  seconds_per_item: number | null;
}

export interface TypeCount {
  qtype: string;
  count: number;
  drillable: boolean;
  answer_order: string | null;
  /** "In passage order" · "Not in order" · "All in one section". */
  order_badge: string | null;
  seconds_per_question: number | null;
}

export interface SkimTarget {
  passage_id: string;
  title: string | null;
  format: string;
  gt_section: number | null;
  word_count: number | null;
  items: number;
  window_s: number;
  plan_kind: string | null;
}

export interface Catalogue {
  format: string | null;
  passages: number;
  questions: number;
  passages_with_payload: number;
  types: TypeCount[];
  traps: TrapCount[];
  paraphrase: { links: number; passages: number; drillable: number };
  skim: SkimTarget[];
  trap_families: { family: TrapFamily; label: string }[];
}

export interface TrapCatalogue {
  families: { family: TrapFamily; label: string }[];
  traps: TrapCount[];
  profile: TrapLoss[];
  note: string;
}

// ---------------------------------------------------------------------------- items ---

export interface DrillOption {
  key: string;
  text: string;
}

export interface DrillContext {
  /** `band` is bounded search; `anchor` is the paragraph itself; `none` is neither. */
  kind: "anchor" | "band" | "none";
  paragraph_ids: string[];
  paragraphs: { id: string; text: string }[];
  note: string | null;
}

export interface GroupStrategy {
  qtype: string;
  answer_order: string | null;
  order_badge: string | null;
  strategy: string | null;
  order_note: string | null;
  watch_out: string | null;
  seconds_per_question: number | null;
}

export interface TwoStagePlan {
  one: { question: string; options: string[]; hint: string };
  two: { question: string; options: string[]; when: string };
  not_given_label: string;
}

export interface DrillItem {
  item_id: string;
  kind: DrillKind;
  index: number;
  question_id: string | null;
  passage_id: string;
  passage_title: string | null;
  number: number | null;
  qtype: string;
  prompt: string;
  seconds: number;
  options?: DrillOption[] | null;
  word_limit?: { max_words: number; numbers_allowed: boolean } | null;
  instructions?: string;
  instructions_extra?: string | null;
  context?: DrillContext;
  strategy?: GroupStrategy;
  difficulty?: string | null;
  band_target?: number | null;
  self_diagnosis_options?: TrapInfo[];
  /** Judgement drills: the three verdicts, in the order they are shown. */
  choices?: string[];
  two_stage?: TwoStagePlan;
  /** Paraphrase drills only. */
  stem_phrase?: string;
  source_prompt?: string;
  note?: string | null;
  device_step?: { question: string; options: string[]; why: string } | null;
  /** Skim drills only. */
  source?: "map_label" | "bank";
  label?: string;
}

export interface SkimWindowPlan {
  seconds: number;
  plan_kind: string | null;
  read_first: string | null;
  skip: string | null;
  fields: string[];
  rule: string;
}

export interface DrillSet {
  kind: DrillKind;
  seed: string;
  qtype: string | null;
  trap: string | null;
  trap_info: TrapInfo | null;
  bounded: boolean;
  two_stage: boolean;
  size: number;
  seconds: number;
  items: DrillItem[];
  passage?: {
    id: string;
    title: string | null;
    format: string;
    gt_section: number | null;
    word_count: number | null;
    texts: { id: string; heading?: string | null; paragraphs?: { id: string; text: string }[] }[];
  };
  window?: SkimWindowPlan;
}

// ------------------------------------------------------------------------- responses ---

export interface DrillResponse {
  item_id: string;
  given?: string | null;
  stage_one?: string | null;
  device_choice?: string | null;
  self_trap?: string | null;
  time_ms?: number | null;
}

// ----------------------------------------------------------------------------- marks ---

export interface Marking {
  correct: boolean;
  answered: boolean;
  given: string;
  over_limit?: boolean;
  near_miss_spelling?: boolean;
  /** A form or pacing failure, which is never a comprehension failure. */
  form_trap: string | null;
  key?: string;
  device?: {
    asked: boolean;
    given: string | null;
    key: string;
    correct: boolean;
    devices: DeviceInfo[];
    why: string;
  } | null;
}

export interface VerdictRow {
  verdict: string;
  role: "key" | "distractor";
  why_tempting: string | null;
  why_wrong: string | null;
  diagnosis: string | null;
}

export interface VerdictContrast {
  type: string;
  key: string;
  verdicts: VerdictRow[];
  /** The FALSE-vs-NOT-GIVEN line, stated for this statement rather than in general. */
  boundary: {
    key: string;
    rival: string;
    line: string;
    authored: string | null;
    tempting: string | null;
  };
  decision_rule: string | null;
  nearest_text: string | null;
  /** False on a pre-payload row: render the boundary line alone, not a three-row table. */
  complete: boolean;
}

export interface Distractor {
  key: string;
  why_tempting: string | null;
  why_wrong: string | null;
  diagnosis: string | null;
}

export interface Reveal {
  correct?: boolean;
  key?: string;
  accepted?: string[];
  location?: {
    passage_id: string;
    passage_title: string | null;
    anchor_paragraphs: string[];
    evidence_quote: string | null;
    paragraphs: { id: string; text: string }[];
    nearest_text: string | null;
  };
  paraphrase_link?: {
    stem_phrase: string;
    text_phrase: string;
    devices: string[];
    note: string | null;
  } | null;
  decision_rule?: string | null;
  explanation?: string | null;
  distractors?: Distractor[];
  reusable_rule?: string | null;
  traps?: TrapInfo[];
  trap_note?: string | null;
  gear?: string | null;
  grammar_cue?: string | null;
  contrast?: VerdictContrast | null;
  strategy?: GroupStrategy;
  self_diagnosis_options?: TrapInfo[];
  /** Paraphrase reveal. */
  kind?: "paraphrase" | "map_label";
  stem_phrase?: string;
  text_phrase?: string | null;
  note?: string | null;
  device?: Marking["device"];
  source_prompt?: string;
  passage_title?: string | null;
  label?: string;
}

export interface SelfDiagnosis {
  picked: string | null;
  picked_label: string | null;
  authored: string[];
  authored_labels: string[];
  agreed: boolean;
  comparable: boolean;
}

export interface TwoStageResult {
  available: boolean;
  stage_one?: { given: string | null; key: string; correct: boolean };
  stage_two?: { given: string | null; key: string; correct: boolean; skipped: boolean } | null;
  diagnosis?:
    | "located_and_read"
    | "located_wrong_direction"
    | "did_not_locate"
    | "read_something_that_was_not_there";
}

export interface ItemResult {
  item_id: string;
  question_id: string | null;
  passage_id: string | null;
  number: number | null;
  qtype: string;
  correct: boolean;
  marking: Marking;
  traps: string[];
  self_diagnosis: SelfDiagnosis;
  two_stage: TwoStageResult | null;
  time_ms: number | null;
  reveal: Reveal;
}

export interface DrillReport {
  drill_id: string | null;
  kind: DrillKind;
  seed: string;
  n_items: number;
  n_correct: number;
  accuracy: number;
  /** Always null. A drill is not an assessment instrument. */
  band: null;
  per_trap: (TrapInfo & { seen: number; lost: number })[];
  self_diagnosis: { compared: number; agreed: number; note: string };
  two_stage: { stage_one_lost: number; note: string } | null;
  results: ItemResult[];
}

export interface ExplainBack {
  question_id: string;
  verdict: "aligned" | "partial" | "off";
  note: string | null;
  missing: string | null;
  decision_rule: string;
  reusable_rule: string | null;
  self_diagnosis: SelfDiagnosis;
  model: string | null;
}
