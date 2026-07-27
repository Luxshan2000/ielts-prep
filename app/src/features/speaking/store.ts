/**
 * Speaking feature store (feature-local, ephemeral — R2-23).
 *
 * Holds the pre-call configuration, the started-session descriptor, and the
 * report/history caches. The LIVE session state machine is NOT here — it is
 * mirrored from the sidecar's WebSocket into the global `useSessionStore`
 * (18 §5); the renderer never advances a phase itself.
 */

import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { friendlyMessage } from "@/lib/errors";
import type { SpeakingPhase } from "@/stores";

// ------------------------------------------------------------------- types ---

/** 04 §2 session modes. The wire field is `mode`; the sidecar calls it the activity. */
export type SpeakingActivity = "full_mock" | "single_part" | "topic_drill" | "quick_chat";

export type CriterionKey = "fc" | "lr" | "gra" | "pron";

export interface StartedSession {
  session_id: string;
  /** R2-7 estimator weight class (`mock`/`practice`/`micro`), not the activity. */
  mode: string;
  activity: SpeakingActivity;
  part: number | null;
  card_set_id: string | null;
  card_set_title?: string | null;
  state: SpeakingPhase;
  offer_url: string;
  events_url: string;
}

export interface SessionRecord {
  id: string;
  mode: string;
  activity: string | null;
  part: number | null;
  card_set_id: string | null;
  state: string;
  status: string;
  overall_band: number | null;
  criteria?: Record<string, unknown> | null;
  started_at: string | null;
  ended_at: string | null;
  duration_s: number | null;
  live?: boolean;
  report_id?: string | null;
  offer_url?: string;
  events_url?: string;
  /** Present only if the sidecar decides to inline the transcript (tolerated). */
  transcript?: { turns?: TranscriptTurn[] } | null;
  turns?: TranscriptTurn[] | null;
}

export interface SpeakingCard {
  id: string;
  part: number;
  title: string;
  difficulty: string | null;
  /**
   * `core` | `stretch` | `challenging`. The third tier cannot live in the card row —
   * the pack schema pins `difficulty` to core|stretch — so the server reads it off the
   * parent set's payload and reports it here. Absent on an older sidecar.
   */
  difficulty_tier?: string | null;
  tags: string[];
  card_set_id: string | null;
  last_served_at: string | null;
  builtin?: boolean;
}

export interface TranscriptSegment {
  t_start_ms: number;
  t_end_ms: number;
}

export interface TranscriptTurn {
  role: "user" | "assistant" | string;
  text: string;
  t_ms: number;
  segments?: TranscriptSegment[] | null;
  audio_file?: string | null;
  part?: number | null;
  card_id?: string | null;
}

export interface CriterionReport {
  band: number | null;
  evidence: string[];
  improvements: string[];
}

export interface ReportError {
  quote: string;
  issue: string;
  better: string;
  /** Set server-side by the 04 §6.4 step-4 quote anchoring. */
  anchored?: boolean;
}

export interface VocabToBank {
  term: string;
  type: string;
  reason: string;
  context_quote: string;
}

/** The exact R2-10 metric set (02 §4.2). Every field may be absent. */
export interface FluencyMetrics {
  wpm?: number;
  articulation_wpm?: number;
  mean_pause_ms?: number;
  long_pause_count?: number;
  pause_ratio?: number;
  initial_latency_ms?: number;
  filler_count?: number;
  fillers_per_min?: number;
  false_start_count?: number;
  mean_length_of_run_words?: number;
}

export interface MetricsDoc {
  parts?: Record<string, FluencyMetrics>;
  overall?: FluencyMetrics;
  session?: { speech_secs?: number; p2_long_turn_secs?: number };
  turns?: (FluencyMetrics & { turn_index?: number })[];
}

export interface SpeakingReport {
  report_id: string;
  session_id: string;
  created_at: string | null;
  model_id: string | null;
  prompt_version: string | null;
  overall_band: number | null;
  criteria: Partial<Record<CriterionKey, CriterionReport>>;
  best_moments: string[];
  errors: ReportError[];
  vocab_to_bank: VocabToBank[];
  unanchored: string[];
  pronunciation_blind: boolean;
  metrics: MetricsDoc;
  mode: string | null;
  activity: string | null;
  card_set_id: string | null;
  duration_s: number | null;
  honesty_note: string;
}

/** A vocab suggestion row as `GET /api/v1/vocab/suggestions` returns it (08 §2). */
export interface VocabSuggestionEntry {
  id: string;
  headword: string;
  lemma: string;
  pos: string | null;
  definition: string | null;
  own_context_sentence: string | null;
  status: string;
  source?: { module: string | null; session_id: string | null; detail: string | null } | null;
}

export interface EngineInfo {
  voice_available: boolean;
  vad?: Record<string, unknown>;
  live_session_id: string | null;
}

// ----------------------------------------------------------------- helpers ---

const MIC_KEY = "br-speaking-mic";

function storedMic(): string | null {
  try {
    return window.localStorage.getItem(MIC_KEY);
  } catch {
    return null;
  }
}

function rememberMic(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(MIC_KEY, id);
    else window.localStorage.removeItem(MIC_KEY);
  } catch {
    /* private mode — the picker still works for this session */
  }
}

function message(err: unknown, fallback: string): string {
  return friendlyMessage(
    err,
    fallback,
    "Couldn't reach the practice engine. It may still be starting — wait a few seconds and retry.",
  );
}

/** Only Full Mock and Single Part produce band scores (04 §2). */
export function isScoreable(activity: SpeakingActivity | string | null): boolean {
  return activity === "full_mock" || activity === "single_part";
}

// ------------------------------------------------------------------- store ---

interface SpeakingState {
  // ---- pre-call configuration -------------------------------------------
  activity: SpeakingActivity;
  part: number;
  cardSetId: string | null;
  topic: string | null;
  micId: string | null;
  notes: string;

  setActivity: (activity: SpeakingActivity) => void;
  setPart: (part: number) => void;
  setCardSetId: (id: string | null) => void;
  setTopic: (topic: string | null) => void;
  setMicId: (id: string | null) => void;
  setNotes: (notes: string) => void;

  // ---- engine pre-flight -------------------------------------------------
  engine: EngineInfo | null;
  loadEngine: () => Promise<void>;

  // ---- topic cards -------------------------------------------------------
  cards: SpeakingCard[];
  cardsLoading: boolean;
  /** Why the cue-card bank is empty, when it is empty because of a failure. */
  cardsError: string | null;
  loadCards: (part?: number) => Promise<void>;

  // ---- session lifecycle -------------------------------------------------
  starting: boolean;
  startError: string | null;
  session: StartedSession | null;
  /** Set while `POST …/score` runs after hang-up. */
  scoring: boolean;
  scoreError: string | null;
  /** What the teardown reported, so the wrap-up screen can explain itself. */
  lastEnd: { turns: number; scoreable: boolean } | null;

  start: () => Promise<StartedSession | null>;
  /** Load (or reload) the descriptor for a session id — survives a page reload. */
  adopt: (sessionId: string) => Promise<StartedSession | null>;
  /** Hang up, then score when the mode is scoreable. Resolves with a report id. */
  end: (sessionId: string, opts?: { score?: boolean }) => Promise<string | null>;
  /** `POST …/score` on its own — idempotent, so it doubles as the retry. */
  score: (sessionId: string, opts?: { force?: boolean }) => Promise<string | null>;
  clearSession: () => void;

  // ---- history -----------------------------------------------------------
  history: SessionRecord[];
  historyLoading: boolean;
  historyError: string | null;
  loadHistory: () => Promise<void>;
}

export const useSpeakingStore = create<SpeakingState>((set, get) => ({
  activity: "full_mock",
  part: 2,
  cardSetId: null,
  topic: null,
  micId: storedMic(),
  notes: "",

  setActivity: (activity) => set({ activity, startError: null }),
  setPart: (part) => set({ part }),
  setCardSetId: (cardSetId) => set({ cardSetId }),
  setTopic: (topic) => set({ topic }),
  setMicId: (micId) => {
    rememberMic(micId);
    set({ micId });
  },
  setNotes: (notes) => set({ notes }),

  engine: null,
  loadEngine: async () => {
    try {
      set({ engine: await api.get<EngineInfo>("/api/v1/speaking/engine") });
    } catch (err) {
      // The pre-flight screen degrades to "unknown" rather than blocking a start,
      // but the reason still belongs in the log — this is the first thing to check
      // when a learner reports "the examiner never speaks".
      console.warn("[BandReady] could not read the speaking engine info", err);
      set({ engine: null });
    }
  },

  cards: [],
  cardsLoading: false,
  cardsError: null,
  loadCards: async (part) => {
    set({ cardsLoading: true, cardsError: null });
    try {
      // 108 Part 2 cards ship today and the route caps at 200. A limit below the bank
      // size silently hides sets from the Topic Coach picker, which reads as content
      // that was never authored rather than as a paging bug.
      const query = part ? `?part=${part}&limit=200` : "?limit=200";
      const res = await api.get<{ items: SpeakingCard[] }>(`/api/v1/speaking/cards${query}`);
      set({ cards: res.items ?? [], cardsLoading: false, cardsError: null });
    } catch (err) {
      // An empty bank and a bank that FAILED to load look identical on screen, and
      // "no cue cards installed" is exactly the wrong advice when the real cause is
      // a 500 or a restarting sidecar. Keep the reason so the picker can say it.
      set({
        cards: [],
        cardsLoading: false,
        cardsError: message(err, "The cue-card bank could not be loaded."),
      });
    }
  },

  starting: false,
  startError: null,
  session: null,
  scoring: false,
  scoreError: null,
  lastEnd: null,

  start: async () => {
    const { activity, part, cardSetId, topic } = get();
    set({ starting: true, startError: null, notes: "", lastEnd: null, scoreError: null });
    const payload: Record<string, unknown> = { mode: activity };
    if (activity === "single_part" || activity === "topic_drill") payload.part = part;
    if (activity === "full_mock" && cardSetId) payload.card_set_id = cardSetId;
    if (activity === "topic_drill" && topic) payload.topic = topic;

    try {
      const session = await api.post<StartedSession>("/api/v1/speaking/sessions", payload);
      set({ session, starting: false });
      return session;
    } catch (err) {
      const conflict = err instanceof ApiError && err.status === 409;
      set({
        starting: false,
        startError: conflict
          ? "Another speaking session is still open. End it, then start a new one."
          : message(err, "Couldn't start the speaking session."),
      });
      return null;
    }
  },

  adopt: async (sessionId) => {
    const existing = get().session;
    if (existing?.session_id === sessionId) return existing;
    try {
      const record = await api.get<SessionRecord>(
        `/api/v1/speaking/sessions/${encodeURIComponent(sessionId)}`,
      );
      const session: StartedSession = {
        session_id: record.id,
        mode: record.mode,
        activity: (record.activity?.split(":")[0] as SpeakingActivity) ?? "full_mock",
        part: record.part,
        card_set_id: record.card_set_id,
        state: record.state as SpeakingPhase,
        offer_url: record.offer_url ?? `/api/v1/speaking/sessions/${record.id}/offer`,
        events_url: record.events_url ?? `/api/v1/speaking/sessions/${record.id}/events`,
      };
      set({ session });
      return session;
    } catch (err) {
      set({ startError: message(err, "That speaking session could not be loaded.") });
      return null;
    }
  },

  end: async (sessionId, opts = {}) => {
    const activity = get().session?.activity ?? null;
    const wantsScore = opts.score ?? isScoreable(activity);
    let turns = 0;
    try {
      // Hang up first (teardown flattens the turn rows in the same transaction,
      // R2-24), then score over the persisted transcript.
      const res = await api.post<{ turns?: number }>(
        `/api/v1/speaking/sessions/${encodeURIComponent(sessionId)}/hangup`,
        { score: false },
      );
      turns = res?.turns ?? 0;
    } catch (err) {
      set({ scoreError: message(err, "Couldn't end the session cleanly.") });
    }

    set({ lastEnd: { turns, scoreable: wantsScore } });

    if (!wantsScore || turns === 0) {
      set({ scoring: false });
      void get().loadHistory();
      return null;
    }
    return get().score(sessionId);
  },

  score: async (sessionId, opts = {}) => {
    set({ scoring: true, scoreError: null });
    try {
      const query = opts.force ? "?force=true" : "";
      const report = await api.post<SpeakingReport>(
        `/api/v1/speaking/sessions/${encodeURIComponent(sessionId)}/score${query}`,
      );
      set({ scoring: false });
      void get().loadHistory();
      return report?.report_id ?? null;
    } catch (err) {
      set({
        scoring: false,
        scoreError: message(err, "Scoring failed. Your transcript is saved — you can retry."),
      });
      return null;
    }
  },

  clearSession: () =>
    set({ session: null, scoring: false, scoreError: null, notes: "", lastEnd: null }),

  history: [],
  historyLoading: false,
  historyError: null,
  loadHistory: async () => {
    set({ historyLoading: true, historyError: null });
    try {
      const res = await api.get<{ items: SessionRecord[] }>(
        "/api/v1/speaking/sessions?limit=30",
      );
      set({ history: res.items ?? [], historyLoading: false });
    } catch (err) {
      set({
        history: [],
        historyLoading: false,
        historyError: message(err, "Couldn't load your speaking history."),
      });
    }
  },
}));

// ------------------------------------------------------- report data loading ---

/** `GET /api/v1/speaking/reports/{id}`. */
export async function fetchReport(reportId: string): Promise<SpeakingReport> {
  return api.get<SpeakingReport>(`/api/v1/speaking/reports/${encodeURIComponent(reportId)}`);
}

/**
 * Best-effort transcript fetch. The session record is tried first (it may inline
 * the transcript), then the dedicated sub-resource. A 404 means "this build does
 * not expose the transcript yet" and the report renders its quote-only view.
 */
export async function fetchTranscript(sessionId: string): Promise<TranscriptTurn[]> {
  const base = `/api/v1/speaking/sessions/${encodeURIComponent(sessionId)}`;
  try {
    const record = await api.get<SessionRecord>(base);
    const inline = record.transcript?.turns ?? record.turns;
    if (inline && inline.length > 0) return inline;
  } catch (err) {
    // Expected on builds where the session record does not inline turns.
    console.debug("[BandReady] session record carried no transcript", err);
  }
  try {
    const res = await api.get<{ turns?: TranscriptTurn[] } | TranscriptTurn[]>(
      `${base}/transcript`,
    );
    if (Array.isArray(res)) return res;
    return res?.turns ?? [];
  } catch (err) {
    console.debug("[BandReady] no transcript sub-resource for this session", err);
    return [];
  }
}

/** One row of the recorder's `manifest.json` (`voice/recorder.py::write_turn`). */
export interface TurnRecording {
  /** 1-based, matching the `turn-NNN.wav` filename. */
  turn_index: number;
  file: string;
  duration_ms?: number;
  sample_rate?: number;
  card_id?: string | null;
}

/**
 * Audio-only fallback for the report's replay controls: the recorder writes
 * `<media>/speaking/{session_id}/manifest.json` at teardown, and the media route
 * accepts a bearer token for XHR reads. Returns `[]` when nothing was recorded.
 */
export async function fetchTurnRecordings(sessionId: string): Promise<TurnRecording[]> {
  try {
    const res = await api.get<{ turns?: TurnRecording[] }>(
      `/api/v1/media/speaking/${encodeURIComponent(sessionId)}/manifest.json`,
    );
    return (res?.turns ?? []).filter((t) => Boolean(t?.file));
  } catch (err) {
    // No manifest means nothing was recorded (recording is opt-in) — not an error.
    console.debug("[BandReady] no recording manifest for this session", err);
    return [];
  }
}

/** Suggestions this session produced, so the inbox can accept/dismiss by id. */
export async function fetchSuggestions(
  sessionId: string,
  terms: string[],
): Promise<VocabSuggestionEntry[]> {
  try {
    const res = await api.get<{ items: VocabSuggestionEntry[] }>(
      "/api/v1/vocab/suggestions?limit=200",
    );
    const wanted = new Set(terms.map((t) => t.trim().toLowerCase()));
    return (res.items ?? []).filter(
      (entry) =>
        entry.source?.session_id === sessionId ||
        wanted.has((entry.lemma ?? entry.headword ?? "").toLowerCase()),
    );
  } catch (err) {
    console.warn("[BandReady] could not load this session's vocabulary suggestions", err);
    return [];
  }
}

export async function acceptSuggestion(entryId: string): Promise<void> {
  await api.post(`/api/v1/vocab/suggestions/${encodeURIComponent(entryId)}/accept`);
}

export async function dismissSuggestion(entryId: string): Promise<void> {
  await api.post(`/api/v1/vocab/suggestions/${encodeURIComponent(entryId)}/dismiss`);
}
