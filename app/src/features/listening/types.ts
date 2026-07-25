/**
 * Wire types for the Listening module.
 *
 * Every shape here is read from `sidecar/bandready/server/routes/listening.py`
 * (07 §11 / 18 §4.10) — field names match the JSON exactly. Nothing is invented:
 * optional fields are optional because the server may omit them.
 */

/** `_audio_status()` — the render/cache state of one part's WAV. */
export interface AudioStatus {
  /** Present only when the render is already in the media cache. */
  audio_hash: string | null;
  /** The hash the render *will* have — always set, safe to build a path from. */
  expected_audio_hash: string;
  ready: boolean;
  duration_ms: number;
  /** `/api/v1/media/listening/<hash>.wav` — ticket-authed, Range-capable. */
  media_path: string;
  /** `/api/v1/media/listening/<hash>.timing.json` — bearer or ticket. */
  timing_path: string;
  accent_set: string | null;
  /** e.g. "Australian (approximated with British voices)" (07 §3). */
  accent_label: string;
}

export type ListeningQuestionType =
  | "form_completion"
  | "note_completion"
  | "table_completion"
  | "sentence_completion"
  | "multiple_choice"
  | "matching"
  | "map_labelling";

/** Lettered option bank; the server passes the authored value through unchanged. */
export type OptionBank = Record<string, string> | string[] | null;

/** `asset` on a map/plan question (07 §5) — a pack-relative path or a small object. */
export type QuestionAsset = string | { src?: string; path?: string; alt?: string } | null;

export interface ListeningQuestion {
  id: string;
  /** Answer-sheet number (renumbered across a whole test by the server). */
  number: number;
  source_number: number;
  type: ListeningQuestionType | string;
  instruction: string | null;
  prompt: string | null;
  options: OptionBank;
  select_n: number | null;
  asset: QuestionAsset;
  /** Total words allowed, already folded from `{words, numbers}` (07 §5). */
  word_limit: number | null;
  /** How many raw points this question carries (multi-select > 1). */
  slots: number;
  // Present only with `?with_answers=1` — never during a test.
  answers?: string[][];
  cue_line_index?: number | null;
  explanation?: string | null;
}

export interface ScriptSpeaker {
  id: string;
  name?: string;
  role?: string;
  accent?: string;
  voice?: string;
}

export interface ScriptLine {
  speaker?: string | null;
  text?: string | null;
  pause_after_ms?: number;
}

/** One part, as `_public_script()` returns it. */
export interface ListeningPart {
  id: string;
  part: number;
  title: string;
  scenario: string | null;
  accent_set: string | null;
  target_band: number | null;
  source: string | null;
  speakers: ScriptSpeaker[];
  questions: ListeningQuestion[];
  audio: AudioStatus;
  /** Only with `?with_answers=1`. */
  lines?: ScriptLine[];
}

export interface ListeningTestDetail {
  id: string;
  title: string;
  source: string | null;
  created_at: string | null;
  total_questions: number;
  audio_ready: boolean;
  parts: ListeningPart[];
}

export interface TestSummary {
  id: string;
  title: string;
  source: string | null;
  created_at: string | null;
  script_ids: string[];
  parts: { id: string; part: number; title: string; accent_set: string | null }[];
  audio_ready: boolean;
  audio_ready_parts: number;
  total_questions: number;
}

export interface ScriptSummary {
  id: string;
  part: number;
  title: string;
  accent_set: string | null;
  target_band: number | null;
  source: string | null;
  questions: number;
  audio: AudioStatus;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

/** `<audio_hash>.timing.json` (07 §3). */
export interface TimingLine {
  index: number;
  start_ms: number;
  end_ms?: number;
}

export interface TimingDoc {
  schema_version?: number;
  sample_rate?: number;
  duration_ms?: number;
  lines?: TimingLine[];
}

// ------------------------------------------------------------------ attempts ---

/** 07 §4 — `exam` and `practice` are the two the player offers; `accent_drill`
 *  is the re-render drill; `dictation` is reserved for the spelling mini-mode. */
export type AttemptMode = "exam" | "practice" | "dictation" | "accent_drill";

export interface AttemptCreated {
  attempt_id: string;
  mode: AttemptMode;
  test_id: string | null;
  script_id: string | null;
  total_questions: number;
  question_numbers: number[];
  resume_state: {
    answers: Record<string, string>;
    seconds_elapsed: number;
    play_count: number;
    current_part: number;
  };
}

export interface AttemptPatched {
  attempt_id: string;
  status: string;
  answered: number;
  seconds_elapsed: number;
  play_count: number;
  play_counts: Record<string, number>;
}

export interface ScoredQuestion {
  number: number;
  question_id: string;
  script_id: string;
  part: number;
  type: string;
  given: string;
  correct: boolean;
  points: number;
  max_points: number;
  over_limit: boolean;
  near_miss_spelling: boolean;
  accepted: string[][];
}

export interface SrsCandidate {
  term: string;
  sentence_context: string;
  source: { kind: string; item_id: string };
  card_type: string;
  audio_line_ref: { script_id: string; line_index: number | null } | null;
}

export interface SubmitResult {
  attempt_id: string;
  mode: AttemptMode;
  status: string;
  raw_score: number;
  total_questions: number;
  band: number | null;
  band_note: string | null;
  duration_s: number | null;
  submitted_at: string;
  per_question: ScoredQuestion[];
  per_type: Record<string, { correct: number; total: number }>;
  per_part: { script_id: string; part: number; title: string; correct: number; total: number }[];
  near_miss_spellings: number[];
  srs_candidates: SrsCandidate[];
}

export interface ReviewQuestion {
  number: number;
  question_id: string;
  type: string;
  instruction: string | null;
  prompt: string | null;
  options: OptionBank;
  word_limit: number | null;
  given: string;
  correct: boolean | null;
  accepted: string[][];
  explanation: string | null;
  cue_line_index: number | null;
  cue_text: string;
  /** Where the cue line starts in the WAV — drives jump-to-timestamp replay. */
  audio_ms: number | null;
  near_miss_spelling: boolean;
}

export interface ReviewTranscriptLine {
  index: number;
  speaker: string | null;
  text: string | null;
  start_ms: number | null;
}

export interface ReviewPart {
  script_id: string;
  part: number;
  title: string;
  accent_set: string | null;
  audio_hash: string | null;
  media_path: string | null;
  transcript: { speakers: ScriptSpeaker[]; lines: ReviewTranscriptLine[] };
  questions: ReviewQuestion[];
}

export interface ReviewDoc {
  attempt_id: string;
  mode: AttemptMode;
  status: string;
  raw_score: number | null;
  total_questions: number | null;
  band: number | null;
  duration_s: number | null;
  submitted_at: string | null;
  play_count: number;
  parts: ReviewPart[];
}

export interface RenderedPart {
  script_id: string;
  audio_hash: string;
  duration_ms?: number;
  cached?: boolean;
  media_path?: string;
  timing_path?: string;
  accent_set?: string | null;
  accent_label?: string;
}

/** `POST /tests/{id}/render` — 200 when every part was already cached. */
export interface TestRenderCached {
  test_id: string;
  cached: true;
  parts: RenderedPart[];
}

/** `POST /tests/{id}/render` — 202 with a `listening_render` job to poll. */
export interface TestRenderQueued {
  job_id: string;
  test_id: string;
  cached_parts: RenderedPart[];
  pending_parts: string[];
}

export type TestRenderResponse = TestRenderCached | TestRenderQueued;

/** `POST /scripts/{id}/render` — 200 payload, or 202 `{job_id, expected_audio_hash}`. */
export interface ScriptRenderResponse {
  script_id?: string;
  audio_hash?: string;
  duration_ms?: number;
  cached?: boolean;
  media_path?: string;
  timing_path?: string;
  accent_set?: string | null;
  accent_label?: string;
  job_id?: string;
  expected_audio_hash?: string;
}
