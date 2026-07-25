/**
 * Reading feature store (feature-local and ephemeral — R2-23).
 *
 * Answers, flags, highlights, notes and the timer live here so the split-view
 * panes stay in sync, but durability is the sidecar's: every mutation queues a
 * debounced `PATCH /api/v1/reading/attempts/{id}` (06 §5 autosave) and the timer
 * is checkpointed every 15 s. Nothing about an in-progress attempt is ever put
 * in a global store.
 */

import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { friendlyMessage } from "@/lib/errors";
import { flattenDrill, flattenQuestions, type FlatQuestion } from "./model";
import type {
  AttemptMode,
  AttemptRecord,
  AutosaveAck,
  DrillItem,
  DrillSet,
  Highlight,
  Paged,
  PassageDoc,
  PassageSummary,
  ReadingFormat,
  ResumeState,
  ReviewRecord,
  ScoreRecord,
  StartAttemptRequest,
  StartAttemptResponse,
  TestDocument,
  TestSummary,
  WhyWrongResult,
} from "./types";

const RD = "/api/v1/reading";
const AUTOSAVE_DEBOUNCE_MS = 900;
const TIMER_CHECKPOINT_S = 15;

/** Reserved `notes` key holding `{questionKey: milliseconds}` (06 §4.2 time_ms). */
const TIME_NOTE_KEY = "_time_ms";

/** Mirrors the sidecar's `TIMER_DEFAULTS`; used only to rebuild a resumed ring. */
const TIMER_DEFAULTS: Record<string, number> = { full: 3600, passage: 1200, drill: 90 };

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export function errorText(err: unknown): string {
  return friendlyMessage(err, String(err));
}

// --------------------------------------------------------------------- shapes ---

/** Static description of the attempt in progress — a stable object reference. */
export interface Attempt {
  id: string;
  mode: AttemptMode;
  examConditions: boolean;
  format: ReadingFormat;
  title: string;
  testId: string | null;
  passageId: string | null;
  /** Empty for a drill. */
  passages: PassageDoc[];
  drill: { qtype: string; items: DrillItem[] } | null;
  questions: FlatQuestion[];
  totalQuestions: number;
  status: "in_progress" | "submitted";
}

export interface DrillProbe {
  status: "loading" | "ok" | "missing" | "error";
  size: number;
  secondsPerQuestion: number;
  error: string | null;
}

export interface WhyWrongState {
  status: "loading" | "ready" | "error";
  data: WhyWrongResult | null;
  error: string | null;
}

/** What the review pane should scroll to and flash. */
export interface LocateTarget {
  passageId: string;
  paragraphId: string | null;
  quote: string | null;
  /** Bumped on every request so repeat clicks re-trigger the scroll. */
  nonce: number;
}

interface PendingPatch {
  answers?: Record<string, string>;
  flags?: number[];
  highlights?: Highlight[];
  notes?: Record<string, unknown>;
  timer_s?: number;
  looked_up?: string[];
}

interface ReadingState {
  // ------------------------------------------------------------- catalog ---
  catalogStatus: LoadStatus;
  catalogError: string | null;
  tests: TestSummary[];
  passages: PassageSummary[];
  drillProbes: Record<string, DrillProbe>;
  loadCatalog: (force?: boolean) => Promise<void>;
  probeDrill: (qtype: string) => Promise<void>;

  // ------------------------------------------------------------- attempt ---
  attemptStatus: LoadStatus;
  attemptError: string | null;
  attempt: Attempt | null;
  answers: Record<string, string>;
  flags: number[];
  highlights: Highlight[];
  notes: Record<string, string>;
  timeMs: Record<string, number>;
  lookedUp: string[];
  timerTotal: number;
  timerRemaining: number;
  /** Seconds of wall clock actually spent in the player (works untimed too). */
  elapsed: number;
  paused: boolean;
  current: number | null;
  activePassage: number;
  saveStatus: "idle" | "saving" | "saved" | "error";
  saveError: string | null;
  savedAt: string | null;
  submitting: boolean;
  submitError: string | null;
  result: ScoreRecord | null;

  startAttempt: (
    req: StartAttemptRequest,
    options?: { untimed?: boolean },
  ) => Promise<string | null>;
  resumeAttempt: (attemptId: string) => Promise<void>;
  clearAttempt: () => void;
  setAnswer: (key: string, value: string) => void;
  setAnswers: (patch: Record<string, string>) => void;
  toggleFlag: (number: number) => void;
  addHighlight: (highlight: Highlight) => void;
  removeHighlight: (index: number) => void;
  clearHighlights: () => void;
  setNote: (key: string, text: string) => void;
  addLookedUp: (word: string) => void;
  setCurrent: (number: number) => void;
  setActivePassage: (index: number) => void;
  setPaused: (paused: boolean) => void;
  tick: () => void;
  flushSave: () => Promise<void>;
  submitAttempt: (options?: { auto?: boolean }) => Promise<boolean>;

  // -------------------------------------------------------------- review ---
  reviewStatus: LoadStatus;
  reviewError: string | null;
  reviewAttemptId: string | null;
  review: ReviewRecord | null;
  reviewPassages: PassageDoc[];
  reviewTimeMs: Record<string, number>;
  reviewLookedUp: string[];
  reviewMode: AttemptMode;
  reviewDrill: DrillItem[];
  whyWrong: Record<number, WhyWrongState>;
  locate: LocateTarget | null;
  loadReview: (attemptId: string) => Promise<void>;
  askWhyWrong: (number: number) => Promise<void>;
  setLocate: (target: Omit<LocateTarget, "nonce"> | null) => void;
}

// --------------------------------------------------------- autosave plumbing ---

let pending: PendingPatch = {};
let pendingFor: string | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;

function resetQueue(): void {
  if (debounce !== null) clearTimeout(debounce);
  debounce = null;
  pending = {};
  pendingFor = null;
}

function mergePatch(attemptId: string, patch: PendingPatch): void {
  if (pendingFor !== attemptId) {
    pending = {};
    pendingFor = attemptId;
  }
  if (patch.answers) pending.answers = { ...(pending.answers ?? {}), ...patch.answers };
  if (patch.notes) pending.notes = { ...(pending.notes ?? {}), ...patch.notes };
  if (patch.flags) pending.flags = patch.flags;
  if (patch.highlights) pending.highlights = patch.highlights;
  if (patch.looked_up) pending.looked_up = patch.looked_up;
  if (patch.timer_s !== undefined) pending.timer_s = patch.timer_s;
}

// -------------------------------------------------------------------- helpers ---

function toStringMap(raw: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue; // reserved bookkeeping keys
    out[key] = String(value);
  }
  return out;
}

function timeMapFrom(notes: Record<string, unknown> | null | undefined): Record<string, number> {
  const raw = (notes ?? {})[TIME_NOTE_KEY];
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const ms = Number(value);
    if (Number.isFinite(ms) && ms > 0) out[key] = Math.round(ms);
  }
  return out;
}

function documentTitle(doc: Partial<TestDocument>, fallback: string): string {
  return doc.title ?? doc.passages?.[0]?.title ?? fallback;
}

/** Wall-clock accrual for the focused question, so review can show time-per-Q. */
let focusedSince: number | null = null;
let focusedKey: string | null = null;

function accrueFocus(timeMs: Record<string, number>): Record<string, number> {
  if (focusedKey === null || focusedSince === null) return timeMs;
  const elapsed = Date.now() - focusedSince;
  focusedSince = Date.now();
  if (elapsed <= 0) return timeMs;
  return { ...timeMs, [focusedKey]: (timeMs[focusedKey] ?? 0) + elapsed };
}

// ---------------------------------------------------------------------- store ---

export const useReadingStore = create<ReadingState>((set, get) => {
  /** Queue a patch and (re)arm the debounce. */
  function queue(patch: PendingPatch, immediate = false): void {
    const attempt = get().attempt;
    if (!attempt || attempt.status !== "in_progress") return;
    mergePatch(attempt.id, patch);
    if (debounce !== null) clearTimeout(debounce);
    if (immediate) {
      void get().flushSave();
      return;
    }
    debounce = setTimeout(() => {
      debounce = null;
      void get().flushSave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  return {
    // ----------------------------------------------------------- catalog ---
    catalogStatus: "idle",
    catalogError: null,
    tests: [],
    passages: [],
    drillProbes: {},

    async loadCatalog(force = false) {
      if (!force && get().catalogStatus === "ready") return;
      set({ catalogStatus: "loading", catalogError: null });
      try {
        const [tests, passages] = await Promise.all([
          api.get<Paged<TestSummary>>(`${RD}/tests?limit=200`),
          api.get<Paged<PassageSummary>>(`${RD}/passages?limit=200`),
        ]);
        set({
          tests: tests.items ?? [],
          passages: passages.items ?? [],
          catalogStatus: "ready",
          catalogError: null,
        });
      } catch (err) {
        set({ catalogStatus: "error", catalogError: errorText(err) });
      }
    },

    async probeDrill(qtype) {
      const existing = get().drillProbes[qtype];
      if (existing && existing.status !== "error") return;
      set((s) => ({
        drillProbes: {
          ...s.drillProbes,
          [qtype]: { status: "loading", size: 0, secondsPerQuestion: 90, error: null },
        },
      }));
      try {
        const set_ = await api.get<DrillSet>(`${RD}/drills/${encodeURIComponent(qtype)}?size=40`);
        set((s) => ({
          drillProbes: {
            ...s.drillProbes,
            [qtype]: {
              status: "ok",
              size: set_.size ?? set_.items?.length ?? 0,
              secondsPerQuestion: set_.seconds_per_question ?? 90,
              error: null,
            },
          },
        }));
      } catch (err) {
        const missing = err instanceof ApiError && err.status === 404;
        set((s) => ({
          drillProbes: {
            ...s.drillProbes,
            [qtype]: {
              status: missing ? "missing" : "error",
              size: 0,
              secondsPerQuestion: 90,
              error: missing ? null : errorText(err),
            },
          },
        }));
      }
    },

    // ----------------------------------------------------------- attempt ---
    attemptStatus: "idle",
    attemptError: null,
    attempt: null,
    answers: {},
    flags: [],
    highlights: [],
    notes: {},
    timeMs: {},
    lookedUp: [],
    timerTotal: 0,
    timerRemaining: 0,
    elapsed: 0,
    paused: false,
    current: null,
    activePassage: 0,
    saveStatus: "idle",
    saveError: null,
    savedAt: null,
    submitting: false,
    submitError: null,
    result: null,

    async startAttempt(req, options) {
      resetQueue();
      set({ attemptStatus: "loading", attemptError: null, result: null, submitError: null });
      try {
        const res = await api.post<StartAttemptResponse>(`${RD}/attempts`, req);
        const passages = res.passages ?? [];
        const drill = res.drill ?? null;
        const questions = drill ? flattenDrill(drill.items) : flattenQuestions(passages);
        const attempt: Attempt = {
          id: res.attempt_id,
          mode: res.mode,
          examConditions: Boolean(res.exam_conditions),
          format: (res.format as ReadingFormat) ?? "academic",
          title: drill
            ? `${drill.qtype} drill`
            : documentTitle(res, req.test_id ?? req.passage_id ?? "Reading practice"),
          testId: req.test_id ?? null,
          passageId: req.passage_id ?? null,
          passages,
          drill,
          questions,
          totalQuestions: res.total_questions ?? questions.length,
          status: "in_progress",
        };
        focusedKey = null;
        focusedSince = null;
        set({
          attempt,
          attemptStatus: "ready",
          attemptError: null,
          answers: {},
          flags: [],
          highlights: [],
          notes: {},
          timeMs: {},
          lookedUp: [],
          // Untimed practice keeps the sidecar's stored timer but never runs it.
          timerTotal: options?.untimed ? 0 : (res.timer_s ?? 0),
          timerRemaining: options?.untimed ? 0 : (res.resume_state?.timer_s ?? res.timer_s ?? 0),
          elapsed: 0,
          paused: false,
          current: questions[0]?.number ?? null,
          activePassage: 0,
          saveStatus: "idle",
          saveError: null,
          savedAt: null,
        });
        return attempt.id;
      } catch (err) {
        set({ attemptStatus: "error", attemptError: errorText(err) });
        return null;
      }
    },

    async resumeAttempt(attemptId) {
      if (get().attempt?.id === attemptId && get().attemptStatus === "ready") return;
      resetQueue();
      set({ attemptStatus: "loading", attemptError: null, result: null, submitError: null });
      try {
        const record = await api.get<AttemptRecord>(
          `${RD}/attempts/${encodeURIComponent(attemptId)}`,
        );
        const mode = (record.mode as AttemptMode) ?? "passage";
        if (mode === "drill") {
          throw new ApiError(
            409,
            "not_resumable",
            "A question-type drill can't be resumed after the window reloads — its questions " +
              "are only held for the live attempt. Start a fresh drill from the browser.",
          );
        }
        const reviewing = record.status === "submitted";
        const path = record.test_id
          ? `${RD}/tests/${encodeURIComponent(record.test_id)}`
          : `${RD}/passages/${encodeURIComponent(String(record.passage_id))}`;
        const doc = await api.get<TestDocument>(`${path}?mode=exam`);
        const passages = doc.passages ?? [];
        const questions = flattenQuestions(passages);
        const resume: ResumeState = record.resume_state ?? {};
        const attempt: Attempt = {
          id: record.attempt_id,
          mode,
          examConditions: Boolean(record.exam_conditions),
          format: doc.format ?? "academic",
          title: documentTitle(doc, "Reading practice"),
          testId: record.test_id,
          passageId: record.passage_id,
          passages,
          drill: null,
          questions,
          totalQuestions: record.total_questions ?? questions.length,
          status: reviewing ? "submitted" : "in_progress",
        };
        focusedKey = null;
        focusedSince = null;
        set({
          attempt,
          attemptStatus: "ready",
          attemptError: null,
          answers: toStringMap(resume.answers),
          flags: resume.flags ?? [],
          highlights: (resume.highlights ?? []) as Highlight[],
          notes: toStringMap(resume.notes),
          timeMs: timeMapFrom(resume.notes as Record<string, unknown>),
          lookedUp: resume.looked_up ?? [],
          // The original total is not on the wire; the mode default is the best
          // reconstruction, and it only affects the ring's fill fraction.
          timerTotal: Math.max(resume.timer_s ?? 0, TIMER_DEFAULTS[mode] ?? 0),
          timerRemaining: resume.timer_s ?? 0,
          elapsed: Math.max(0, (TIMER_DEFAULTS[mode] ?? 0) - (resume.timer_s ?? 0)),
          paused: false,
          current: questions[0]?.number ?? null,
          activePassage: 0,
          saveStatus: "idle",
          saveError: null,
          savedAt: null,
        });
      } catch (err) {
        set({ attemptStatus: "error", attemptError: errorText(err) });
      }
    },

    clearAttempt() {
      resetQueue();
      focusedKey = null;
      focusedSince = null;
      set({
        attempt: null,
        attemptStatus: "idle",
        attemptError: null,
        answers: {},
        flags: [],
        highlights: [],
        notes: {},
        timeMs: {},
        lookedUp: [],
        timerTotal: 0,
        timerRemaining: 0,
        elapsed: 0,
        paused: false,
        current: null,
        activePassage: 0,
        saveStatus: "idle",
        saveError: null,
        savedAt: null,
        result: null,
        submitError: null,
      });
    },

    setAnswer(key, value) {
      get().setAnswers({ [key]: value });
    },

    setAnswers(patch) {
      const next = { ...get().answers };
      for (const [key, value] of Object.entries(patch)) {
        const trimmed = value ?? "";
        if (trimmed === "") delete next[key];
        else next[key] = trimmed;
      }
      set({ answers: next });
      // An empty string is the documented "unset this answer" signal (R2-19).
      queue({ answers: patch });
    },

    toggleFlag(number) {
      const flags = get().flags.includes(number)
        ? get().flags.filter((f) => f !== number)
        : [...get().flags, number].sort((a, b) => a - b);
      set({ flags });
      queue({ flags });
    },

    addHighlight(highlight) {
      const highlights = [...get().highlights, highlight];
      set({ highlights });
      queue({ highlights }, true);
    },

    removeHighlight(index) {
      const highlights = get().highlights.filter((_, i) => i !== index);
      set({ highlights });
      queue({ highlights }, true);
    },

    clearHighlights() {
      set({ highlights: [] });
      queue({ highlights: [] }, true);
    },

    setNote(key, text) {
      const notes = { ...get().notes };
      if (text.trim() === "") delete notes[key];
      else notes[key] = text;
      set({ notes });
      queue({ notes: { [key]: text.trim() === "" ? null : text } }, true);
    },

    addLookedUp(word) {
      const term = word.trim().toLowerCase();
      if (!term || get().lookedUp.includes(term)) return;
      const lookedUp = [...get().lookedUp, term];
      set({ lookedUp });
      queue({ looked_up: lookedUp });
    },

    setCurrent(number) {
      const attempt = get().attempt;
      if (!attempt) return;
      const timeMs = accrueFocus(get().timeMs);
      const found = attempt.questions.find((q) => q.number === number);
      focusedKey = found?.key ?? null;
      focusedSince = Date.now();
      set({
        current: number,
        timeMs,
        activePassage: found ? found.passageIndex : get().activePassage,
      });
    },

    setActivePassage(index) {
      const attempt = get().attempt;
      if (!attempt) return;
      const clamped = Math.max(0, Math.min(index, Math.max(attempt.passages.length - 1, 0)));
      set({ activePassage: clamped });
    },

    setPaused(paused) {
      const attempt = get().attempt;
      if (!attempt || attempt.examConditions) return;
      if (paused) {
        set({ paused, timeMs: accrueFocus(get().timeMs) });
        focusedSince = null;
        void get().flushSave();
      } else {
        focusedSince = Date.now();
        set({ paused });
      }
    },

    tick() {
      const { attempt, paused, timerRemaining, timerTotal } = get();
      if (!attempt || attempt.status !== "in_progress" || paused) return;
      set({ elapsed: get().elapsed + 1 });
      // Untimed practice counts up only — there is nothing to auto-submit at.
      if (timerTotal <= 0 || timerRemaining <= 0) return;
      const remaining = Math.max(0, timerRemaining - 1);
      set({ timerRemaining: remaining });
      if (remaining === 0) {
        void get().submitAttempt({ auto: true });
        return;
      }
      if (remaining % TIMER_CHECKPOINT_S === 0) {
        const timeMs = accrueFocus(get().timeMs);
        set({ timeMs });
        queue({ timer_s: remaining, notes: { [TIME_NOTE_KEY]: timeMs } });
      }
    },

    async flushSave() {
      const attempt = get().attempt;
      if (!attempt || pendingFor !== attempt.id) return;
      if (Object.keys(pending).length === 0) return;
      if (inflight) {
        await inflight.catch(() => undefined);
      }
      const payload = pending;
      pending = {};
      if (debounce !== null) {
        clearTimeout(debounce);
        debounce = null;
      }
      set({ saveStatus: "saving", saveError: null });
      inflight = (async () => {
        try {
          const ack = await api.patch<AutosaveAck>(
            `${RD}/attempts/${encodeURIComponent(attempt.id)}`,
            payload,
          );
          set({ saveStatus: "saved", saveError: null, savedAt: ack.saved_at });
        } catch (err) {
          // Requeue the failed patch UNDER anything typed since, so a retry
          // never resurrects a stale value over a newer one.
          const newer = pending;
          pending = {};
          pendingFor = null;
          mergePatch(attempt.id, payload);
          mergePatch(attempt.id, newer);
          set({ saveStatus: "error", saveError: errorText(err) });
        } finally {
          inflight = null;
        }
      })();
      await inflight;
    },

    async submitAttempt(options = {}) {
      const attempt = get().attempt;
      if (!attempt || get().submitting) return false;
      set({ submitting: true, submitError: null });
      const timeMs = accrueFocus(get().timeMs);
      focusedSince = null;
      set({ timeMs });
      queue({ notes: { [TIME_NOTE_KEY]: timeMs }, timer_s: get().timerRemaining });
      try {
        await get().flushSave();
      } catch {
        /* the submit body carries the answers as a belt-and-braces fallback */
      }
      try {
        const elapsed = get().elapsed;
        const record = await api.post<ScoreRecord>(
          `${RD}/attempts/${encodeURIComponent(attempt.id)}/submit`,
          {
            auto_submitted: Boolean(options.auto),
            duration_s: elapsed,
            answers: get().answers,
          },
        );
        set({
          result: record,
          submitting: false,
          attempt: { ...attempt, status: "submitted" },
        });
        if (attempt.mode === "drill" && attempt.drill) {
          try {
            await api.post(`${RD}/drills/results`, {
              drill_kind: "question_type",
              qtype: attempt.drill.qtype,
              n_items: record.total_questions,
              n_correct: record.raw_score,
              params: { size: attempt.drill.items.length },
              details: { attempt_id: attempt.id, per_type: record.per_type },
            });
          } catch (err) {
            // Non-fatal: the score is already stored on the attempt.
            console.warn("[BandReady] drill result not recorded", errorText(err));
          }
        }
        return true;
      } catch (err) {
        set({ submitting: false, submitError: errorText(err) });
        return false;
      }
    },

    // ------------------------------------------------------------ review ---
    reviewStatus: "idle",
    reviewError: null,
    reviewAttemptId: null,
    review: null,
    reviewPassages: [],
    reviewTimeMs: {},
    reviewLookedUp: [],
    reviewMode: "passage",
    reviewDrill: [],
    whyWrong: {},
    locate: null,

    async loadReview(attemptId) {
      set({ reviewStatus: "loading", reviewError: null, reviewAttemptId: attemptId });
      try {
        const [record, attemptRecord] = await Promise.all([
          api.get<ReviewRecord>(`${RD}/attempts/${encodeURIComponent(attemptId)}/review`),
          api.get<AttemptRecord>(`${RD}/attempts/${encodeURIComponent(attemptId)}`),
        ]);
        const mode = (attemptRecord.mode as AttemptMode) ?? "passage";
        let passages: PassageDoc[] = [];
        if (mode !== "drill") {
          const path = attemptRecord.test_id
            ? `${RD}/tests/${encodeURIComponent(attemptRecord.test_id)}`
            : `${RD}/passages/${encodeURIComponent(String(attemptRecord.passage_id))}`;
          const doc = await api.get<TestDocument>(`${path}?mode=review`);
          passages = doc.passages ?? [];
        }
        const notes = (attemptRecord.resume_state?.notes ?? {}) as Record<string, unknown>;
        const seeded: Record<number, WhyWrongState> = {};
        for (const q of record.per_question ?? []) {
          if (q.why_wrong) seeded[q.number] = { status: "ready", data: q.why_wrong, error: null };
        }
        set({
          review: record,
          reviewPassages: passages,
          reviewMode: mode,
          reviewTimeMs: timeMapFrom(notes),
          reviewLookedUp: attemptRecord.resume_state?.looked_up ?? [],
          reviewStatus: "ready",
          reviewError: null,
          whyWrong: seeded,
          locate: null,
        });
      } catch (err) {
        set({ reviewStatus: "error", reviewError: errorText(err) });
      }
    },

    async askWhyWrong(number) {
      const attemptId = get().reviewAttemptId;
      if (!attemptId) return;
      if (get().whyWrong[number]?.status === "loading") return;
      set((s) => ({
        whyWrong: { ...s.whyWrong, [number]: { status: "loading", data: null, error: null } },
      }));
      try {
        const started = await api.post<WhyWrongResult>(
          `${RD}/attempts/${encodeURIComponent(attemptId)}/why-wrong`,
          { number },
        );
        let result: WhyWrongResult = started;
        if (started.job_id && !started.cached) {
          result = await api.pollJob<WhyWrongResult>(started.job_id);
        }
        set((s) => ({
          whyWrong: { ...s.whyWrong, [number]: { status: "ready", data: result, error: null } },
        }));
      } catch (err) {
        set((s) => ({
          whyWrong: {
            ...s.whyWrong,
            [number]: { status: "error", data: null, error: errorText(err) },
          },
        }));
      }
    },

    setLocate(target) {
      if (!target) {
        set({ locate: null });
        return;
      }
      set((s) => ({ locate: { ...target, nonce: (s.locate?.nonce ?? 0) + 1 } }));
    },
  };
});

/** Exposed for tests — the reserved notes key holding per-question times. */
export { TIME_NOTE_KEY };
