/**
 * Shapes returned by `/api/v1/listening/practice`.
 *
 * Two rules are worth reading before the types themselves, because they explain fields
 * that otherwise look missing.
 *
 * 1. **No item carries its key.** The server strips the dictated line, the answer, the
 *    signpost kind and the prediction slot before serialising, so there is nothing here a
 *    client could reveal early even by accident. Everything the learner is eventually shown
 *    arrives on `ItemResult.reveal`, with the verdict.
 * 2. **A set is a function of its seed.** `buildSet` returns a `seed`; grading must send it
 *    back with the identical filters or the server rebuilds a different set and refuses the
 *    responses.
 */

export type DrillKind = "dictation" | "numbers" | "signpost" | "prediction";

/** `numbers`: transcribe | form. `signpost`: recognise | cue. Empty on the other two. */
export type DrillMode = "transcribe" | "form" | "recognise" | "cue" | null;

export interface DrillModeInfo {
  mode: string;
  label: string;
  what: string;
}

export interface DrillKindInfo {
  kind: DrillKind;
  title: string;
  subtitle: string;
  trains: string;
  graded_by: string;
  needs: string;
  /** `required` — nothing runs without the render; `optional` — one mode does; `never`. */
  audio: "required" | "optional" | "never";
  modes: DrillModeInfo[];
  seconds_per_item: number;
  max_size: number;
}

export interface BucketInfo {
  bucket: string;
  name: string;
  what: string;
  next: string;
}

export interface KindsDoc {
  kinds: DrillKindInfo[];
  sizes: { min: number; default: number; max: number };
  buckets: BucketInfo[];
  why: string;
  honesty: string;
}

export interface CatalogueScript {
  script_id: string;
  title: string;
  part: number;
  accent_set: string;
  audio_ready: boolean;
  counts: Record<DrillKind, number>;
}

export interface Catalogue {
  part: number | null;
  accent_set: string | null;
  n_scripts: number;
  n_rendered: number;
  kinds: {
    kind: DrillKind;
    items: number;
    drillable: boolean;
    needs_audio: boolean;
    audio: "required" | "optional" | "never";
  }[];
  scripts: CatalogueScript[];
}

export interface AudioRef {
  audio_hash: string | null;
  ready: boolean;
  media_path: string | null;
  timing_path: string | null;
}

/**
 * A window inside the part's own WAV. `start_ms`/`end_ms` are what the player plays;
 * `line_start_ms` is where the line itself begins, which is what a `cue` press is scored
 * against — the clip deliberately opens earlier so the learner hears the run-up.
 */
export interface Clip {
  start_ms: number;
  end_ms: number;
  line_start_ms: number;
  line_end_ms: number;
}

export interface ScriptRef {
  id: string;
  title: string;
  part: number;
  accent_set: string;
  scenario?: string | null;
  audio: AudioRef;
}

export interface SlotOption {
  slug: string;
  label: string;
  what?: string;
}

export interface DrillItem {
  item_id: string;
  kind: DrillKind;
  mode?: DrillMode;
  index: number;
  script_id: string;
  script_title: string;
  part: number;
  accent_set: string;
  seconds: number;

  // dictation
  line_index?: number;
  speaker?: { id: string; name: string } | null;
  clip?: Clip | null;
  audio?: AudioRef | null;
  words?: number;
  why?: string;
  question_number?: number | null;

  // numbers + prediction
  number?: number;
  qtype?: string;
  prompt?: string;
  instruction?: string;
  word_limit?: { max_words: number; numbers_allowed: boolean } | null;
  slot?: string;
  slot_info?: { name: string; what: string; hazard: string } | null;
  detected?: boolean;
  spelled?: boolean;
  quote?: string | null;

  // signpost + prediction
  options?: SlotOption[];
  tolerance?: { early_ms: number; late_ms: number } | null;
  group_strategy?: { preview_focus: string | null; order_note: string | null } | null;
}

export interface DrillSet {
  kind: DrillKind;
  mode: DrillMode;
  seed: string;
  script: ScriptRef;
  size: number;
  seconds: number;
  items: DrillItem[];
}

export interface DrillResponse {
  item_id: string;
  given?: string | null;
  time_ms?: number | null;
  replays?: number | null;
}

/** One aligned token pair. `bucket` is null on an exact match. */
export interface DiffEntry {
  op: "equal" | "sub" | "del" | "ins";
  reference: string | null;
  given: string | null;
  bucket: string | null;
  index: number | null;
}

export interface Marking {
  given?: string | number | null;
  correct: boolean;
  key?: string | number | null;
  accepted?: string[];
  near_miss_spelling?: boolean;
  over_limit?: boolean;
  blank?: boolean;

  // dictation
  total?: number;
  exact?: number;
  heard?: number;
  missed?: number;
  accuracy?: number;
  exact_accuracy?: number;
  counts?: Record<string, number>;
  diff?: DiffEntry[];
  headline?: string;
  diagnoses?: (BucketInfo & { count: number })[];

  // prediction
  key_info?: { name: string; what: string; hazard: string } | null;
  chosen_info?: { name: string; what: string; hazard: string } | null;
  same_family?: boolean;
  note?: string | null;

  // signpost
  offset_ms?: number | null;
  verdict?: "on_time" | "early" | "late" | "no_press";
}

export interface Reveal {
  kind: DrillKind;
  reference?: string;
  line_index?: number | null;
  speaker?: { id: string; name: string } | null;
  before?: string | null;
  after?: string | null;
  replay?: Clip | null;

  quote?: string | null;
  cue_line_index?: number | null;
  cue_text?: string | null;
  prediction?: { slot: string; cue: string | null; range: string | null; note: string } | null;
  form?: { risk: string; what: string | null; note: string | null } | null;
  distraction?: {
    trap: string;
    decoy: string;
    decoy_line_index: number;
    signal: string;
    note: string;
  } | null;
  explanation?: string | null;

  phrase?: string | null;
  line_text?: string | null;
  kind_info?: { name: string; prompt: string } | null;

  cue?: string | null;
  range?: string | null;
  note?: string | null;
  slot_info?: { name: string; what: string; hazard: string } | null;
  paraphrase_link?: { printed: string; audio: string } | null;
}

export interface ItemResult {
  item_id: string;
  kind: DrillKind;
  mode?: DrillMode;
  index: number;
  script_id: string;
  number: number | null;
  line_index: number | null;
  correct: boolean;
  marking: Marking;
  time_ms: number | null;
  replays: number | null;
  reveal: Reveal;
}

export interface DrillSummary {
  headline: string;
  words_total?: number;
  words_heard?: number;
  words_exact?: number;
  spelling_only?: number;
  buckets?: (BucketInfo & { count: number })[];
  near_miss_spelling?: number;
  over_limit?: number;
  median_offset_ms?: number | null;
  late?: number;
  same_family?: number;
}

export interface DrillReport {
  drill_id: string | null;
  kind: DrillKind;
  mode: DrillMode;
  seed: string;
  script: ScriptRef;
  n_items: number;
  n_correct: number;
  accuracy: number;
  band: null;
  summary: DrillSummary;
  results: ItemResult[];
}

export interface BucketProfile {
  buckets: (BucketInfo & { count: number; share: number })[];
  note: string;
  form_note: string;
}

export interface SynonymCheck {
  script_id: string;
  number: number;
  printed: string;
  guesses: string[];
  verdicts: { guess: string; plausible: boolean; why: string | null }[];
  note: string | null;
  authored: { printed: string; audio: string } | null;
  authored_note: string;
  model: string | null;
}
