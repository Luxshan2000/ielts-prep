/**
 * Feature-local store for the listening mock.
 *
 * **The sitting lives on the server, and that is the whole point.** An earlier draft of
 * this screen kept the sitting in `localStorage` — which parts had played, when the clock
 * started, whether it was abandoned — because the sidecar had no concept of a mock. It
 * does now (`/api/v1/listening/mock/*`), and the difference is not bookkeeping: a play
 * ledger a renderer keeps for itself is a *preference* not to rewind, and a preference is
 * not an exam condition. `POST …/sessions/{id}/play` refuses the second request for a part
 * with a 409, so the condition that defines this paper is enforced somewhere the client
 * cannot reach, and it survives a reload, a second tab and a cleared browser store.
 *
 * Four things follow from that and shape everything below.
 *
 * 1. **Audio is rendered before the clock starts.** `POST /sessions` opens the sitting at
 *    `preparing` and queues a render job; `POST …/start` refuses with a 409 until every
 *    part exists on disk. So this store polls, and it reports real progress — parts ready
 *    out of four, plus the job's own percentage — because synthesizing four recordings
 *    takes long enough that a spinner is a lie.
 * 2. **Exam conditions bite from creation, not from start.** A learner reading transcripts
 *    while the render queue runs has already sat the paper.
 * 3. **The clock is wall-clock from `started_at`.** The server owns the number but only
 *    learns it when we autosave, so the client derives it from the start stamp and pushes
 *    it up. A mock cannot compromise on the hour continuing while you walk away.
 * 4. **Answers are mirrored locally only to keep typing responsive.** `resume_state.answers`
 *    on the server is authoritative and is what a reload reads back.
 */

import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { friendlyMessage } from "@/lib/errors";
import type { ListeningPart } from "../../types";
import type { Delivery } from "./script";

const MOCK = "/api/v1/listening/mock";
const enc = encodeURIComponent;

/** How often the preflight asks whether the four recordings exist yet. */
export const RENDER_POLL_MS = 2000;
/** How long typing settles before the sitting autosaves. */
const AUTOSAVE_MS = 900;

export type MockStatus = "preparing" | "ready" | "in_progress" | "complete" | "abandoned";

// ------------------------------------------------------------ the wire shapes ---

export interface RenderPart {
  position: number;
  script_id: string;
  title: string | null;
  ready: boolean;
  duration_ms: number;
  audio_hash: string | null;
}

export interface AudioProgress {
  ready: boolean;
  ready_parts: number;
  total_parts: number;
  pct: number;
  parts: RenderPart[];
  job_id: string | null;
  job_state: string | null;
  job_progress_pct: number | null;
  job_detail: string | null;
  job_error: string | null;
  note: string;
}

export interface MockTiming {
  delivery: string;
  delivery_label: string;
  audio_s: number;
  window_s: number;
  window_label: string;
  window_note: string;
  total_s: number;
  derived_from_audio: boolean;
  parts: { position: number; script_id: string; audio_s: number; ready: boolean }[];
  mnemonic: string;
  why_computer: string;
  note: string;
}

export interface MockClock {
  /** `not_started` · `audio` · `check`. They are different instructions, not labels. */
  phase: string;
  delivery: string;
  window_label: string;
  duration_s: number;
  audio_s: number;
  window_s: number;
  seconds_elapsed: number;
  remaining_s: number;
  overtime_s: number;
  expired: boolean;
  window_remaining_s: number | null;
  current_part: number;
}

export interface PlaysView {
  played: Record<string, number>;
  remaining: string[];
  plays_allowed: number;
  note: string;
}

export interface PartMeta {
  position: number;
  script_id: string;
  title: string | null;
  part: number | null;
  accent_set: string | null;
  questions: number | null;
}

export interface Coherence {
  checks: Record<string, boolean>;
  warnings: string[];
  hard_checks: string[];
  soft_checks: string[];
  rejected: { test_id: string; failed: string[] }[];
}

export interface Briefing {
  title: string;
  points: string[];
  delivery_note: string;
  mnemonic: string;
}

export type ExamPart = ListeningPart & { position: number; coaching_included: boolean };

export interface ResumeState {
  answers: Record<string, string>;
  seconds_elapsed: number;
  current_part: number;
  play_counts: Record<string, number>;
}

/** `GET /listening/mock/sessions/{id}`. */
export interface MockSession {
  mock_id: string;
  attempt_id: string;
  status: MockStatus;
  delivery: Delivery;
  delivery_label: string;
  delivery_note: string | null;
  modelled: string;
  seed: number | null;
  test_id: string;
  title: string;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  question_count: number;
  audio: AudioProgress;
  timing: MockTiming | null;
  clock: MockClock;
  plays: PlaysView;
  part_meta: PartMeta[];
  parts: ExamPart[] | null;
  coherence: Coherence | null;
  briefing: Briefing | null;
  answers_included: boolean;
  coaching_included: boolean;
  resume_state: ResumeState;
  exam_conditions: Record<string, unknown> | null;
  report: MockReportDoc | null;
  created?: boolean;
}

/** The assembly preview — `GET /listening/mock/plan`. */
export interface MockPlan {
  delivery: string;
  delivery_label: string;
  seed: number | null;
  test_id: string;
  title: string;
  question_count: number;
  parts: { position: number; script_id: string; title: string; audio: { ready: boolean } }[];
  timing: MockTiming;
  coherence: Coherence;
  briefing: Briefing;
}

// ------------------------------------------------------------------ the report ---

export interface ScoreBlock {
  raw_score: number;
  total_questions: number;
  projected_raw_40: number | null;
  band: number | null;
  band_is_estimate: boolean;
  note: string;
  one_table_note: string;
}

export interface PartScore {
  position: number;
  part: number;
  script_id: string;
  title: string | null;
  accent_set: string | null;
  correct: number;
  total: number;
  pct: number | null;
  played: number;
}

export interface TypeScore {
  qtype: string;
  label: string;
  correct: number;
  total: number;
  pct: number | null;
  rule: string | null;
}

export interface TrapScore {
  slug: string;
  label: string;
  family?: string;
  family_label?: string;
  what_happened?: string;
  signal?: string;
  fix?: string;
  questions?: number[];
  lost?: number;
  count?: number;
}

export interface FormSummary {
  marks_lost_to_form: number;
  note?: string;
  items?: { number: number; given: string; expected: string }[];
  [key: string]: unknown;
}

export interface CascadeReport {
  count: number;
  note?: string;
  runs?: { from: number; to: number; length: number }[];
  [key: string]: unknown;
}

export interface BandLadder {
  band: number | null;
  band_is_estimate: boolean;
  projected_raw_40: number | null;
  next_band?: number | null;
  marks_to_next?: number | null;
  [key: string]: unknown;
}

export interface NextAction {
  title?: string;
  label?: string;
  detail?: string;
  body?: string;
  script_id?: string | null;
  qtype?: string | null;
  part?: number | null;
  [key: string]: unknown;
}

/** `POST /listening/mock/sessions/{id}/submit`. */
export interface MockReportDoc {
  mock_id: string;
  attempt_id: string;
  status: string;
  delivery: Delivery;
  delivery_label: string;
  modelled: string;
  test_id: string;
  title: string;
  seed: number | null;
  started_at: string | null;
  finished_at: string | null;
  auto_submitted: boolean;
  score: ScoreBlock;
  band_ladder: BandLadder;
  per_part: PartScore[];
  per_part_note: string;
  per_type: TypeScore[];
  per_trap: TrapScore[];
  answer_form: FormSummary;
  cascades: CascadeReport;
  per_question: unknown;
  near_miss_spellings: unknown[];
  srs_candidates: unknown[];
  timing: Record<string, unknown>;
  next_actions?: NextAction[];
  [key: string]: unknown;
}

export interface HistoryRow {
  mock_id: string;
  attempt_id: string;
  status: MockStatus;
  delivery: Delivery | null;
  test_id: string | null;
  title: string | null;
  seed: number | null;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  raw_score: number | null;
  total_questions: number | null;
  band: number | null;
  part_scores: (number | null)[];
  marks_lost_to_form: number | null;
  cascades: number | null;
  weakest_type: string | null;
}

export interface HistoryDoc {
  items: HistoryRow[];
  count: number;
  scored: number;
  trajectory: {
    mock_id: string;
    at: string | null;
    raw_score: number | null;
    band: number | null;
    part_scores: (number | null)[];
  }[];
  latest_raw: number | null;
  latest_band: number | null;
  best_raw: number | null;
  delta_raw: number | null;
}

// ------------------------------------------------------------------- helpers ---

/** Seconds since the clock started. Never negative, never paused. */
export function elapsedOf(session: MockSession | null): number {
  if (!session?.started_at) return 0;
  const started = Date.parse(session.started_at);
  if (Number.isNaN(started)) return Math.round(session.clock.seconds_elapsed);
  return Math.max(0, Math.round((Date.now() - started) / 1000));
}

const LIVE: MockStatus[] = ["preparing", "ready", "in_progress"];

/** True while a sitting is open — every coaching surface shuts for the duration. */
export function isLive(session: MockSession | null): boolean {
  return Boolean(session && LIVE.includes(session.status));
}

// --------------------------------------------------------------------- store ---

interface MockState {
  session: MockSession | null;
  loading: boolean;
  error: string | null;

  delivery: Delivery;
  setDelivery: (delivery: Delivery) => void;

  plan: MockPlan | null;
  planError: string | null;
  loadPlan: (delivery: Delivery) => Promise<void>;

  history: HistoryDoc | null;
  loadHistory: () => Promise<void>;

  creating: boolean;
  createError: string | null;
  create: (options?: { testId?: string; seed?: number }) => Promise<string | null>;

  load: (mockId: string, options?: { quiet?: boolean }) => Promise<void>;

  starting: boolean;
  startError: string | null;
  start: (mockId: string) => Promise<boolean>;

  /** Answers mirrored locally so typing stays responsive; the server is authoritative. */
  answers: Record<string, string>;
  setAnswer: (mockId: string, number: number, value: string) => void;
  saveError: string | null;
  flush: (mockId: string) => Promise<void>;
  pushClock: (mockId: string, seconds: number, phase?: string, currentPart?: number) => void;

  /** Ask the server for permission to play a part. `false` means it is already spent. */
  playError: string | null;
  play: (mockId: string, scriptId: string) => Promise<boolean>;

  submitting: boolean;
  submitError: string | null;
  report: MockReportDoc | null;
  submit: (mockId: string, options?: { auto?: boolean; seconds?: number }) => Promise<boolean>;

  abandon: (mockId: string) => Promise<void>;
  reset: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** Answers typed since the last successful PATCH. */
let pending: Record<string, string> = {};
let pendingClock: { seconds_elapsed?: number; phase?: string; current_part?: number } = {};

export const useMockStore = create<MockState>((set, get) => ({
  session: null,
  loading: false,
  error: null,

  delivery: "computer",
  setDelivery: (delivery) => set({ delivery, createError: null, plan: null }),

  plan: null,
  planError: null,

  history: null,

  creating: false,
  createError: null,

  starting: false,
  startError: null,

  answers: {},
  saveError: null,
  playError: null,

  submitting: false,
  submitError: null,
  report: null,

  async loadPlan(delivery) {
    set({ planError: null });
    try {
      set({ plan: await api.get<MockPlan>(`${MOCK}/plan?delivery=${enc(delivery)}`) });
    } catch (err) {
      set({
        plan: null,
        planError: friendlyMessage(err, "No listening test in this pack can be sat as a mock."),
      });
    }
  },

  async loadHistory() {
    try {
      set({ history: await api.get<HistoryDoc>(`${MOCK}/sessions?limit=25`) });
    } catch {
      // A missing history must never block a new sitting.
      set({ history: null });
    }
  },

  async create(options) {
    set({ creating: true, createError: null });
    try {
      const session = await api.post<MockSession>(`${MOCK}/sessions`, {
        delivery: get().delivery,
        test_id: options?.testId ?? null,
        seed: options?.seed ?? null,
      });
      set({
        creating: false,
        session,
        answers: session.resume_state.answers ?? {},
        report: null,
      });
      return session.mock_id;
    } catch (err) {
      set({
        creating: false,
        createError: friendlyMessage(err, "A mock sitting could not be opened."),
      });
      return null;
    }
  },

  async load(mockId, options) {
    if (!mockId) return;
    if (!options?.quiet) set({ loading: true, error: null });
    try {
      const session = await api.get<MockSession>(`${MOCK}/sessions/${enc(mockId)}`);
      set((state) => ({
        loading: false,
        error: null,
        session,
        // Local edits in flight win over the echo of an older autosave.
        answers: { ...(session.resume_state.answers ?? {}), ...pending, ...state.answers },
        report: session.report ?? state.report,
      }));
    } catch (err) {
      set({
        loading: false,
        error: friendlyMessage(err, "That sitting could not be opened."),
      });
    }
  },

  async start(mockId) {
    set({ starting: true, startError: null });
    try {
      const session = await api.post<MockSession>(`${MOCK}/sessions/${enc(mockId)}/start`, {});
      set({ starting: false, session, answers: session.resume_state.answers ?? {} });
      return true;
    } catch (err) {
      // A 409 here is the render queue, not a failure: the sitting refuses to open on
      // audio that does not exist yet, and the message names how far along it is.
      set({
        starting: false,
        startError:
          err instanceof ApiError
            ? err.detail
            : friendlyMessage(err, "The paper could not be started."),
      });
      return false;
    }
  },

  setAnswer(mockId, number, value) {
    const key = String(number);
    pending = { ...pending, [key]: value };
    set((state) => ({ answers: { ...state.answers, [key]: value } }));
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().flush(mockId), AUTOSAVE_MS);
  },

  pushClock(mockId, seconds, phase, currentPart) {
    pendingClock = {
      seconds_elapsed: seconds,
      ...(phase ? { phase } : {}),
      ...(currentPart ? { current_part: currentPart } : {}),
    };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().flush(mockId), AUTOSAVE_MS);
  },

  async flush(mockId) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const answers = pending;
    const clock = pendingClock;
    if (Object.keys(answers).length === 0 && Object.keys(clock).length === 0) return;
    pending = {};
    pendingClock = {};
    try {
      await api.patch(`${MOCK}/sessions/${enc(mockId)}`, {
        ...(Object.keys(answers).length > 0 ? { answers } : {}),
        ...clock,
      });
      set({ saveError: null });
    } catch (err) {
      // Put the edits back so the next tick retries them rather than losing them.
      pending = { ...answers, ...pending };
      pendingClock = { ...clock, ...pendingClock };
      set({ saveError: friendlyMessage(err, "That answer has not reached the sidecar yet.") });
    }
  },

  async play(mockId, scriptId) {
    set({ playError: null });
    try {
      await api.post(`${MOCK}/sessions/${enc(mockId)}/play`, { script_id: scriptId });
      await get().load(mockId, { quiet: true });
      return true;
    } catch (err) {
      set({
        playError:
          err instanceof ApiError
            ? err.detail
            : friendlyMessage(err, "That part could not be started."),
      });
      // Re-read so the UI shows the server's ledger rather than its own guess.
      await get().load(mockId, { quiet: true });
      return false;
    }
  },

  async submit(mockId, options) {
    set({ submitting: true, submitError: null });
    try {
      await get().flush(mockId);
    } catch {
      // A failed final autosave must not stop the paper being marked — the server
      // marks what it holds, and losing the submit would be much worse.
    }
    try {
      const report = await api.post<MockReportDoc>(`${MOCK}/sessions/${enc(mockId)}/submit`, {
        auto_submitted: Boolean(options?.auto),
        seconds_elapsed: options?.seconds ?? null,
      });
      set({ submitting: false, report });
      await get().load(mockId, { quiet: true });
      return true;
    } catch (err) {
      set({
        submitting: false,
        submitError: friendlyMessage(err, "The paper could not be marked."),
      });
      return false;
    }
  },

  async abandon(mockId) {
    try {
      await api.post(`${MOCK}/sessions/${enc(mockId)}/abandon`, {});
    } catch {
      // Walking out must always succeed locally, or one failed request locks the
      // coach for hours.
    }
    pending = {};
    pendingClock = {};
    set({ session: null, answers: {} });
  },

  reset() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    pending = {};
    pendingClock = {};
    set({
      session: null,
      answers: {},
      report: null,
      error: null,
      saveError: null,
      playError: null,
      startError: null,
      submitError: null,
    });
  },
}));
