/**
 * Writing Desk feature store (feature-local, ephemeral — R2-23).
 *
 * Everything an attempt-in-progress needs lives here: the prompt bank browser,
 * the current draft (text, outline, elapsed seconds, paste counter, autosave
 * dirty flag), the pre-check gate and the `writing_eval` job poll. Nothing here
 * belongs in a global store.
 *
 * Wire contract: 18-api-contract.md §4.8 (`/api/v1/writing/...`); behaviour
 * 05-writing-module.md. The sidecar serves every `/attempts` path under
 * `/submissions` too — this client uses the documented `/attempts` noun.
 */

import { create } from "zustand";
import { api, ApiError } from "@/lib/api";

// ------------------------------------------------------------------- types ---

export type TaskType = "ac_task1" | "gt_task1" | "task2";
export type AttemptMode = "practice" | "exam";
export type AttemptStatus = "draft" | "submitted" | "scored" | "failed";
export type CriterionKey = "ta" | "cc" | "lr" | "gra";

export type ChartKind =
  | "bar"
  | "grouped_bar"
  | "stacked_bar"
  | "line"
  | "pie"
  | "table"
  | "process"
  | "map";

export interface ChartSeries {
  name: string;
  values: number[];
}

export interface ChartStep {
  id: string;
  label: string;
  next?: string[];
}

export interface ChartFeature {
  label: string;
  shape: "rect" | "circle" | "road" | "river" | "tree" | string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ChartSnapshot {
  label: string;
  features: ChartFeature[];
}

/** 05 §2.2 `bandready:chart-spec:v1`. */
export interface ChartSpec {
  kind: ChartKind;
  title: string;
  unit?: string;
  x_axis?: { label?: string; categories?: string[] };
  y_axis?: { label?: string; min?: number; max?: number };
  series?: ChartSeries[];
  rows?: (string | number)[][];
  steps?: ChartStep[];
  snapshots?: ChartSnapshot[];
}

export interface WritingPrompt {
  id: string;
  task_type: TaskType;
  task_label: string;
  genre: string;
  difficulty: number;
  topic_id: string | null;
  topic_tags: string[];
  prompt_text: string;
  chart_spec: ChartSpec | null;
  letter_bullets: string[];
  min_words: number | null;
  time_limit_s: number | null;
  source: string;
  license: string | null;
  retired: boolean;
  created_at: string | null;
}

export type AnnotationType =
  | "grammar"
  | "vocabulary"
  | "spelling"
  | "punctuation"
  | "cohesion"
  | "register"
  | "task";

export interface EssayAnnotation {
  quote: string;
  type: AnnotationType;
  fix: string;
  explanation: string;
  start: number;
  end: number;
}

export interface UnanchoredAnnotation {
  quote: string;
  type: AnnotationType;
  fix: string;
  explanation: string;
}

export interface CriterionReport {
  key: CriterionKey;
  wire: string;
  band: number;
  comment: string;
  evidence_quotes: string[];
  evidence_ranges: { quote: string; start: number; end: number }[];
  unanchored_quotes: string[];
}

export interface StructureAnalysisDoc {
  paragraphs: { index: number; role: string; verdict: string }[];
  missing_elements: string[];
  summary: string;
}

export interface VocabSuggestion {
  term: string;
  replaces?: string;
  sentence_context?: string;
  source?: { kind: string; item_id: string };
}

export interface PrecheckItem {
  id: string;
  level: "pass" | "warn" | "block";
  message: string;
  [extra: string]: unknown;
}

export interface WritingEvaluation {
  id: string;
  created_at: string | null;
  llm_evaluation_id: string | null;
  prompt_version: string | null;
  overall_band: number;
  bands: Record<CriterionKey, number>;
  criteria: Partial<Record<CriterionKey, CriterionReport>>;
  annotations: EssayAnnotation[];
  unanchored: UnanchoredAnnotation[];
  structure_analysis: StructureAnalysisDoc;
  model_answer_outline: string[];
  prechecks: PrecheckItem[];
  vocab_suggestions: VocabSuggestion[];
}

export interface AttemptSummary {
  id: string;
  attempt_id?: string;
  prompt_id: string;
  parent_attempt_id: string | null;
  mode: AttemptMode;
  status: AttemptStatus;
  word_count: number;
  seconds_elapsed: number;
  overtime_seconds: number;
  paste_events: number;
  integrity_flag: string | null;
  submitted_at: string | null;
  overall_band: number | null;
  started_at: string | null;
  prompt?: {
    id: string;
    task_type: TaskType;
    genre: string;
    prompt_text: string;
  } | null;
}

export interface ParentAttempt {
  id: string;
  essay_text: string;
  word_count: number;
  overall_band: number | null;
  bands: Record<CriterionKey, number> | null;
  annotations: EssayAnnotation[];
  submitted_at: string | null;
}

export interface WritingAttempt extends AttemptSummary {
  essay_text: string;
  outline_text: string;
  prompt: WritingPrompt | null;
  min_words: number | null;
  time_limit_s: number | null;
  evaluation: WritingEvaluation | null;
  evaluations: {
    id: string;
    created_at: string | null;
    overall_band: number;
    bands: Record<CriterionKey, number>;
  }[];
  children: string[];
  parent: ParentAttempt | null;
}

export interface PrecheckReport {
  attempt_id: string;
  verdict: "pass" | "warn" | "block";
  checks: PrecheckItem[];
  blocks: PrecheckItem[];
  warnings: PrecheckItem[];
  word_count: number;
  min_words: number;
}

export interface WritingTemplate {
  id: string;
  category: string;
  title: string;
  body: string;
  teaching_note?: string;
}

export interface ModelAnswer {
  prompt_id: string;
  band: number;
  text: string;
  banner: string;
  cached?: boolean;
  created_at?: string;
}

export interface PromptFilters {
  task_type: TaskType | "all";
  genre: string | "all";
  difficulty: number | 0;
  q: string;
}

// ----------------------------------------------------------------- helpers ---

export const TASK_LABELS: Record<TaskType, string> = {
  ac_task1: "Academic Task 1",
  gt_task1: "General Training Task 1 (letter)",
  task2: "Task 2 (essay)",
};

export const TASK_SHORT: Record<TaskType, string> = {
  ac_task1: "AC Task 1",
  gt_task1: "GT Task 1",
  task2: "Task 2",
};

export const TASK_MINUTES: Record<TaskType, number> = {
  ac_task1: 20,
  gt_task1: 20,
  task2: 40,
};

export const TASK_MIN_WORDS: Record<TaskType, number> = {
  ac_task1: 150,
  gt_task1: 150,
  task2: 250,
};

/** Genres per task type (05 §1) — drives the pattern filter. */
export const TASK_GENRES: Record<TaskType, string[]> = {
  ac_task1: [
    "bar",
    "grouped_bar",
    "stacked_bar",
    "line",
    "pie",
    "table",
    "process",
    "map",
    "mixed",
  ],
  gt_task1: ["formal", "semi_formal", "informal"],
  task2: ["opinion", "discussion", "problem_solution", "two_part", "advantages_disadvantages"],
};

export const GENRE_LABELS: Record<string, string> = {
  bar: "Bar chart",
  grouped_bar: "Grouped bar",
  stacked_bar: "Stacked bar",
  line: "Line graph",
  pie: "Pie chart",
  table: "Table",
  process: "Process diagram",
  map: "Map pair",
  mixed: "Two visuals",
  formal: "Formal letter",
  semi_formal: "Semi-formal letter",
  informal: "Informal letter",
  opinion: "Opinion (agree/disagree)",
  discussion: "Discuss both views",
  problem_solution: "Problem and solution",
  two_part: "Two-part question",
  advantages_disadvantages: "Advantages and disadvantages",
};

export const CRITERION_ORDER: CriterionKey[] = ["ta", "cc", "lr", "gra"];

export function criterionLabel(key: CriterionKey, taskType?: TaskType | null): string {
  switch (key) {
    case "ta":
      return taskType === "task2" ? "Task Response" : "Task Achievement";
    case "cc":
      return "Coherence and Cohesion";
    case "lr":
      return "Lexical Resource";
    case "gra":
      return "Grammatical Range and Accuracy";
  }
}

export function genreLabel(genre: string): string {
  return GENRE_LABELS[genre] ?? genre.replace(/_/g, " ");
}

/**
 * IELTS word count, byte-for-byte identical to the sidecar's
 * `bandready.scoring.writing.count_words`: whitespace tokens containing at
 * least one ASCII letter or digit. Keeping the two in step matters because the
 * server recomputes it on every autosave and gates submission on it.
 */
export function countEssayWords(text: string): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  let count = 0;
  for (const token of trimmed.split(/\s+/)) {
    if (token && /[0-9A-Za-z]/.test(token)) count += 1;
  }
  return count;
}

export function message(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return err.isOffline
      ? "Couldn't reach the BandReady engine. It may still be starting — wait a few seconds and retry."
      : err.detail || fallback;
  }
  return err instanceof Error ? err.message || fallback : fallback;
}

const ATTEMPTS = "/api/v1/writing/attempts";
const enc = encodeURIComponent;

// ------------------------------------------------------------------- store ---

interface WritingState {
  // ---- prompt bank -------------------------------------------------------
  prompts: WritingPrompt[];
  promptsLoading: boolean;
  promptsError: string | null;
  filters: PromptFilters;
  setFilter: <K extends keyof PromptFilters>(key: K, value: PromptFilters[K]) => void;
  loadPrompts: () => Promise<void>;

  generating: boolean;
  generateDetail: string | null;
  generateError: string | null;
  /** Generate a fresh prompt (job kind `writing_prompt_generate`). */
  generatePrompt: (taskType: TaskType, genre?: string | null) => Promise<string | null>;

  // ---- history -----------------------------------------------------------
  history: AttemptSummary[];
  historyLoading: boolean;
  historyError: string | null;
  loadHistory: (promptId?: string) => Promise<void>;

  // ---- templates ---------------------------------------------------------
  templates: WritingTemplate[];
  templatesLoading: boolean;
  templatesError: string | null;
  loadTemplates: () => Promise<void>;

  // ---- the attempt being written or reviewed ------------------------------
  attempt: WritingAttempt | null;
  attemptLoading: boolean;
  attemptError: string | null;
  loadAttempt: (id: string) => Promise<WritingAttempt | null>;
  createAttempt: (promptId: string, mode: AttemptMode) => Promise<string | null>;
  rewriteAttempt: (
    id: string,
    opts?: { prefill?: boolean; mode?: AttemptMode },
  ) => Promise<string | null>;

  // ---- draft state (never persisted globally) ----------------------------
  essay: string;
  outline: string;
  secondsElapsed: number;
  pasteEvents: number;
  /** Largest single paste since the last autosave — the server flags > 40 words. */
  pendingPasteWords: number;
  dirty: boolean;
  saving: boolean;
  savedAt: number | null;
  saveError: string | null;

  setEssay: (text: string) => void;
  setOutline: (text: string) => void;
  tick: (seconds?: number) => void;
  recordPaste: (words: number) => void;
  /** PATCH the draft when dirty (autosave every 10 s, on blur and on exit). */
  save: () => Promise<void>;
  resetDraft: () => void;

  // ---- pre-checks + submission ------------------------------------------
  precheck: PrecheckReport | null;
  prechecking: boolean;
  runPrecheck: () => Promise<PrecheckReport | null>;
  clearPrecheck: () => void;

  submitting: boolean;
  submitPct: number | null;
  submitDetail: string | null;
  submitError: string | null;
  /** Save → submit → poll `writing_eval` → reload the scored attempt. */
  submit: (opts?: { acknowledgeWarnings?: boolean }) => Promise<WritingAttempt | null>;
  clearSubmitError: () => void;
}

export const useWritingStore = create<WritingState>((set, get) => ({
  // ---------------------------------------------------------- prompt bank ---
  prompts: [],
  promptsLoading: false,
  promptsError: null,
  filters: { task_type: "all", genre: "all", difficulty: 0, q: "" },

  setFilter: (key, value) => {
    const filters = { ...get().filters, [key]: value };
    if (key === "task_type") filters.genre = "all";
    set({ filters });
    void get().loadPrompts();
  },

  loadPrompts: async () => {
    const { filters } = get();
    const params = new URLSearchParams({ limit: "100" });
    if (filters.task_type !== "all") params.set("task_type", filters.task_type);
    if (filters.genre !== "all") params.set("genre", filters.genre);
    if (filters.difficulty) params.set("difficulty", String(filters.difficulty));
    if (filters.q.trim()) params.set("q", filters.q.trim());
    set({ promptsLoading: true, promptsError: null });
    try {
      const res = await api.get<{ items: WritingPrompt[] }>(
        `/api/v1/writing/prompts?${params.toString()}`,
      );
      set({ prompts: res.items ?? [], promptsLoading: false });
    } catch (err) {
      set({
        prompts: [],
        promptsLoading: false,
        promptsError: message(err, "Couldn't load the prompt bank."),
      });
    }
  },

  generating: false,
  generateDetail: null,
  generateError: null,
  generatePrompt: async (taskType, genre) => {
    set({ generating: true, generateError: null, generateDetail: "asking the model…" });
    try {
      const started = await api.post<{ job_id: string }>("/api/v1/writing/prompts/generate", {
        task_type: taskType,
        ...(genre && genre !== "all" ? { genre } : {}),
      });
      const result = await api.pollJob<{ prompt_id: string }>(started.job_id, (job) =>
        set({ generateDetail: job.detail ?? null }),
      );
      set({ generating: false, generateDetail: null });
      await get().loadPrompts();
      return result?.prompt_id ?? null;
    } catch (err) {
      set({
        generating: false,
        generateDetail: null,
        generateError: message(err, "Couldn't generate a new prompt."),
      });
      return null;
    }
  },

  // -------------------------------------------------------------- history ---
  history: [],
  historyLoading: false,
  historyError: null,
  loadHistory: async (promptId) => {
    set({ historyLoading: true, historyError: null });
    const params = new URLSearchParams({ limit: "40" });
    if (promptId) params.set("prompt_id", promptId);
    try {
      const res = await api.get<{ items: AttemptSummary[] }>(`${ATTEMPTS}?${params.toString()}`);
      set({ history: res.items ?? [], historyLoading: false });
    } catch (err) {
      set({
        history: [],
        historyLoading: false,
        historyError: message(err, "Couldn't load your writing history."),
      });
    }
  },

  // ------------------------------------------------------------ templates ---
  templates: [],
  templatesLoading: false,
  templatesError: null,
  loadTemplates: async () => {
    if (get().templates.length > 0 || get().templatesLoading) return;
    set({ templatesLoading: true, templatesError: null });
    try {
      const items = await api.get<WritingTemplate[]>("/api/v1/writing/templates");
      set({ templates: Array.isArray(items) ? items : [], templatesLoading: false });
    } catch (err) {
      set({
        templates: [],
        templatesLoading: false,
        templatesError: message(err, "Couldn't load the templates library."),
      });
    }
  },

  // -------------------------------------------------------------- attempt ---
  attempt: null,
  attemptLoading: false,
  attemptError: null,

  loadAttempt: async (id) => {
    set({ attemptLoading: true, attemptError: null });
    try {
      const attempt = await api.get<WritingAttempt>(`${ATTEMPTS}/${enc(id)}`);
      const current = get().attempt;
      const keepLocalEdits = current?.id === id && get().dirty;
      set({
        attempt,
        attemptLoading: false,
        ...(keepLocalEdits
          ? {}
          : {
              essay: attempt.essay_text ?? "",
              outline: attempt.outline_text ?? "",
              secondsElapsed: attempt.seconds_elapsed ?? 0,
              pasteEvents: attempt.paste_events ?? 0,
              pendingPasteWords: 0,
              dirty: false,
              saveError: null,
            }),
      });
      return attempt;
    } catch (err) {
      set({
        attemptLoading: false,
        attemptError: message(err, "That writing attempt could not be loaded."),
      });
      return null;
    }
  },

  createAttempt: async (promptId, mode) => {
    try {
      const created = await api.post<WritingAttempt & { attempt_id: string }>(ATTEMPTS, {
        prompt_id: promptId,
        mode,
      });
      set({
        attempt: created,
        essay: created.essay_text ?? "",
        outline: created.outline_text ?? "",
        secondsElapsed: 0,
        pasteEvents: 0,
        pendingPasteWords: 0,
        dirty: false,
        saving: false,
        savedAt: null,
        saveError: null,
        precheck: null,
        submitError: null,
      });
      return created.attempt_id ?? created.id;
    } catch (err) {
      set({ attemptError: message(err, "Couldn't start that attempt.") });
      return null;
    }
  },

  rewriteAttempt: async (id, opts = {}) => {
    try {
      const child = await api.post<WritingAttempt & { attempt_id: string }>(
        `${ATTEMPTS}/${enc(id)}/rewrite`,
        { prefill: opts.prefill ?? true, ...(opts.mode ? { mode: opts.mode } : {}) },
      );
      set({
        attempt: child,
        essay: child.essay_text ?? "",
        outline: child.outline_text ?? "",
        secondsElapsed: 0,
        pasteEvents: 0,
        pendingPasteWords: 0,
        dirty: false,
        saving: false,
        savedAt: null,
        saveError: null,
        precheck: null,
        submitError: null,
      });
      return child.attempt_id ?? child.id;
    } catch (err) {
      set({ attemptError: message(err, "Couldn't open a rewrite of this attempt.") });
      return null;
    }
  },

  // ---------------------------------------------------------------- draft ---
  essay: "",
  outline: "",
  secondsElapsed: 0,
  pasteEvents: 0,
  pendingPasteWords: 0,
  dirty: false,
  saving: false,
  savedAt: null,
  saveError: null,

  setEssay: (text) => set({ essay: text, dirty: true }),
  setOutline: (text) => set({ outline: text, dirty: true }),
  tick: (seconds = 1) => set((s) => ({ secondsElapsed: s.secondsElapsed + seconds })),
  recordPaste: (words) =>
    set((s) => ({
      pasteEvents: s.pasteEvents + 1,
      pendingPasteWords: Math.max(s.pendingPasteWords, Math.max(0, Math.round(words))),
      dirty: true,
    })),

  save: async () => {
    const { attempt, dirty, saving, essay, outline, secondsElapsed, pasteEvents } = get();
    if (!attempt || saving) return;
    if (attempt.status !== "draft" && attempt.status !== "failed") return;
    if (!dirty) return;
    const pendingPasteWords = get().pendingPasteWords;
    set({ saving: true, dirty: false, saveError: null });
    try {
      const updated = await api.patch<AttemptSummary>(`${ATTEMPTS}/${enc(attempt.id)}`, {
        essay_text: essay,
        outline_text: outline,
        seconds_elapsed: Math.round(secondsElapsed),
        paste_events: pasteEvents,
        ...(pendingPasteWords > 0 ? { last_paste_words: pendingPasteWords } : {}),
      });
      set((s) => ({
        saving: false,
        savedAt: Date.now(),
        pendingPasteWords: 0,
        attempt: s.attempt
          ? {
              ...s.attempt,
              word_count: updated?.word_count ?? countEssayWords(essay),
              overtime_seconds: updated?.overtime_seconds ?? s.attempt.overtime_seconds,
              integrity_flag: updated?.integrity_flag ?? s.attempt.integrity_flag,
              paste_events: updated?.paste_events ?? s.attempt.paste_events,
              essay_text: essay,
              outline_text: outline,
            }
          : s.attempt,
      }));
    } catch (err) {
      // Keep the draft dirty so the next tick retries; the text is never lost.
      set({ saving: false, dirty: true, saveError: message(err, "Autosave failed.") });
    }
  },

  resetDraft: () =>
    set({
      attempt: null,
      attemptError: null,
      essay: "",
      outline: "",
      secondsElapsed: 0,
      pasteEvents: 0,
      pendingPasteWords: 0,
      dirty: false,
      saving: false,
      savedAt: null,
      saveError: null,
      precheck: null,
      submitting: false,
      submitPct: null,
      submitDetail: null,
      submitError: null,
    }),

  // ----------------------------------------------------- pre-check/submit ---
  precheck: null,
  prechecking: false,
  runPrecheck: async () => {
    const attempt = get().attempt;
    if (!attempt) return null;
    set({ prechecking: true });
    try {
      await get().save();
      const report = await api.get<PrecheckReport>(`${ATTEMPTS}/${enc(attempt.id)}/precheck`);
      set({ precheck: report, prechecking: false });
      return report;
    } catch (err) {
      set({ prechecking: false, submitError: message(err, "Couldn't run the pre-checks.") });
      return null;
    }
  },
  clearPrecheck: () => set({ precheck: null }),

  submitting: false,
  submitPct: null,
  submitDetail: null,
  submitError: null,
  clearSubmitError: () => set({ submitError: null }),

  submit: async (opts = {}) => {
    const attempt = get().attempt;
    if (!attempt) return null;
    set({ submitting: true, submitPct: 0, submitDetail: "sending your answer", submitError: null });
    try {
      await get().save();
      const started = await api.post<{ job_id: string; attempt_id: string }>(
        `${ATTEMPTS}/${enc(attempt.id)}/submit`,
        { acknowledge_warnings: Boolean(opts.acknowledgeWarnings) },
      );
      await api.pollJob<{ attempt_id: string }>(started.job_id, (job) =>
        set({ submitPct: job.progress_pct, submitDetail: job.detail }),
      );
      const scored = await get().loadAttempt(attempt.id);
      set({ submitting: false, submitPct: null, submitDetail: null });
      return scored;
    } catch (err) {
      set({
        submitting: false,
        submitPct: null,
        submitDetail: null,
        submitError: message(err, "The examiner model couldn't score this answer."),
      });
      return null;
    }
  },
}));

// -------------------------------------------------------- one-shot helpers ---

/**
 * `GET /attempts/{id}/model-answer?band=` — 200 with the text on a cache hit,
 * else 202 `{job_id}` which we poll (18 §3, job kind `writing_model_answer`).
 */
export async function fetchModelAnswer(
  attemptId: string,
  band: number,
  onProgress?: (detail: string | null) => void,
): Promise<ModelAnswer> {
  const res = await api.get<Partial<ModelAnswer> & { job_id?: string }>(
    `${ATTEMPTS}/${enc(attemptId)}/model-answer?band=${band}`,
  );
  if (res.job_id) {
    const done = await api.pollJob<ModelAnswer>(res.job_id, (job) => onProgress?.(job.detail));
    return done;
  }
  return {
    prompt_id: res.prompt_id ?? "",
    band: res.band ?? band,
    text: res.text ?? "",
    banner: res.banner ?? `AI-generated exemplar at approximately Band ${band}.`,
    cached: res.cached,
    created_at: res.created_at,
  };
}

/**
 * 05 §10 — push accepted vocabulary upgrades into the suggestion inbox. They
 * land `status='suggested'` with no SRS card until the learner accepts them
 * (R2-5), so this is safe to call per chip.
 */
export async function sendVocabSuggestions(
  submissionId: string,
  items: VocabSuggestion[],
): Promise<number> {
  if (items.length === 0) return 0;
  const res = await api.post<{ ids: string[]; count: number }>("/api/v1/vocab/suggestions", {
    items: items.map((item) => ({
      term: item.term,
      sentence_context: item.sentence_context || undefined,
      source: { kind: "writing", item_id: submissionId },
    })),
  });
  return res?.count ?? res?.ids?.length ?? 0;
}
