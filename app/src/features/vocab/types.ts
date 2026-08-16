/**
 * Wire types for the vocabulary bank and the spaced-repetition scheduler.
 *
 * Every shape here is read from the sidecar, not invented:
 *  - `VocabEntry`      → `bandready/server/routes/vocab.py::serialize_entry` (08 §2)
 *  - `SrsCardPublic`   → `bandready/srs/scheduler.py::card_public`
 *  - `Exercise`        → `bandready/srs/exercises.py::build_exercise`
 *  - `QueueCounts`     → `bandready/srs/scheduler.py::counts`
 *  - `SrsStats`        → `bandready/srs/scheduler.py::stats` (§8)
 */

export type VocabStatus = "suggested" | "active" | "suspended" | "known";

export type VocabPos =
  | "noun"
  | "verb"
  | "adj"
  | "adv"
  | "prep"
  | "phrase"
  | "collocation"
  | "other";

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type SourceModule =
  | "speaking"
  | "writing"
  | "reading"
  | "listening"
  | "pronunciation"
  | "seed"
  | "manual";

export type CardState = "new" | "learning" | "review" | "relearning";
export type CardMaturity = "new" | "learning" | "young" | "mature";

export interface SrsCardPublic {
  card_id: string;
  state: CardState;
  state_code: number;
  step: number | null;
  stability: number | null;
  difficulty: number | null;
  /** ISO due timestamp. */
  due: string;
  last_review: string | null;
  reps: number;
  lapses: number;
  /** 0–1 estimated recall probability right now. */
  retrievability: number | null;
  maturity: CardMaturity;
}

export interface VocabSourceRef {
  module: SourceModule | string;
  session_id: string | null;
  detail: string | null;
}

/** One authored sentence together with where it belongs. */
export interface VocabSituation {
  text: string;
  /** "spoken" | "written" | "academic" | "both" — label it with `registerLabel`. */
  register: string | null;
  /** "speaking_p2", "writing_t2", … — label it with `skillLabel`. */
  skill: string | null;
}

export interface VocabConfusable {
  term: string;
  difference: string;
  minimal_pair: string[];
}

/**
 * How and where to use a word — the pack material `vocab_entries` has no columns for.
 *
 * Deck opt-in copies eight fields and drops the rest, so the situations a word belongs in,
 * whether it is a speaking or a writing word, and the thing not to say with it never
 * reached the bank. `GET /vocab/entries/{id}` reads them back off the pack row
 * (`routes/vocab.py::_usage_guidance`); it is absent when the pack knows nothing extra.
 */
export interface VocabUsage {
  register: string | null;
  avoid: string | null;
  situations: VocabSituation[];
  confusables: VocabConfusable[];
}

export interface VocabEntry {
  id: string;
  headword: string;
  lemma: string;
  is_phrase: boolean;
  ipa: string | null;
  pos: VocabPos | string;
  definition: string;
  own_context_sentence: string | null;
  own_context_origin: string | null;
  example_sentences: string[];
  collocations: string[];
  topic_tags: string[];
  cefr_level: CefrLevel | null;
  audio_ref: string;
  /** Sidecar-relative media path; sign it with `api.mediaUrl` before use. */
  audio_url: string;
  status: VocabStatus;
  created_at: string;
  updated_at: string;
  /** The first provenance row — only populated on bank/inbox reads. */
  source: VocabSourceRef | null;
  srs: SrsCardPublic | null;
  /** Only on the single-entry read, and only when the pack carries more than the bank. */
  usage?: VocabUsage | null;
}

// ------------------------------------------------------------------ exercises

export type ExerciseKind =
  | "flip"
  | "cloze"
  | "use_in_sentence"
  | "collocation"
  | "audio_recall"
  | "speaking_drill";

export interface FlipPayload {
  entry_id: string;
  front: {
    headword: string;
    ipa: string | null;
    pos: string | null;
    audio_url: string;
  };
  back: {
    definition: string | null;
    own_context_sentence: string | null;
    context_note: string;
    collocations: string[];
    example_sentences: string[];
    cefr_level: string | null;
  };
}

export interface ClozePayload {
  entry_id: string;
  masked_sentence: string;
  blanks: number;
  hint_first_letter: string;
  hint_length: number;
  ipa: string | null;
  pos: string | null;
  audio_url: string;
  definition: string | null;
}

export interface UseInSentencePayload {
  entry_id: string;
  headword: string;
  pos: string | null;
  definition: string | null;
  collocations: string[];
  checked_by: string;
}

export interface CollocationPayload {
  entry_id: string;
  fragments: string[];
  options: string[];
  definition: string | null;
}

export interface AudioRecallPayload {
  entry_id: string;
  audio_url: string;
  replay_sentence: string | null;
  pos: string | null;
}

export interface SpeakingDrillPayload {
  entry_id: string;
  headword: string;
  definition: string | null;
  injection: string;
}

export type ExercisePayload =
  | FlipPayload
  | ClozePayload
  | UseInSentencePayload
  | CollocationPayload
  | AudioRecallPayload
  | SpeakingDrillPayload;

export interface Exercise {
  type: ExerciseKind;
  /** May contain `**bold**` markers — render with `renderEmphasis`. */
  prompt: string;
  payload: ExercisePayload;
  /** Normalised acceptable answers; `null` for the self-rated / LLM-rated types. */
  expected: string[] | null;
}

// ------------------------------------------------------------------- queue ---

export type RatingLabel = "again" | "hard" | "good" | "easy";

export interface IntervalPreview {
  rating: number;
  /** Seconds until the card would come back; `null` when the preview failed. */
  interval_s: number | null;
  /** Pre-formatted human label ("10m", "3d", "1.2y", "—"). */
  label: string;
  due_at: string | null;
}

export type IntervalPreviews = Record<RatingLabel, IntervalPreview>;

export interface QueueItem {
  card_id: string;
  entry_id: string;
  entry: VocabEntry;
  exercise: Exercise;
  exercise_type: ExerciseKind;
  intervals: IntervalPreviews;
}

export interface QueueCounts {
  new: number;
  learning: number;
  relearning: number;
  young: number;
  mature: number;
  due_now: number;
  scheduled: number;
  new_available: number;
  new_remaining_today: number;
  reviews_done_today: number;
  reviews_remaining_today: number;
  due_today: number;
  suggested: number;
  active: number;
  suspended: number;
  known: number;
  entries: number;
}

export interface SessionResponse {
  items: QueueItem[];
  size: number;
  chunk_limit: number;
  mix: Partial<Record<ExerciseKind, number>>;
  counts: QueueCounts;
  remaining_after: number;
  streak: number;
  generated_at: string;
}

export interface ReviewResponse {
  card: SrsCardPublic;
  entry_id: string;
  rating: number;
  exercise_type: string;
  next_intervals: IntervalPreviews;
  logged_at: string;
  counts: QueueCounts;
}

export interface CheckSentenceResponse {
  /** `null` when the language model could not be reached (offline fallback). */
  acceptable: boolean | null;
  issues: string[];
  better_version: string;
  suggested_rating: number;
  checked: boolean;
  detail: string;
}

// ------------------------------------------------------------------- stats ---

export interface ForecastPoint {
  date: string;
  count: number;
}

export interface SourceBreakdown {
  module: string;
  entries: number;
  pct: number;
}

export interface SrsStats {
  counts: {
    new: number;
    learning: number;
    young: number;
    mature: number;
    suspended: number;
    known: number;
    suggested: number;
    active: number;
    entries: number;
    scheduled: number;
  };
  due_today: number;
  due_now: number;
  new_available: number;
  reviews_today: number;
  reviews_total: number;
  /** 0–1 over the trailing 30 days; `null` before any review-state review. */
  retention_30d: number | null;
  streak: number;
  forecast: ForecastPoint[];
  sources: SourceBreakdown[];
  limits: {
    desired_retention: number;
    new_per_day: number;
    review_cap: number;
  };
  generated_at: string;
}

// ------------------------------------------------------------------- decks ---

export interface SeedDeck {
  deck_id: string;
  pack_id: string;
  label: string;
  kind: "topic" | "awl" | "upgrade-pairs" | "other" | string;
  entries: number;
  in_bank: number;
  opted_in: boolean;
}

export interface DeckOptInResult {
  deck_id: string;
  imported: number;
  merged: number;
  total: number;
}

// ------------------------------------------------------------- browse/add ---

export type EntrySort = "recent" | "oldest" | "alpha" | "due";

export interface EntriesResponse {
  items: VocabEntry[];
  next_cursor: string | null;
}

export interface SuggestionsResponse {
  items: VocabEntry[];
  next_cursor: string | null;
  total: number;
}

export interface LookupPreview {
  headword: string;
  ipa: string | null;
  pos: VocabPos | string;
  definition: string;
  example_sentences: string[];
  collocations: string[];
  cefr_level: CefrLevel | null;
  topic_tags: string[];
}

export interface LookupResponse {
  word: string;
  lemma?: string;
  found: boolean;
  preview: LookupPreview | null;
}
