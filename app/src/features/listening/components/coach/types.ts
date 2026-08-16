/**
 * Wire types for the listening coach API.
 *
 * These mirror `sidecar/bandready/listening/coach.py` exactly — the coach has its own
 * routes under `/api/v1/listening/coach/*` and its own assemblers, and it is the only
 * place the teaching payload is ever serialised. The player's routes
 * (`/api/v1/listening/scripts/*`) build their responses from a fixed allowlist that has
 * no teaching key at any depth, so nothing here can be obtained from them.
 *
 * **Two properties of the shape are load-bearing and easy to lose in a refactor.**
 *
 * First, the gate is a *server* decision. `transcript.lines` is `[]` and `question.timeline`
 * is `null` until the learner has submitted an attempt covering this script. The client
 * never receives the gated half and therefore cannot leak it — the padlock is not a
 * `hidden` attribute over data already sitting in memory.
 *
 * Second, the enums arrive pre-labelled. `prediction.slot`, `signpost.kind`,
 * `distraction.trap` and `form.risk` come back as `{slug, label, …}` objects rather than
 * bare slugs, because they are simultaneously a content field, a review picker, a drill
 * filter and a progress axis, and a second copy of the vocabulary in TypeScript would be
 * a second thing to keep in sync. `labels.ts` supplies the learner-facing prose the API
 * does not carry, and nothing else.
 */

// --------------------------------------------------------------------- the gate ---

/** Why the timeline half is or is not available, in the sidecar's own words. */
export interface GateState {
  unlocked: boolean;
  /** `attempted` · `not_attempted` · `exam_conditions`. */
  reason: string;
  attempts: number;
  last_attempt_id: string | null;
  last_submitted_at: string | null;
  last_raw_score: number | null;
  /** `script` when sat alone, `test` when sat inside a full paper. */
  evidence: string | null;
  gated_fields: string[];
  message: string | null;
  /** Present only when a mock is what is holding it shut. */
  mock_id?: string | null;
}

/** `GET /listening/coach/exam-conditions`. */
export interface ExamConditions {
  active: boolean;
  mock_id: string | null;
  coaching_available: boolean;
  dictionary_enabled: boolean;
  prediction_gate_enabled: boolean;
  withheld: string[];
  message: string | null;
  current_part?: number | null;
}

// ------------------------------------------------------------- labelled enums ---

export interface SlotRef {
  slug: string;
  label: string;
  listening_for: string;
  hazard: string;
  p_code?: string;
}

export interface SignpostKindRef {
  slug: string;
  label: string;
  [key: string]: unknown;
}

export interface TrapRef {
  slug: string;
  label: string;
  family: string;
  family_label: string;
  what_happened: string;
  signal: string;
  fix: string;
}

export interface FormRiskRef {
  slug: string;
  label: string;
  [key: string]: unknown;
}

// ------------------------------------------------------- the five moments ---

/**
 * BEFORE — §1.1. Half-open by design, and the split is the whole pedagogy: `cue` is a
 * word already printed on the learner's page, so naming it teaches them where to look,
 * while `slot` is what the cue *implies* and deriving it is the exercise.
 */
export interface Prediction {
  cue: string | null;
  locked: boolean;
  slot: SlotRef | null;
  range: string | null;
  note: string | null;
}

/** APPROACH — §1.2. The marker that announced the answer, and the line it sat on. */
export interface Signpost {
  phrase: string;
  line_index: number | null;
  kind: SignpostKindRef | null;
}

/** §1.4 — in listening the *printed* side is the paraphrase and the audio is the original. */
export interface ParaphraseLink {
  printed: string;
  audio: string;
  note: string | null;
}

/** THE TRAP — §1.5. The wrong value the audio actually offered, and where it was said. */
export interface Distraction {
  traps: TrapRef[];
  trap: TrapRef | null;
  decoy: string | null;
  decoy_line_index: number | null;
  signal: string | null;
  note: string | null;
}

/** §1.6 — heard right, written wrong. Counted apart from comprehension, always. */
export interface FormNote {
  risk: FormRiskRef | null;
  note: string | null;
}

/** §1.8 — one entry per non-keyed option on a letter type. */
export interface OptionDiagnosis {
  option: string;
  verdict: string | null;
  heard_at: number | null;
  why_tempting: string | null;
  why_wrong: string | null;
}

/** The gated half of a question card: everything anchored to the audio. */
export interface QuestionTimeline {
  prediction: Prediction | null;
  signpost: Signpost | null;
  answer_quote: string | null;
  cue_line_index: number | null;
  cue_text: string | null;
  accepted_answers: string[][];
  paraphrase_link: ParaphraseLink | null;
  distraction: Distraction | null;
  decoy_text: string | null;
  option_diagnosis: OptionDiagnosis[];
  recovery: string | null;
  form: FormNote | null;
  explanation: string | null;
}

/** One question, as the coach serves it. `timeline` is `null` while the gate is shut. */
export interface QuestionCard {
  number: number | null;
  qtype: string;
  group_id: string | null;
  instruction: string | null;
  prompt: string | null;
  options: Record<string, string> | string[] | null;
  select_n: number | null;
  word_limit: unknown;
  prediction: Prediction | null;
  teaching_available: boolean;
  timeline: QuestionTimeline | null;
  locked: boolean;
}

// ------------------------------------------------------------------- groups ---

/** The static per-type page — written once, identical across the pack. */
export interface TypePage {
  qtype: string;
  label: string;
  tests: string;
  parts: number[];
  answer_order: string;
  order_badge: string;
  order_contrast: string;
  preview_move: string;
  during_move: string;
  characteristic_losses: string[];
  rule: string;
  typical_slots: SlotRef[];
}

/** §2 — the attack plan for one question group, instantiated for this script. */
export interface GroupStrategy {
  group_id: string | null;
  qtype: string;
  instruction: string | null;
  type_page: TypePage | null;
  question_numbers: number[];
  question_count: number;
  /** Always `"sequential"` in listening — nothing in this paper scatters (§2.1). */
  answer_order: string;
  order_badge: string;
  order_note: string | null;
  strategy: string | null;
  preview_focus: string | null;
  watch_out: string | null;
  spatial_cues: string[];
  bank_note: string | null;
  teaching_available: boolean;
}

// ------------------------------------------------------------- script level ---

export interface Lever {
  slug: string;
  note: string;
}

export interface HardnessNote {
  levers: Lever[];
  note: string | null;
  hardest_question: number | null;
  why_hardest: string | null;
}

export interface PreTeachItem {
  item: string;
  gloss: string | null;
  /** Gated — the address of the answer. */
  line_index: number | null;
  /** Gated — the mark this item could cost you. */
  blocks_q: number | null;
}

export interface PausePlanBlock {
  questions: number[];
  first_number: number | null;
  last_number: number | null;
  preview_line_index: number | null;
  preview_ms: number | null;
  cue_line_index: number | null;
  orient_line_index: number | null;
}

export interface PreviewStep {
  from_s: number;
  to_s: number;
  step: string;
}

export interface PausePlan {
  blocks: PausePlanBlock[];
  block_count: number;
  close_line_index: number | null;
  check_ms: number | null;
  whole_test_intro: boolean;
  preview_protocol: PreviewStep[];
  note: string;
}

export interface SignpostMapEntry {
  line_index: number | null;
  phrase: string;
  kind: SignpostKindRef | null;
}

export interface ScriptMetrics {
  spoken_words?: number;
  words_per_answer?: number;
  trapped_items?: number;
  clean_items?: number;
  spelled_out_answers?: number;
  speakers?: number;
  longest_line_chars?: number;
}

export interface TranscriptLine {
  index: number;
  speaker: string | null;
  text: string | null;
  pause_after_ms: number | null;
  /** Sample-accurate, from `timing.json`. `null` when the part is not rendered. */
  start_ms: number | null;
  end_ms: number | null;
}

export interface CoachTranscript {
  locked: boolean;
  lines: TranscriptLine[];
  line_count: number;
  timed?: boolean;
  message: string | null;
}

export interface CoachAudio {
  audio_hash: string | null;
  ready: boolean;
  duration_ms: number;
  media_path: string | null;
  timing_path: string | null;
}

export interface TrapProfileEntry extends TrapRef {
  questions: number[];
  count: number;
}

export interface Speaker {
  id?: string;
  name?: string;
  role?: string;
  [key: string]: unknown;
}

/** `GET /listening/coach/scripts/{id}/teaching`. */
export interface TeachingPayload {
  script_id: string;
  part: number;
  title: string;
  scenario: string | null;
  topic_id: string | null;
  accent_set: string;
  target_band: number | null;
  audio_hash: string | null;
  schema_version: number;

  teaching_available: boolean;
  /** How many timelines exist, even while they are withheld — so the UI sizes the lock. */
  timelines_available: number;
  question_count: number;
  audio: CoachAudio;

  // ---- ungated: preparation, worth most BEFORE the audio plays ----------------
  speakers: Speaker[];
  what_makes_this_hard: HardnessNote | null;
  pre_teach: PreTeachItem[];
  pause_plan: PausePlan | null;
  accent_note: string | null;
  metrics: ScriptMetrics | null;
  groups: GroupStrategy[];
  check_protocol: string[];
  check_note: string | null;
  last_value_rule: string | null;

  // ---- gated: everything anchored to the audio --------------------------------
  transcript: CoachTranscript;
  signpost_map: SignpostMapEntry[];
  questions: QuestionCard[];
  trap_profile: TrapProfileEntry[];
  line_count: number;

  gate: GateState;
  /** Present only on the locked-during-a-mock variant. */
  exam_conditions?: ExamConditions;
}

// -------------------------------------------------------------- predictions ---

export interface PredictionItem {
  number: number | null;
  qtype: string;
  group_id: string | null;
  instruction: string | null;
  prompt: string | null;
  word_limit: unknown;
  prediction: Prediction;
  /** False when the pack predates the teaching payload — the drill still runs. */
  authored: boolean;
}

export interface CueTableRow {
  printed: string;
  slot: string;
  note: string;
}

export interface SlotProfileEntry extends SlotRef {
  count: number;
}

/** `GET /listening/coach/predictions/{id}`. */
export interface PredictionsDoc {
  script_id: string;
  part: number;
  title: string;
  note: string;
  question_count: number;
  authored_count: number;
  items: PredictionItem[];
  /** Always open — a closed list of fourteen slots gives nothing away. */
  slots: Record<string, Omit<SlotRef, "slug">>;
  cue_table: CueTableRow[];
  preview_protocol: PreviewStep[];
  slot_profile: SlotProfileEntry[];
  locked: boolean;
  message: string | null;
  gate: GateState;
}

// ------------------------------------------------------------------ replay ---

/** One playable window into the rendered WAV. */
export interface ReplaySegment {
  /** `signpost` · `decoy` · `answer` — and the order they arrive in is the teaching. */
  role: string;
  line_index: number;
  text: string | null;
  start_ms: number | null;
  end_ms: number | null;
  /** Where the highlight belongs, as distinct from where playback starts. */
  seek_ms: number | null;
  duration_ms: number | null;
  playable: boolean;
}

/** `POST /listening/coach/replay`. */
export interface ReplayDoc {
  script_id: string;
  part: number;
  title: string;
  number: number;
  audio: CoachAudio;
  note: string;
  lead_in_ms: number;
  tail_ms: number;
  /** Ordered for playback: what announced it, what tempted you, what was actually said. */
  segments: ReplaySegment[];
  answer: ReplaySegment | null;
  signpost: (Signpost & { clip: ReplaySegment | null }) | null;
  distraction: (Distraction & { clip: ReplaySegment | null }) | null;
  answer_quote: string | null;
  accepted_answers: string[][];
  recovery: string | null;
  explanation: string | null;
  playable: boolean;
  render_hint?: string | null;
  gate: GateState;
}

// ----------------------------------------------------------------- helpers ---

/** True when this part carries anything the coach can actually teach from. */
export function hasTeaching(doc: TeachingPayload | null): boolean {
  return Boolean(doc?.teaching_available);
}

/** One line of the rendered audio, with the window it occupies. */
export interface LineTiming {
  index: number;
  start_ms: number;
  end_ms: number | null;
}

/**
 * Line index → its window in the WAV.
 *
 * Built from the transcript the coach already returned rather than by fetching
 * `timing.json` separately: the sidecar reads the stitch offsets when it assembles the
 * transcript, so the numbers are the same sample-accurate ones and asking twice would
 * only create a way for the two to disagree. Where the renderer wrote no `end_ms`, the
 * next line's start is exact enough for a replay window.
 */
export function timingsOf(doc: TeachingPayload | null): Record<number, LineTiming> {
  const lines = (doc?.transcript.lines ?? []).filter(
    (line): line is TranscriptLine & { start_ms: number } => typeof line.start_ms === "number",
  );
  const out: Record<number, LineTiming> = {};
  lines.forEach((line, position) => {
    out[line.index] = {
      index: line.index,
      start_ms: line.start_ms,
      end_ms: line.end_ms ?? lines[position + 1]?.start_ms ?? null,
    };
  });
  return out;
}

/** The group that owns a question number, or `null` when the pack has no index. */
export function groupOf(
  doc: TeachingPayload | null,
  number: number | null,
): GroupStrategy | null {
  if (number === null) return null;
  return (doc?.groups ?? []).find((g) => g.question_numbers.includes(number)) ?? null;
}

/** `[11, 12, 13]` → `"11–13"`; a single number reads as itself. */
export function blockLabel(numbers: number[] | undefined | null): string {
  if (!numbers || numbers.length === 0) return "";
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  return first === last ? String(first) : `${first}-${last}`;
}

/**
 * The script's structure markers, deduped on `(line_index, phrase)`.
 *
 * The authored `signpost_map` is the source; any per-question signpost missing from it is
 * folded in, because an answer whose marker is not on the map is exactly the one the
 * learner will ask about.
 */
export function signpostRows(doc: TeachingPayload | null): SignpostMapEntry[] {
  const seen = new Set<string>();
  const out: SignpostMapEntry[] = [];
  const push = (entry: SignpostMapEntry | Signpost | null | undefined) => {
    if (!entry || !entry.phrase || typeof entry.line_index !== "number") return;
    const key = `${entry.line_index}::${entry.phrase}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ line_index: entry.line_index, phrase: entry.phrase, kind: entry.kind ?? null });
  };
  for (const entry of doc?.signpost_map ?? []) push(entry);
  for (const question of doc?.questions ?? []) push(question.timeline?.signpost);
  return out.sort((a, b) => (a.line_index ?? 0) - (b.line_index ?? 0));
}

/** Questions whose audio set a decoy, in answer-sheet order. */
export function trapRows(
  doc: TeachingPayload | null,
): { question: QuestionCard; distraction: Distraction }[] {
  return (doc?.questions ?? [])
    .map((question) => ({ question, distraction: question.timeline?.distraction ?? null }))
    .filter(
      (row): row is { question: QuestionCard; distraction: Distraction } =>
        row.distraction !== null,
    );
}

/** Options normalised to `[letter, text]` pairs, whichever shape the pack used. */
export function optionPairs(
  options: QuestionCard["options"],
): [string, string][] {
  if (!options) return [];
  if (Array.isArray(options)) {
    return options.map((text, index) => [String.fromCharCode(65 + index), String(text)]);
  }
  return Object.entries(options).map(([key, value]) => [key, String(value)]);
}
