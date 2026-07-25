/**
 * Listening feature store (feature-local and ephemeral — R2-23).
 *
 * Owns three things:
 *
 * 1. the **library** (tests + part-scripts) and their audio-render state;
 * 2. the **attempt in progress** — answers, elapsed seconds, current part —
 *    mirrored to the sidecar by a debounced autosave so durability stays the
 *    server's job (the browser is never the source of truth);
 * 3. the **review** document for a submitted attempt.
 *
 * Exam-mode playback restrictions (one play, no seek) are enforced in the player
 * component; the store only records what happened via `PATCH .../attempts/{id}`
 * so `play_count` on the server matches reality.
 */

import { create } from "zustand";
import { api } from "@/lib/api";
import { friendlyMessage } from "@/lib/errors";
import type {
  AttemptCreated,
  AttemptMode,
  ListeningPart,
  ListeningTestDetail,
  Page,
  ReviewDoc,
  ScriptRenderResponse,
  ScriptSummary,
  SubmitResult,
  TestRenderResponse,
  TestSummary,
} from "./types";

// ------------------------------------------------------------------ helpers ---

const message = (err: unknown, fallback: string): string =>
  friendlyMessage(err, fallback);

/** Autosave debounce — long enough not to PATCH per keystroke, short enough
 *  that a crash loses at most a sentence. */
const AUTOSAVE_MS = 1200;

/** How often elapsed seconds are pushed to the server while a test runs. */
const HEARTBEAT_S = 15;

// ------------------------------------------------------------------- shapes ---

export interface PrepareState {
  /** `null` = the job has not reported a percentage yet (indeterminate bar). */
  pct: number | null;
  detail: string;
  jobId: string | null;
  running: boolean;
  error: string | null;
  done: boolean;
}

export interface AttemptState {
  id: string;
  mode: AttemptMode;
  testId: string | null;
  scriptId: string | null;
  /** Answer-sheet numbers in play order. */
  numbers: number[];
  /** Raw points available (multi-select questions carry more than one). */
  totalPoints: number;
  answers: Record<string, string>;
  seconds: number;
  currentPart: number;
  /** Script ids whose audio has been played at least once (exam mode: at most once). */
  played: string[];
  /** Script ids whose transcript the learner unlocked — those parts lock. */
  revealed: string[];
  submitted: boolean;
}

const IDLE_PREPARE: PrepareState = {
  pct: null,
  detail: "",
  jobId: null,
  running: false,
  error: null,
  done: false,
};

interface ListeningState {
  // ---------------------------------------------------------------- library --
  tests: TestSummary[] | null;
  testsLoading: boolean;
  testsError: string | null;
  scripts: ScriptSummary[] | null;
  scriptsLoading: boolean;
  scriptsError: string | null;
  loadLibrary: (force?: boolean) => Promise<void>;

  // ------------------------------------------------------- audio preparation --
  /** Keyed by test id or `script:<id>:<accent>`. */
  prepare: Record<string, PrepareState>;
  prepareState: (key: string) => PrepareState;
  prepareTest: (testId: string) => Promise<boolean>;
  prepareScript: (scriptId: string, accentSet?: string | null) => Promise<string | null>;
  cancelPrepare: (key: string) => Promise<void>;
  clearPrepareError: (key: string) => void;

  // ------------------------------------------------------------------ detail --
  detail: ListeningTestDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  loadTest: (testId: string) => Promise<ListeningTestDetail | null>;
  /** Loads one part-script and wraps it as a single-part "test" for the player. */
  loadScript: (scriptId: string) => Promise<ListeningTestDetail | null>;

  // ----------------------------------------------------------------- attempt --
  attempt: AttemptState | null;
  starting: boolean;
  startError: string | null;
  saving: boolean;
  saveError: string | null;
  submitting: boolean;
  submitError: string | null;
  result: SubmitResult | null;

  startAttempt: (opts: {
    testId?: string;
    scriptId?: string;
    mode: AttemptMode;
  }) => Promise<string | null>;
  setAnswer: (number: number, value: string) => void;
  setCurrentPart: (part: number) => void;
  tick: () => void;
  notePlayed: (scriptId: string) => void;
  revealPart: (scriptId: string) => void;
  flush: () => Promise<void>;
  submit: () => Promise<SubmitResult | null>;
  abandon: () => Promise<void>;
  resetAttempt: () => void;

  // ------------------------------------------------------------------ review --
  review: ReviewDoc | null;
  reviewLoading: boolean;
  reviewError: string | null;
  loadReview: (attemptId: string) => Promise<void>;
}

// Timers live outside the store: they are effects, not state, and must never
// trigger a re-render.
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingAnswers: Record<string, string> = {};
let secondsSinceSync = 0;

function clearAutosave(): void {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
}

export const useListeningStore = create<ListeningState>((set, get) => ({
  // ---------------------------------------------------------------- library --
  tests: null,
  testsLoading: false,
  testsError: null,
  scripts: null,
  scriptsLoading: false,
  scriptsError: null,

  loadLibrary: async (force = false) => {
    const { tests, scripts, testsLoading, scriptsLoading } = get();
    if (!force && tests && scripts) return;
    if (testsLoading || scriptsLoading) return;
    set({ testsLoading: true, scriptsLoading: true, testsError: null, scriptsError: null });

    const [testsResult, scriptsResult] = await Promise.allSettled([
      api.get<Page<TestSummary>>("/api/v1/listening/tests?limit=100"),
      api.get<Page<ScriptSummary>>("/api/v1/listening/scripts?limit=200"),
    ]);

    set({
      testsLoading: false,
      scriptsLoading: false,
      tests: testsResult.status === "fulfilled" ? testsResult.value.items : get().tests,
      testsError:
        testsResult.status === "rejected"
          ? message(testsResult.reason, "could not load listening tests")
          : null,
      scripts: scriptsResult.status === "fulfilled" ? scriptsResult.value.items : get().scripts,
      scriptsError:
        scriptsResult.status === "rejected"
          ? message(scriptsResult.reason, "could not load listening parts")
          : null,
    });
  },

  // ------------------------------------------------------- audio preparation --
  prepare: {},

  prepareState: (key) => get().prepare[key] ?? IDLE_PREPARE,

  clearPrepareError: (key) => {
    const current = get().prepare[key];
    if (!current) return;
    set({ prepare: { ...get().prepare, [key]: { ...current, error: null } } });
  },

  prepareTest: async (testId) => {
    const patch = (next: Partial<PrepareState>) =>
      set({
        prepare: {
          ...get().prepare,
          [testId]: { ...(get().prepare[testId] ?? IDLE_PREPARE), ...next },
        },
      });

    patch({ running: true, error: null, done: false, pct: null, detail: "starting the renderer" });
    try {
      const res = await api.post<TestRenderResponse>(
        `/api/v1/listening/tests/${encodeURIComponent(testId)}/render`,
        {},
      );
      if (!("job_id" in res) || !res.job_id) {
        patch({ running: false, done: true, pct: 100, detail: "audio ready", jobId: null });
        await get().loadLibrary(true);
        return true;
      }
      patch({ jobId: res.job_id, detail: "preparing the audio" });
      await api.pollJob(res.job_id, (job) => {
        patch({
          pct: job.progress_pct,
          detail: job.detail ?? "preparing the audio",
        });
      });
      patch({ running: false, done: true, pct: 100, detail: "audio ready", jobId: null });
      await get().loadLibrary(true);
      // Refresh the open test so its parts pick up their new audio hashes.
      if (get().detail?.id === testId) await get().loadTest(testId);
      return true;
    } catch (err) {
      patch({
        running: false,
        jobId: null,
        error: message(err, "the audio could not be generated"),
      });
      return false;
    }
  },

  prepareScript: async (scriptId, accentSet = null) => {
    const key = `script:${scriptId}:${accentSet ?? "default"}`;
    const patch = (next: Partial<PrepareState>) =>
      set({
        prepare: { ...get().prepare, [key]: { ...(get().prepare[key] ?? IDLE_PREPARE), ...next } },
      });

    patch({ running: true, error: null, done: false, pct: null, detail: "starting the renderer" });
    try {
      const res = await api.post<ScriptRenderResponse>(
        `/api/v1/listening/scripts/${encodeURIComponent(scriptId)}/render`,
        accentSet ? { accent_set: accentSet } : {},
      );
      if (!res.job_id) {
        patch({ running: false, done: true, pct: 100, detail: "audio ready", jobId: null });
        await get().loadLibrary(true);
        return res.audio_hash ?? null;
      }
      patch({ jobId: res.job_id, detail: "preparing the audio" });
      const done = await api.pollJob<{ audio_hash?: string }>(res.job_id, (job) => {
        patch({ pct: job.progress_pct, detail: job.detail ?? "preparing the audio" });
      });
      patch({ running: false, done: true, pct: 100, detail: "audio ready", jobId: null });
      await get().loadLibrary(true);
      return done?.audio_hash ?? res.expected_audio_hash ?? null;
    } catch (err) {
      patch({
        running: false,
        jobId: null,
        error: message(err, "the audio could not be generated"),
      });
      return null;
    }
  },

  cancelPrepare: async (key) => {
    const current = get().prepare[key];
    if (!current?.jobId) return;
    try {
      await api.cancelJob(current.jobId);
    } catch {
      /* the job may already be finished — the poller reports the real outcome */
    }
  },

  // ------------------------------------------------------------------ detail --
  detail: null,
  detailLoading: false,
  detailError: null,

  loadTest: async (testId) => {
    set({ detailLoading: true, detailError: null });
    try {
      const detail = await api.get<ListeningTestDetail>(
        `/api/v1/listening/tests/${encodeURIComponent(testId)}`,
      );
      detail.parts = [...detail.parts].sort((a, b) => a.part - b.part);
      set({ detail, detailLoading: false });
      return detail;
    } catch (err) {
      set({ detailLoading: false, detailError: message(err, "could not load this test") });
      return null;
    }
  },

  loadScript: async (scriptId) => {
    set({ detailLoading: true, detailError: null });
    try {
      const part = await api.get<ListeningPart>(
        `/api/v1/listening/scripts/${encodeURIComponent(scriptId)}`,
      );
      const detail: ListeningTestDetail = {
        id: part.id,
        title: part.title,
        source: part.source,
        created_at: null,
        total_questions: part.questions.length,
        audio_ready: part.audio.ready,
        parts: [part],
      };
      set({ detail, detailLoading: false });
      return detail;
    } catch (err) {
      set({ detailLoading: false, detailError: message(err, "could not load this part") });
      return null;
    }
  },

  // ----------------------------------------------------------------- attempt --
  attempt: null,
  starting: false,
  startError: null,
  saving: false,
  saveError: null,
  submitting: false,
  submitError: null,
  result: null,

  startAttempt: async ({ testId, scriptId, mode }) => {
    clearAutosave();
    pendingAnswers = {};
    secondsSinceSync = 0;
    set({ starting: true, startError: null, result: null, submitError: null });

    const detail = testId ? await get().loadTest(testId) : await get().loadScript(String(scriptId));
    if (!detail) {
      set({ starting: false, startError: get().detailError ?? "could not load the material" });
      return null;
    }

    try {
      const created = await api.post<AttemptCreated>("/api/v1/listening/attempts", {
        test_id: testId ?? null,
        script_id: testId ? null : scriptId,
        mode,
      });
      set({
        starting: false,
        attempt: {
          id: created.attempt_id,
          mode,
          testId: testId ?? null,
          scriptId: testId ? null : (scriptId ?? null),
          numbers: created.question_numbers,
          totalPoints: created.total_questions,
          answers: { ...created.resume_state.answers },
          seconds: created.resume_state.seconds_elapsed,
          currentPart: created.resume_state.current_part,
          played: [],
          revealed: [],
          submitted: false,
        },
      });
      return created.attempt_id;
    } catch (err) {
      set({ starting: false, startError: message(err, "the attempt could not be started") });
      return null;
    }
  },

  setAnswer: (number, value) => {
    const attempt = get().attempt;
    if (!attempt || attempt.submitted) return;
    const key = String(number);
    set({ attempt: { ...attempt, answers: { ...attempt.answers, [key]: value } } });
    pendingAnswers[key] = value;

    clearAutosave();
    autosaveTimer = setTimeout(() => {
      void get().flush();
    }, AUTOSAVE_MS);
  },

  setCurrentPart: (part) => {
    const attempt = get().attempt;
    if (!attempt || attempt.currentPart === part) return;
    set({ attempt: { ...attempt, currentPart: part } });
    void get().flush();
  },

  tick: () => {
    const attempt = get().attempt;
    if (!attempt || attempt.submitted) return;
    set({ attempt: { ...attempt, seconds: attempt.seconds + 1 } });
    secondsSinceSync += 1;
    if (secondsSinceSync >= HEARTBEAT_S) void get().flush();
  },

  notePlayed: (scriptId) => {
    const attempt = get().attempt;
    if (!attempt) return;
    set({
      attempt: {
        ...attempt,
        played: attempt.played.includes(scriptId)
          ? attempt.played
          : [...attempt.played, scriptId],
      },
    });
    void api
      .patch(`/api/v1/listening/attempts/${encodeURIComponent(attempt.id)}`, {
        played_script_id: scriptId,
      })
      .catch(() => {
        /* play bookkeeping is best-effort; never interrupt playback for it */
      });
  },

  revealPart: (scriptId) => {
    const attempt = get().attempt;
    if (!attempt || attempt.revealed.includes(scriptId)) return;
    set({ attempt: { ...attempt, revealed: [...attempt.revealed, scriptId] } });
  },

  flush: async () => {
    clearAutosave();
    const attempt = get().attempt;
    if (!attempt || attempt.submitted) return;
    const answers = pendingAnswers;
    pendingAnswers = {};
    secondsSinceSync = 0;
    set({ saving: true });
    try {
      await api.patch(`/api/v1/listening/attempts/${encodeURIComponent(attempt.id)}`, {
        ...(Object.keys(answers).length ? { answers } : {}),
        seconds_elapsed: attempt.seconds,
        current_part: Math.min(4, Math.max(1, attempt.currentPart)),
      });
      set({ saving: false, saveError: null });
    } catch (err) {
      // Keep the un-saved answers so the next flush retries them.
      pendingAnswers = { ...answers, ...pendingAnswers };
      set({ saving: false, saveError: message(err, "answers are not being saved") });
    }
  },

  submit: async () => {
    const attempt = get().attempt;
    if (!attempt || attempt.submitted) return get().result;
    clearAutosave();
    const answers = { ...attempt.answers };
    pendingAnswers = {};
    set({ submitting: true, submitError: null });
    try {
      const result = await api.post<SubmitResult>(
        `/api/v1/listening/attempts/${encodeURIComponent(attempt.id)}/submit`,
        { answers, seconds_elapsed: attempt.seconds },
      );
      set({
        submitting: false,
        result,
        attempt: { ...attempt, submitted: true },
      });
      return result;
    } catch (err) {
      set({ submitting: false, submitError: message(err, "the attempt could not be marked") });
      return null;
    }
  },

  abandon: async () => {
    const attempt = get().attempt;
    clearAutosave();
    pendingAnswers = {};
    if (attempt && !attempt.submitted) {
      try {
        await api.patch(`/api/v1/listening/attempts/${encodeURIComponent(attempt.id)}`, {
          status: "abandoned",
          seconds_elapsed: attempt.seconds,
        });
      } catch {
        /* abandoning is a courtesy to the server; the UI leaves either way */
      }
    }
    set({ attempt: null, result: null, submitError: null, saveError: null });
  },

  resetAttempt: () => {
    clearAutosave();
    pendingAnswers = {};
    secondsSinceSync = 0;
    set({ attempt: null, result: null, submitError: null, saveError: null, startError: null });
  },

  // ------------------------------------------------------------------ review --
  review: null,
  reviewLoading: false,
  reviewError: null,

  loadReview: async (attemptId) => {
    set({ reviewLoading: true, reviewError: null });
    try {
      const review = await api.get<ReviewDoc>(
        `/api/v1/listening/attempts/${encodeURIComponent(attemptId)}/review`,
      );
      review.parts = [...review.parts].sort((a, b) => a.part - b.part);
      set({ review, reviewLoading: false });
    } catch (err) {
      set({ reviewLoading: false, reviewError: message(err, "could not load this review") });
    }
  },
}));

/** Answered = a non-blank string. Used by the palette, the check step and submit. */
export function isAnswered(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}
