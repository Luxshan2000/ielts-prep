/**
 * Wire types for onboarding + placement (10 §2/§3, 18 §4.13/§4.15).
 * Mirrors `sidecar/bandready/server/routes/placement.py` and `models.py`.
 */

export type SkillKey = "listening" | "reading" | "writing" | "speaking";

export const SKILL_LABELS: Record<SkillKey, string> = {
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
};

export type ExamFormat = "academic" | "general_training";
export type SelfLevel = "beginner" | "intermediate" | "upper" | "advanced";

export const SELF_LEVELS: { value: SelfLevel; label: string; hint: string }[] = [
  { value: "beginner", label: "Beginner", hint: "Around band 4.5 — short sentences, lots of pauses" },
  {
    value: "intermediate",
    label: "Intermediate",
    hint: "Around band 5.5 — you get by, accuracy slips under pressure",
  },
  { value: "upper", label: "Upper intermediate", hint: "Around band 6.5 — fluent, some range gaps" },
  { value: "advanced", label: "Advanced", hint: "Around band 7.5 — comfortable, aiming for precision" },
];

export const WEEKDAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] as const;

export interface ProfileDraft {
  exam_format: ExamFormat;
  target_band: number;
  exam_date: string | null;
  self_level: SelfLevel;
  daily_minutes: 30 | 60 | 90;
  study_days: string[];
}

export const DEFAULT_DRAFT: ProfileDraft = {
  exam_format: "academic",
  target_band: 6.5,
  exam_date: null,
  self_level: "intermediate",
  daily_minutes: 60,
  study_days: ["mon", "tue", "wed", "thu", "fri", "sat"],
};

// ------------------------------------------------------------------ placement ---

export interface PlacementProgress {
  placement_id: string;
  step_index: number;
  step_count: number;
  done: boolean;
  sections: string[];
  skipped: string[];
}

export interface ReadingQuestionMeta {
  id: string;
  number: number;
  qtype: string;
  word_limit: number | null;
}

export interface DocQuestion {
  number?: number;
  n?: number;
  prompt?: string;
  text?: string;
  options?: { key?: string; text?: string }[] | string[] | null;
  type?: string;
}

export interface ReadingContent {
  passage_id?: string;
  title?: string;
  band_target?: number | null;
  passage?: {
    title?: string;
    texts?: { id?: string; heading?: string | null; paragraphs?: { id?: string; text?: string }[] | null }[] | null;
    question_groups?:
      | {
          id?: string;
          type?: string;
          instructions?: string | null;
          options?: { key?: string; text?: string }[] | null;
          questions?: DocQuestion[] | null;
        }[]
      | null;
  };
  questions?: ReadingQuestionMeta[];
  unavailable?: boolean;
  reason?: string;
}

export interface ListeningContent {
  script_id?: string;
  title?: string;
  part?: number;
  target_band?: number | null;
  audio_path?: string | null;
  script?: { scenario?: string | null; questions?: DocQuestion[] | null };
  questions?: ReadingQuestionMeta[];
  unavailable?: boolean;
  reason?: string;
}

export interface WritingContent {
  prompt_id?: string;
  task_type?: string;
  genre?: string | null;
  prompt_text?: string;
  chart_spec?: Record<string, unknown> | null;
  letter_bullets?: string[] | null;
  word_target?: [number, number] | number[];
  unavailable?: boolean;
  reason?: string;
}

export interface SpeakingContent {
  card_id?: string;
  title?: string;
  questions?: (string | { prompt?: string; text?: string })[];
  skippable?: boolean;
  skip_hint?: string;
  unavailable?: boolean;
  reason?: string;
}

export type StepContent =
  | ReadingContent
  | ListeningContent
  | WritingContent
  | SpeakingContent;

export interface PlacementStep {
  step: string;
  skill: SkillKey;
  minutes: number | null;
  half: number | null;
  skippable: boolean;
  content: StepContent;
  unavailable: boolean;
}

export interface PlacementStartResponse {
  placement_id: string;
  profile: Record<string, unknown>;
  estimated_minutes: number;
  progress: PlacementProgress;
  next: PlacementStep | null;
}

export interface PlacementAdvanceResponse {
  progress: PlacementProgress;
  next: PlacementStep | null;
  recorded?: string;
  skipped?: boolean;
}

export interface PlacementEstimate {
  band: number;
  skipped?: boolean;
  evidence?: Record<string, unknown>;
}

export interface PlacementResult {
  placement_id?: string;
  result_id?: string;
  estimates: Partial<Record<SkillKey, PlacementEstimate>>;
  confidence: string;
  sections_skipped?: string[];
  plan: PlanSummary | null;
  disclaimer?: string;
  nag?: string;
}

export interface PlanSummary {
  plan_id: string;
  horizon_weeks: number;
  goal_band: number;
  exam_date: string | null;
  sessions: {
    session_id: string;
    date: string;
    phase: string;
    duration_min: number;
    blocks: { kind: string; minutes: number; module?: string | null; activity?: string | null }[];
  }[];
  weights_by_week: Record<string, number | string>[];
}

// --------------------------------------------------------------------- models ---

export interface ArtifactFile {
  name: string;
  present: boolean;
  bytes: number;
  partial_bytes: number;
  expected_size: number | null;
}

export interface ArtifactState {
  artifact_id: string;
  kind: string | null;
  engine: string | null;
  label: string;
  path: string;
  approx_mb: number | null;
  state: "installed" | "partial" | "absent";
  files: ArtifactFile[];
}

/** `kind` is a wire slug; a learner reads the job the weights do. */
export const ARTIFACT_KIND_LABELS: Record<string, string> = {
  stt: "Speech to text — turns your recording into words",
  tts: "Examiner voice — reads the questions aloud",
};

export interface RecommendedDoc {
  platform: { os: string; arch: string; apple_silicon: boolean; ram_gb: number | null; tier: string };
  tier: string;
  recommended: {
    tier: string;
    label: string;
    advice: string;
    chat_quality: string;
    scoring_quality: string;
    llm_engine: string;
    llm_model: string;
  };
  cloud_alternative: { label: string; advice: string };
  required_artifacts: ArtifactState[];
}

/** `GET /providers/presets` — the closed list the model dropdowns come from (03 §4). */
export interface ProviderPreset {
  id: string;
  label: string;
  modalities: string[];
  kind: "local-server" | "cloud" | "local-inproc" | "mock" | string;
  base_url?: string;
  base_url_locked?: boolean;
  needs_key?: boolean;
  key_env_hint?: string;
  docs_url?: string;
  notes?: string;
  hidden?: boolean;
  suggested_models?: string[];
  models_by_modality?: Partial<Record<"llm" | "stt" | "tts", string[]>>;
}

/** `POST /providers/verify` — the only thing that knows whether scoring works. */
export interface VerifyResult {
  ok: boolean;
  state?: string;
  detail?: string;
  models?: string[];
  warnings?: string[];
  latency_ms?: number;
}

/** Per-engine guided setup the detect route attaches (03 §6). */
export interface SetupFlow {
  runnable: boolean;
  kind: "download" | "command" | "manual" | "none" | string;
  command?: string;
  artifact?: string;
  reason?: string;
  url?: string;
  /** A command BandReady will never run for you — copy-to-clipboard only. */
  copy?: string;
  instructions?: string;
}

export interface SetupJobView {
  state: "queued" | "running" | "done" | "error";
  pct: number | null;
  detail: string | null;
  error: string | null;
}

/** What the learner decided about marking on step 4. */
export type ScoringChoice = "local" | "cloud" | "later";

/**
 * The `llm` slot of the settings document, as the wizard writes it.
 * `PATCH /settings` deep-merges, so only the keys below are ever sent — the
 * learner's temperature, timeouts and every other slot survive untouched.
 */
export interface LlmSlotPatch {
  preset: string;
  base_url?: string;
  model?: string;
  api_key?: string;
}

/** The two settings fields step 5 needs to know which weights are actually in use. */
export interface EngineSettingsView {
  stt?: { engine?: string; preset?: string; model?: string };
  tts?: { engine?: string; preset?: string };
}

export interface DownloadState {
  pct: number | null;
  detail: string | null;
  state: "queued" | "running" | "done" | "error" | "cancelled";
  error: string | null;
}

// ------------------------------------------------------------------- engines ---

export interface EngineEntry {
  id: string;
  state: "running" | "installed" | "absent" | "unknown_server" | string;
  via?: string;
  models?: string[];
  base_url?: string;
  detail?: string;
  download_mb?: number;
}

export interface DetectDoc {
  platform: { os: string; arch: string; apple_silicon: boolean; ram_gb: number | null; tier: string };
  engines: EngineEntry[];
  setup?: Record<string, SetupFlow>;
}

export const ENGINE_LABELS: Record<string, string> = {
  ollama: "Ollama",
  lm_studio: "LM Studio",
  mlx_lm: "mlx-lm",
  llama_cpp: "llama.cpp",
  kokoro: "Kokoro (examiner voice)",
  kokoro_onnx: "Kokoro (examiner voice)",
  mlx_whisper: "MLX Whisper (speech to text)",
  faster_whisper: "faster-whisper (speech to text)",
  whisper_local: "Whisper (speech to text)",
};

/** The engines that answer "can BandReady score my writing and speaking?". */
export const LLM_ENGINE_IDS: readonly string[] = [
  "ollama",
  "lm_studio",
  "mlx_lm",
  "llama_cpp",
] as const;
