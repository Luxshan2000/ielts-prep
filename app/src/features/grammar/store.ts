/**
 * Grammar & Usage feature store (feature-local, ephemeral).
 *
 * Five slices over one sidecar module: the path, one point, one practice
 * session, the progress rollup, and the sentence-level vocabulary surface. The
 * only piece with real logic is the session, and even there the rule is that the
 * *server* grades and this store records — so what lives here is the three-beat
 * sequence F3 asks for (signal → elicit → reveal), the running tally, and the
 * two failure states a learner can act on.
 *
 * `missing` is deliberately not an error. A build whose sidecar has no grammar
 * routes, or a content pack with no `grammar.jsonl`, is a shipping state rather
 * than a fault, and it gets its own calm screen.
 */

import { create } from "zustand";
import { ApiError } from "@/lib/api";
import { friendlyMessage } from "@/lib/errors";
import {
  addRule,
  appealAnswer,
  fetchBoard,
  fetchBoards,
  fetchPath,
  fetchPatterns,
  fetchPoint,
  fetchProgress,
  finishSession,
  isModuleMissing,
  startSession,
  submitAnswer,
  type PatternsQuery,
  type SessionRequest,
} from "./api";
import { RETRYABLE_KINDS } from "./labels";
import type {
  AnswerResult,
  BoardDetail,
  BoardSummary,
  PathResponse,
  PatternsResponse,
  PointDetail,
  ProgressResponse,
  Reveal,
  SessionItem,
  SessionOutcome,
  SessionResponse,
} from "./types";

function message(err: unknown, fallback: string): string {
  return friendlyMessage(err, fallback);
}

function offline(err: unknown): boolean {
  return err instanceof ApiError && err.isOffline;
}

// ------------------------------------------------------------ attempt state ----

/** Where one item is in the three-beat sequence. */
export interface AttemptState {
  /** 1 before the first submit, 2 after a wrong first try on a retryable kind. */
  attempt: number;
  /** True once the reveal has arrived and the card is finished. */
  revealed: boolean;
  correct: boolean | null;
  reveal: Reveal | null;
  result: AnswerResult | null;
  /** Beat 1: wrong, cue highlighted, no answer yet, one more try. */
  signalled: boolean;
  hintUsed: boolean;
  replays: number;
  startedAt: number;
  /** Set after an appeal succeeds, so the screen can say so. */
  appealed: boolean;
}

function freshAttempt(): AttemptState {
  return {
    attempt: 1,
    revealed: false,
    correct: null,
    reveal: null,
    result: null,
    signalled: false,
    hintUsed: false,
    replays: 0,
    startedAt: Date.now(),
    appealed: false,
  };
}

export interface SessionSlice {
  id: string | null;
  request: SessionRequest | null;
  items: SessionItem[];
  index: number;
  counts: SessionResponse["counts"] | null;
  plan: SessionResponse["plan"];
  loading: boolean;
  /** Failure while BUILDING the session. */
  error: string | null;
  /** Failure while SAVING an answer — the card stays on screen, nothing is lost. */
  submitError: string | null;
  submitting: boolean;
  offline: boolean;
  emptyReason: string | null;
  attempt: AttemptState;
  outcomes: SessionOutcome[];
  finished: boolean;
}

function freshSession(): SessionSlice {
  return {
    id: null,
    request: null,
    items: [],
    index: 0,
    counts: null,
    plan: null,
    loading: false,
    error: null,
    submitError: null,
    submitting: false,
    offline: false,
    emptyReason: null,
    attempt: freshAttempt(),
    outcomes: [],
    finished: false,
  };
}

// ------------------------------------------------------------------- store ----

interface GrammarState {
  /** True when the sidecar has no grammar module or the pack carries no points. */
  missing: boolean;

  // ---------------------------------------------------------------- path
  path: PathResponse | null;
  pathLoading: boolean;
  pathError: string | null;
  loadPath: (force?: boolean) => Promise<void>;

  // --------------------------------------------------------------- point
  point: PointDetail | null;
  pointLoading: boolean;
  pointError: string | null;
  loadPoint: (pointId: string) => Promise<void>;

  // ------------------------------------------------------------- session
  session: SessionSlice;
  beginSession: (request: SessionRequest) => Promise<boolean>;
  answer: (input: {
    answer: string | number | number[] | null;
    followUp?: number | null;
    selfRating?: number | null;
  }) => Promise<void>;
  markHintUsed: () => void;
  markReplay: () => void;
  retryAfterSignal: () => void;
  nextItem: () => void;
  appeal: (meant: string) => Promise<void>;
  endSession: () => Promise<void>;
  resetSession: () => void;

  // ------------------------------------------------------------ progress
  progress: ProgressResponse | null;
  progressLoading: boolean;
  progressError: string | null;
  loadProgress: () => Promise<void>;

  // -------------------------------------------------------------- boards
  boards: BoardSummary[];
  board: BoardDetail | null;
  boardLoading: boolean;
  boardError: string | null;
  loadBoards: () => Promise<void>;
  loadBoard: (boardId: string) => Promise<void>;

  // ------------------------------------------------------------ patterns
  patterns: PatternsResponse | null;
  patternsLoading: boolean;
  patternsError: string | null;
  loadPatterns: (params?: PatternsQuery) => Promise<void>;

  // ----------------------------------------------------------- rule sheet
  savingRule: boolean;
  savedRules: string[];
  saveRule: (input: {
    pointId: string;
    ruleLine: string;
    learnerSentence?: string | null;
    correction?: string | null;
  }) => Promise<void>;
}

export const useGrammarStore = create<GrammarState>((set, get) => ({
  missing: false,

  // ------------------------------------------------------------------ path
  path: null,
  pathLoading: false,
  pathError: null,

  async loadPath(force = false) {
    if (get().pathLoading) return;
    if (get().path && !force) return;
    set({ pathLoading: true, pathError: null });
    try {
      const path = await fetchPath();
      set({ path, pathLoading: false, missing: (path.points?.length ?? 0) === 0 && !path.units?.length });
    } catch (err) {
      if (isModuleMissing(err)) {
        set({ pathLoading: false, missing: true, pathError: null });
        return;
      }
      set({ pathLoading: false, pathError: message(err, "The learning path could not be loaded.") });
    }
  },

  // ----------------------------------------------------------------- point
  point: null,
  pointLoading: false,
  pointError: null,

  async loadPoint(pointId) {
    set({ pointLoading: true, pointError: null, point: null });
    try {
      const point = await fetchPoint(pointId);
      set({ point, pointLoading: false });
    } catch (err) {
      set({
        pointLoading: false,
        pointError: message(err, "That lesson could not be opened."),
        missing: isModuleMissing(err) ? true : get().missing,
      });
    }
  },

  // --------------------------------------------------------------- session
  session: freshSession(),

  async beginSession(request) {
    set({ session: { ...freshSession(), loading: true, request } });
    try {
      const res = await startSession(request);
      set({
        session: {
          ...freshSession(),
          request,
          id: res.session_id ?? null,
          items: res.items ?? [],
          counts: res.counts ?? null,
          plan: res.plan ?? null,
          emptyReason: res.empty_reason ?? null,
          attempt: freshAttempt(),
        },
      });
      return (res.items?.length ?? 0) > 0;
    } catch (err) {
      set((s) => ({
        session: {
          ...s.session,
          loading: false,
          offline: offline(err),
          error: message(err, "The practice session could not be built."),
        },
        missing: isModuleMissing(err) ? true : s.missing,
      }));
      return false;
    }
  },

  async answer({ answer, followUp = null, selfRating = null }) {
    const { session } = get();
    const item = session.items[session.index];
    if (!item || session.submitting || session.attempt.revealed) return;

    set((s) => ({ session: { ...s.session, submitting: true, submitError: null } }));

    const attemptNo = session.attempt.attempt;
    const elapsed = Math.max(0, Date.now() - session.attempt.startedAt);

    try {
      const result = await submitAnswer({
        session_id: session.id ?? "",
        item_id: item.id,
        point_id: item.point_id,
        kind: item.kind,
        answer,
        follow_up: followUp,
        attempt: attemptNo,
        hint_used: session.attempt.hintUsed,
        elapsed_ms: elapsed,
        replays: session.attempt.replays,
        self_rating: selfRating,
      });

      // Beat 1: wrong, retryable, and the server withheld the key. Signal only —
      // the answer is never the first thing a learner sees after a mistake.
      const retryable =
        (item.retryable ?? RETRYABLE_KINDS.includes(item.kind)) && attemptNo === 1;
      const withheld = !result.correct && retryable && !result.reveal;

      if (withheld) {
        set((s) => ({
          session: {
            ...s.session,
            submitting: false,
            attempt: { ...s.session.attempt, signalled: true, correct: false },
          },
        }));
        return;
      }

      const outcome: SessionOutcome = {
        itemId: item.id,
        pointId: item.point_id,
        pointTitle: item.point_title ?? "",
        kind: item.kind,
        stage: item.stage,
        correct: !!result.correct,
        attempts: attemptNo,
        outcome: result.outcome ?? null,
        nextLabel: result.next_label ?? null,
        feedForward: result.reveal?.feed_forward ?? null,
      };

      set((s) => ({
        session: {
          ...s.session,
          submitting: false,
          outcomes: [...s.session.outcomes, outcome],
          attempt: {
            ...s.session.attempt,
            revealed: true,
            correct: !!result.correct,
            reveal: result.reveal ?? null,
            result,
          },
        },
      }));
    } catch (err) {
      set((s) => ({
        session: {
          ...s.session,
          submitting: false,
          offline: offline(err),
          submitError: message(err, "That answer could not be saved. Nothing before it was lost."),
        },
      }));
    }
  },

  markHintUsed() {
    set((s) => ({ session: { ...s.session, attempt: { ...s.session.attempt, hintUsed: true } } }));
  },

  markReplay() {
    set((s) => ({
      session: { ...s.session, attempt: { ...s.session.attempt, replays: s.session.attempt.replays + 1 } },
    }));
  },

  /** Beat 2 — one retry, always. The clock keeps running; the attempt number moves. */
  retryAfterSignal() {
    set((s) => ({
      session: {
        ...s.session,
        attempt: { ...s.session.attempt, attempt: 2, signalled: false, correct: null },
      },
    }));
  },

  nextItem() {
    const { session } = get();
    const last = session.index >= session.items.length - 1;
    if (last) {
      set((s) => ({ session: { ...s.session, finished: true } }));
      void get().endSession();
      return;
    }
    set((s) => ({
      session: { ...s.session, index: s.session.index + 1, attempt: freshAttempt(), submitError: null },
    }));
  },

  async appeal(meant) {
    const { session } = get();
    const item = session.items[session.index];
    if (!item) return;
    set((s) => ({ session: { ...s.session, submitting: true, submitError: null } }));
    try {
      const result = await appealAnswer({ session_id: session.id ?? "", item_id: item.id, meant });
      set((s) => ({
        session: {
          ...s.session,
          submitting: false,
          attempt: {
            ...s.session.attempt,
            correct: !!result.correct,
            reveal: result.reveal ?? s.session.attempt.reveal,
            result,
            appealed: true,
          },
          outcomes: s.session.outcomes.map((o) =>
            o.itemId === item.id ? { ...o, correct: !!result.correct } : o,
          ),
        },
      }));
    } catch (err) {
      set((s) => ({
        session: {
          ...s.session,
          submitting: false,
          submitError: message(err, "The appeal could not be sent."),
        },
      }));
    }
  },

  async endSession() {
    const id = get().session.id;
    if (!id) return;
    try {
      await finishSession(id);
    } catch {
      // A session that cannot be closed server-side has still had every answer
      // written as it went. Nothing to tell the learner about.
    }
    // The path and the progress rollup are both stale the moment a card moves.
    set({ path: null, progress: null });
  },

  resetSession() {
    set({ session: freshSession() });
  },

  // -------------------------------------------------------------- progress
  progress: null,
  progressLoading: false,
  progressError: null,

  async loadProgress() {
    set({ progressLoading: true, progressError: null });
    try {
      const progress = await fetchProgress();
      set({ progress, progressLoading: false });
    } catch (err) {
      if (isModuleMissing(err)) {
        set({ progressLoading: false, missing: true });
        return;
      }
      set({ progressLoading: false, progressError: message(err, "Your progress could not be loaded.") });
    }
  },

  // ---------------------------------------------------------------- boards
  boards: [],
  board: null,
  boardLoading: false,
  boardError: null,

  async loadBoards() {
    try {
      const res = await fetchBoards();
      set({ boards: res.boards ?? [] });
    } catch {
      // The board list is a convenience on the path screen. Its absence is not
      // worth an error card — every board is still reachable from its point.
      set({ boards: [] });
    }
  },

  async loadBoard(boardId) {
    set({ boardLoading: true, boardError: null, board: null });
    try {
      const board = await fetchBoard(boardId);
      set({ board, boardLoading: false });
    } catch (err) {
      set({ boardLoading: false, boardError: message(err, "That contrast board could not be opened.") });
    }
  },

  // -------------------------------------------------------------- patterns
  patterns: null,
  patternsLoading: false,
  patternsError: null,

  async loadPatterns(params = {}) {
    set({ patternsLoading: true, patternsError: null });
    try {
      const patterns = await fetchPatterns(params);
      set({ patterns, patternsLoading: false });
    } catch (err) {
      if (isModuleMissing(err)) {
        set({ patternsLoading: false, missing: true });
        return;
      }
      set({
        patternsLoading: false,
        patternsError: message(err, "The phrase bank could not be loaded."),
      });
    }
  },

  // ------------------------------------------------------------ rule sheet
  savingRule: false,
  savedRules: [],

  async saveRule({ pointId, ruleLine, learnerSentence = null, correction = null }) {
    if (get().savedRules.includes(pointId)) return;
    set({ savingRule: true });
    try {
      await addRule({
        point_id: pointId,
        rule_line: ruleLine,
        learner_sentence: learnerSentence,
        correction,
      });
      set((s) => ({ savingRule: false, savedRules: [...s.savedRules, pointId] }));
    } catch {
      set({ savingRule: false });
    }
  },
}));

/** The item on screen right now, or null between sessions. */
export function useCurrentItem(): SessionItem | null {
  return useGrammarStore((s) => s.session.items[s.session.index] ?? null);
}
