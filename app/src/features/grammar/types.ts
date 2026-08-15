/**
 * Grammar & Usage — the shapes this feature renders.
 *
 * These mirror `content/core-en/staging-grammar/DESIGN.md` §2 (the authored
 * `point_json`) and §6 (the features that consume it). Nothing here is invented
 * for the UI's convenience: a field exists in this file only because a screen
 * draws it, and it is spelled exactly as the content pack spells it.
 *
 * TOLERANCE RULE. The pack declares `schema_version: 1` and every consumer must
 * treat every field as absent-by-default (DESIGN §0.3). So all optional payload
 * is typed `| null | undefined` and every renderer guards it. A point authored
 * before a field existed must render, not crash.
 */

// ---------------------------------------------------------------- enums ----

/** The six ladder rungs (DESIGN §1.4). Stage 0 is the unscheduled first meeting. */
export type Stage = 0 | 1 | 2 | 3 | 4 | 5;

/** DESIGN §2.8 — 14 item kinds. Eleven of them grade mechanically. */
export type ItemKind =
  | "interpret"
  | "discover"
  | "gap_fill"
  | "order"
  | "transform"
  | "choose_form"
  | "contrast_pair"
  | "judge"
  | "both_ok"
  | "error_fix"
  | "dictation"
  | "combine"
  | "produce"
  | "speaking_drill";

export type PointRole = "form" | "choice" | "accuracy";
export type Register = "spoken" | "written" | "both" | "academic";
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type RiskTier = "A" | "B" | "C";
export type Criterion = "gra" | "cohesion" | "lexis" | "task" | "fluency" | "pronunciation";
export type SkillSurface =
  | "speaking_p1"
  | "speaking_p2"
  | "speaking_p3"
  | "writing_t1_academic"
  | "writing_t1_gt"
  | "writing_t2"
  | "reading"
  | "listening";

/** What the path screen paints on a point (DESIGN §6 F1). */
export type PointState = "locked" | "next" | "in_progress" | "practised" | "mastered";

/** DESIGN §1.8 — how an attempt is scored before FSRS sees a rating. */
export type Outcome = "pass" | "pass_slow" | "self_repair" | "fail" | "hint";

// ------------------------------------------------------- teaching payload ----

export interface FormSpec {
  pattern?: string | null;
  notes?: string[] | null;
  negative?: string | null;
  question?: string | null;
}

export interface TimelineMark {
  at: number;
  label: string;
  span_to?: number | null;
  style?: "point" | "bar" | "arrow" | "x" | null;
}

export type VisualSpec =
  | { now_label?: string | null; marks?: TimelineMark[] | null; caption?: string | null }
  | {
      left?: { role?: string | null; text?: string | null } | null;
      right?: { role?: string | null; text?: string | null } | null;
      arrow?: "left_to_right" | "right_to_left" | null;
      caption?: string | null;
    }
  | { ends?: [string, string] | string[] | null; marks?: { pos: number; label: string }[] | null }
  | { label?: string | null; steps?: { text: string; gloss?: string | null }[] | null }
  | {
      rungs?: { text: string; register?: string | null }[] | null;
      top_label?: string | null;
      bottom_label?: string | null;
    };

export interface Visual {
  kind: "timeline" | "two_box" | "axis" | "cline" | "ladder";
  spec: Record<string, unknown>;
}

export interface NoticeItem {
  sentence: string;
  question: string;
  options: string[];
  key: number;
  why?: string | null;
}

export interface Discovery {
  prompt: string;
  pairs?: string[][] | null;
  candidate_rules?: { text: string; verdict: "right" | "too_narrow" | "keyword_trap" | string }[] | null;
}

export interface Teach {
  can_do: string;
  why_it_matters?: string | null;
  meaning: string;
  form?: FormSpec | null;
  visual?: Visual | null;
  worked_example?: {
    sentence: string;
    why_this_form?: string | null;
    what_the_other_would_mean?: string | null;
  } | null;
  notice_set?: NoticeItem[] | null;
  discovery?: Discovery | null;
  rule_line?: string | null;
  false_rule?: string | null;
  grammar_name?: string | null;
}

/** DESIGN §2.4 — the five parts. Required when `role === "choice"`. */
export interface Contrast {
  with?: string[] | null;
  board_id?: string | null;
  question: string;
  fork?: { answer: string; selects: string; point_id?: string | null }[] | null;
  minimal_pair?: {
    a: { text: string; means: string };
    b: { text: string; means: string };
    only_difference?: string | null;
  } | null;
  wrong_choice_note?: string | null;
  edge_case?: { text: string; ignore_the_rest?: boolean | null } | null;
  stronger_test?: string | null;
  worked_pairs?: WorkedPair[] | null;
}

export interface WorkedPair {
  a: string;
  b: string;
  deciding_span_a?: string | null;
  deciding_span_b?: string | null;
  gloss?: string | null;
}

/** DESIGN §2.5 — the anti-pattern cards. */
export interface AuthoredError {
  code: string;
  wrong: string;
  right: string;
  why_it_happens?: string | null;
  smallest_fix?: string | null;
  gravity?: "global" | "local" | null;
  frequency?: "very_high" | "high" | "medium" | null;
  l1_note?: string | null;
}

export interface PaysIn {
  surface: SkillSurface | string;
  mode?: "productive" | "receptive" | null;
  note?: string | null;
  model?: string | null;
}

export interface UsedIn {
  module: "writing" | "speaking" | "reading" | "listening" | string;
  ref_id: string;
  quote?: string | null;
}

/** The whole authored payload for one point (DESIGN §2.2). */
export interface PointJson {
  schema_version?: number;
  grammar_name?: string | null;
  prerequisites?: string[] | null;
  unlocks_hint?: string | null;
  priority?: number | null;
  insertable?: boolean | null;
  register?: Register | null;
  risk_tier?: RiskTier | null;
  error_surface?: number | null;
  gravity?: "global" | "local" | null;
  confusion_set?: string | null;
  structure_slug?: string | null;
  signal_blocklist?: string[] | null;
  fixes_errors?: string[] | null;
  pays_in?: PaysIn[] | null;
  criteria?: Criterion[] | null;
  estimated_minutes?: number | null;
  tool_surface?: string | null;
  teach: Teach;
  contrast?: Contrast | null;
  errors?: AuthoredError[] | null;
  used_in?: UsedIn[] | null;
}

// --------------------------------------------------------------- the path ----

/** One row on the path. The server joins the authored row to this learner's card. */
/** A point named from somewhere else — a prerequisite, an unlock. */
export interface PathPointRef {
  id: string;
  title: string;
}

export interface PathPoint {
  id: string;
  unit_id: string;
  sequence_index: number;
  /** The can-do line — never the grammatical name (DESIGN §2.1). */
  title: string;
  grammar_name?: string | null;
  cefr_level: CefrLevel | string;
  role: PointRole | string;
  estimated_minutes?: number | null;
  priority?: number | null;
  risk_tier?: RiskTier | string | null;
  confusion_set?: string | null;
  board_id?: string | null;
  prerequisites?: string[] | null;
  /**
   * Prerequisites not yet at Choose — why this row is locked. The server resolves
   * each to `{id, title}` so a locked row can name what it is waiting for without
   * a second lookup; it is NOT a list of ids.
   */
  blocked_by?: PathPointRef[] | null;
  /**
   * The deepest unmet prerequisite — the lesson that actually opens this one, which
   * is usually not the same as the nearest blocker.
   */
  start_here?: string | null;
  /** True on the single row the path is pointing at right now. */
  is_next_up?: boolean | null;
  state: PointState;
  /** Null until a card exists: the point has never been met. */
  stage: Stage | null;
  mastered?: boolean | null;
  due_at?: string | null;
  /** True when a real writing/speaking submission re-broke this point (§1.6). */
  wild_failure?: boolean | null;
  leech?: boolean | null;
}

export interface PathUnit {
  unit_id: string;
  title: string;
  /** A = the foundation, B = the main stretch, C = high-risk material (syllabus §). */
  track?: string | null;
  summary?: string | null;
  point_ids: string[];
  /** Server rollups. The screen recomputes from the rows it is actually showing. */
  done?: number | null;
  total?: number | null;
}

export interface PathSummary {
  total_points: number;
  started: number;
  practised: number;
  mastered: number;
  /** The one point the "Continue" button opens. Null on a cold start. */
  next_point_id?: string | null;
  /** How many grammar cards are due right now. */
  due_now?: number;
  /** Codes harvested from writing/speaking that have no lesson queued yet. */
  harvested_codes?: number;
  /** The honest duration line, authored server-side. */
  pace_note?: string | null;
}

export interface PathResponse {
  units: PathUnit[];
  points: PathPoint[];
  summary: PathSummary;
}

// ------------------------------------------------------------ point detail ----

export interface CardState {
  card_id: string | null;
  stage: Stage;
  stage_successes?: number;
  state?: number;
  due_at?: string | null;
  reps?: number;
  lapses?: number;
  leech?: boolean;
  mastered?: boolean;
  /** Stages the learner has genuinely cleared, for the stage bar. */
  cleared_stages?: Stage[];
  /** Set when a real submission re-broke it — the point screen opens on the board. */
  wild_failure_at?: string | null;
}

export interface PointDetail {
  id: string;
  unit_id: string;
  unit_title?: string | null;
  sequence_index: number;
  title: string;
  cefr_level: CefrLevel | string;
  role: PointRole | string;
  topic_id?: string | null;
  point_json: PointJson;
  card: CardState | null;
  state: PointState;
  /** Resolved prerequisite rows, so the screen can name them without a second fetch. */
  prerequisites?: { id: string; title: string; state: PointState }[] | null;
  unlocks?: { id: string; title: string }[] | null;
  /** How many items sit at each stage in this point's bank. */
  bank?: Partial<Record<`s${Stage}`, number>> | null;
}

// ---------------------------------------------------------------- session ----

/**
 * One item as delivered by the session builder.
 *
 * The answer keys (`key`, `reason_key`, `accepted_orders`, `expected`, and each
 * option's `why_this_means`) are stripped server-side and arrive in the `Reveal`
 * after the attempt. Grading is server-authoritative: this client never decides
 * whether an answer is right, so a stray key in the payload changes nothing.
 */
export interface SessionItem {
  id: string;
  point_id: string;
  point_title?: string | null;
  card_id?: string | null;
  /**
   * `gram` is a grammar item this module owns end to end. `lex` is a vocabulary
   * card the daily queue can interleave; it carries `review_via` because its
   * answer belongs to the SRS route, and `/api/v1/grammar/answer` rejects it.
   * Nothing in this feature can render or submit one yet.
   */
  family?: "gram" | "lex" | string | null;
  /** Where this item's answer has to be sent, when it is not the grammar route. */
  review_via?: string | null;
  kind: ItemKind;
  stage: Stage;
  register?: Register | string | null;
  topic_id?: string | null;
  confusion_set?: string | null;
  /** Set when the builder pulled a sibling in to keep a contrast honest (§1.9). */
  sibling_note?: string | null;
  /**
   * The span of the context that decides the answer.
   *
   * Shipped WITH the item rather than with the reveal, because F3's signal beat
   * has to point at where to look before the key exists: "look at what she says
   * in the second line" names the evidence, not the answer. It is only ever
   * painted after a wrong attempt or on the reveal — never on the front of a card.
   */
  decision_cue?: string | null;
  /** Shown above the item when the point was just re-taught after a lapse. */
  reteach?: { rule_line?: string | null; worked_example?: string | null } | null;
  payload: ItemPayload;
  /** True when this kind allows a second try before the reveal (F3's elicit beat). */
  retryable?: boolean | null;
  /** True when grading needs the model, so the UI can warn before it is offline. */
  needs_model?: boolean | null;
}

export interface OptionSpec {
  text: string;
  /** Revealed only after the answer (DESIGN §6 F3). */
  why_this_means?: string | null;
}

/** The union of every §2.7.1 payload, flattened — each renderer reads its own keys. */
export interface ItemPayload {
  // interpret
  sentence?: string | null;
  question?: string | null;
  options?: (string | OptionSpec)[] | null;
  mode?: string | null;
  slots?: string[] | null;
  // gap_fill / choose_form / both_ok
  context?: string | null;
  stem?: string | null;
  blanks?: number | null;
  lemma_hints?: string[] | null;
  follow_up?: { question: string } | null;
  // order
  tokens?: string[] | null;
  // transform
  given?: string | null;
  instruction?: string | null;
  starter?: string | null;
  // contrast_pair
  sentences?: string[] | null;
  meanings?: string[] | null;
  // judge
  acceptable?: boolean | null;
  reasons?: string[] | null;
  // error_fix
  error_span?: string | null;
  // dictation
  audio_text?: string | null;
  scored_tokens?: string[] | null;
  speed?: number | null;
  replay_slow?: number | null;
  /** Signed media URL for the spoken line, when the sidecar pre-rendered it. */
  audio_url?: string | null;
  // combine
  parts?: string[] | null;
  required_device?: string | null;
  // produce
  prompt_text?: string | null;
  required_structure?: string | null;
  min_words?: number | null;
  max_words?: number | null;
  task_ref?: string | null;
  /** §1.5 rule 7 — the word pulled out of the vocabulary queue for this sentence. */
  seed_word?: { headword: string; definition?: string | null; entry_id?: string | null } | null;
  // speaking_drill
  injection?: string | null;
  turns?: number | null;
}

/** What the server sends back once an attempt is final. */
export interface Reveal {
  /** The key, in whatever shape the kind uses. */
  key?: number | number[] | string | null;
  /** The exact substring of the context that decides it (DESIGN §2.7). */
  decision_cue?: string | null;
  /** Names the MEANING, not the verdict. */
  why_key?: string | null;
  /** One imperative sentence. */
  feed_forward?: string | null;
  /** Per-option meanings for choice items. */
  options?: OptionSpec[] | null;
  /** Every accepted surface form, for the type-in kinds. */
  accepted?: string[] | null;
  /** Free production: the smallest edit that would fix it. */
  minimal_fix?: string | null;
  /** "Three ways, all fine" — shown after a `combine` attempt. */
  models?: string[] | null;
  /** Which tokens the dictation actually scored, and how each went. */
  token_marks?: { token: string; correct: boolean }[] | null;
  /** The rule line, so "Add to my rules" has something to add. */
  rule_line?: string | null;
  /** The contrast board this item belongs to, for a one-tap deep link. */
  board_id?: string | null;
  /** True when the structure detector fired (DESIGN §2.9 check A). */
  structure_detected?: boolean | null;
  /** False when the grader could not reach a model and self-rating is the fallback. */
  checked?: boolean | null;
  /** Set when the follow-up question of a `both_ok` item has been answered. */
  follow_up_key?: number | null;
}

export interface AnswerResult {
  correct: boolean;
  /** Present only when the attempt was final — beat 1 of F3 withholds it. */
  reveal: Reveal | null;
  outcome?: Outcome | null;
  /** True when the card was written and FSRS moved. */
  committed: boolean;
  /** "in 4 days" — the interval the rating bought. */
  next_label?: string | null;
  stage_before?: Stage | null;
  stage_after?: Stage | null;
  /** Fired when the learner cleared the last condition on a point (§1.7). */
  mastered?: boolean | null;
  /** The one bespoke string in the module (F3): both halves of a twin, right. */
  twin_note?: string | null;
  /** Server's own words when a rejection was softened or a check was skipped. */
  note?: string | null;
}

export interface SessionCounts {
  total: number;
  /** How many of `total` are new (S0) rather than review. */
  new_points?: number;
  lex?: number;
  gram?: number;
}

export interface SessionResponse {
  session_id: string;
  items: SessionItem[];
  counts: SessionCounts;
  /** The stage-by-stage shape of the sitting, for the header (DESIGN §1.9). */
  plan?: { phase: string; label: string; count: number }[] | null;
  /** Why the session is empty, in the server's words. */
  empty_reason?: string | null;
}

/** One graded item, kept for the end-of-session summary. */
export interface SessionOutcome {
  itemId: string;
  pointId: string;
  pointTitle: string;
  kind: ItemKind;
  stage: Stage;
  correct: boolean;
  attempts: number;
  outcome: Outcome | null;
  nextLabel: string | null;
  feedForward: string | null;
}

// --------------------------------------------------------------- progress ----

export interface ErrorCodeStat {
  code: string;
  /** How many times this code has been recorded, in the window. */
  count: number;
  /** Where it came from: the drills, or a real submission. */
  from_skills?: number | null;
  /** For the "gone quiet" list: what it used to be. */
  was?: number | null;
  /** The lowest-sequence unlocked point that fixes it (route 1, DESIGN §1.3). */
  point_id?: string | null;
  point_title?: string | null;
  /** Set when that point's own prerequisites are unmet — the honest detour. */
  blocked_by_point_id?: string | null;
  blocked_by_title?: string | null;
  /** How many drill items exist carrying this code across all points. */
  drillable?: number | null;
}

export interface HarvestedError {
  id: string;
  code: string;
  module: "writing" | "speaking" | "reading" | "listening" | string;
  /** The learner's own sentence, verbatim. */
  learner_text?: string | null;
  fixed_text?: string | null;
  created_at: string;
  point_id?: string | null;
  point_title?: string | null;
  /** True when this arrived on a point already at stage ≥ 4 — a wild failure. */
  wild_failure?: boolean | null;
}

export interface RangeStructure {
  slug: string;
  label: string;
  state: "unmet" | "learning" | "controlled" | "mastered";
  point_id?: string | null;
  risk_tier?: RiskTier | string | null;
}

export interface ProgressResponse {
  /** The headline: the codes costing the most marks right now. */
  costing: ErrorCodeStat[];
  /** The inverse, and the motivating number: codes that have gone quiet. */
  quiet: ErrorCodeStat[];
  /** Points by ladder state, for the "shaky / solid" split. */
  shaky: PathPoint[];
  solid: PathPoint[];
  /** What speaking and writing have pushed into the queue. */
  harvested: HarvestedError[];
  /** F15 — the structures the learner now controls. */
  range: RangeStructure[];
  summary: PathSummary;
  /** True when no skills module has ever emitted a code (D6 has not landed). */
  harvest_available?: boolean | null;
}

// ----------------------------------------------------------- contrast board ----

export interface BoardMember {
  point_id: string;
  title: string;
  grammar_name?: string | null;
  selects?: string | null;
  state: PointState;
}

export interface BoardDetail {
  board_id: string;
  confusion_set?: string | null;
  question: string;
  members: BoardMember[];
  worked_pairs: WorkedPair[];
  wrong_choice_note?: string | null;
  stronger_test?: string | null;
  edge_case?: { text: string; ignore_the_rest?: boolean | null } | null;
  minimal_pair?: Contrast["minimal_pair"];
  /** The learner's own hit rate on this contrast, or null before any attempt. */
  accuracy?: { correct: number; total: number } | null;
  /** How many S3 items the "practise this contrast" button can assemble. */
  drillable?: number | null;
}

export interface BoardSummary {
  board_id: string;
  question: string;
  members: string[];
  accuracy?: { correct: number; total: number } | null;
}

// ---------------------------------------------------- patterns (vocabulary) ----

/**
 * The vocabulary surface this module owns (DESIGN §6 F11).
 *
 * `/vocab` owns the BANK — every word the learner has, its status, its decks, its
 * FSRS queue. This screen owns the SENTENCE: the multi-word chunks and frames, the
 * preposition that is welded to a word, the near-synonym that has to be told apart,
 * and which grammar point each of them lives inside. Nothing here duplicates the
 * bank; everything here links into it.
 */
export interface PatternEntry {
  entry_id: string;
  headword: string;
  pos?: string | null;
  definition?: string | null;
  cefr_level?: string | null;
  register?: Register | string | null;
  frequency_band?: number | null;
  unit_type?: "word" | "chunk" | "frame" | "collocation" | "family" | string | null;
  chunk?: {
    shape?: string | null;
    fixed_part?: string | null;
    open_slots?: { slot: string; fills?: string[] | null }[] | null;
    dependent_preposition?: string | null;
    is_frame?: boolean | null;
  } | null;
  contexts?: {
    id?: string | null;
    text: string;
    register?: string | null;
    topic_id?: string | null;
    skill_hook?: string | null;
    gap_span?: string | null;
    note?: string | null;
  }[] | null;
  confusables?: {
    term: string;
    difference: string;
    minimal_pair?: string[] | null;
  }[] | null;
  grammar_links?: string[] | null;
  avoid?: string | null;
  /** Whether this entry is already in the learner's own bank, and how it is going. */
  in_bank?: boolean | null;
  status?: string | null;
  due_at?: string | null;
}

export interface PatternsResponse {
  entries: PatternEntry[];
  total: number;
  /** Grammar points that have vocabulary hanging off them, for the filter row. */
  linked_points?: { id: string; title: string; count: number }[] | null;
  /** True when the pack in place predates entry_json v2 — nothing to show yet. */
  v2_available?: boolean | null;
}
