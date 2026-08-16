/**
 * Feature-local store for the mock exam.
 *
 * Deliberately separate from `../../store.ts`. The practice room's store carries a
 * mode, a part, a topic and a set of coaching preferences; a mock has none of those
 * choices — it is always all three parts, always scored, always without help. Sharing
 * the store would mean the sitting inherits whatever the learner last picked in the
 * practice room, which is exactly the class of bug that makes a mock untrustworthy.
 *
 * The one thing it does share is the session lifecycle on the wire: a mock sitting is
 * a `full_mock` speaking session (see `api.ts`).
 */

import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { friendlyMessage } from "@/lib/errors";
import type { SessionRecord, StartedSession } from "../../store";
import { abandonMock, hangUp, scoreSession, startMockSession } from "./api";

const OFFLINE_HINT =
  "Couldn't reach the practice engine. It may still be starting. Wait a few seconds and retry.";

function message(err: unknown, fallback: string): string {
  return friendlyMessage(err, fallback, OFFLINE_HINT);
}

/** True for the session rows that were full mock sittings. */
export function isMockRecord(record: SessionRecord): boolean {
  const activity = (record.activity ?? "").split(":")[0];
  if (activity) return activity === "full_mock";
  // Rows written before `practice_sessions.activity` existed only carry the
  // estimator weight class, where `mock` means the same thing (11 §4.2).
  return record.mode === "mock";
}

/** How the teardown went, so the wrap-up screen can be specific about it. */
export interface MockEnding {
  turns: number;
  /** Set when the hang-up itself failed — the transcript is still on disk. */
  hangupError: string | null;
}

interface MockState {
  // ---- pre-flight --------------------------------------------------------
  /** null = let the sidecar pick the least-recently-served set (04 §9). */
  cardSetId: string | null;
  setCardSetId: (id: string | null) => void;

  starting: boolean;
  startError: string | null;
  session: StartedSession | null;
  start: () => Promise<StartedSession | null>;

  // ---- the sitting -------------------------------------------------------
  /** Part 2 notes. Local only — never sent anywhere, cleared with the sitting. */
  notes: string;
  setNotes: (notes: string) => void;

  // ---- teardown ----------------------------------------------------------
  ending: MockEnding | null;
  scoring: boolean;
  scoreError: string | null;
  /** Hang up, then mark. Resolves with the report id when marking succeeded. */
  finish: (sessionId: string) => Promise<string | null>;
  /** Marking on its own — the retry after a failure. */
  mark: (sessionId: string, opts?: { force?: boolean }) => Promise<string | null>;
  reset: () => void;

  // ---- history -----------------------------------------------------------
  history: SessionRecord[];
  historyLoading: boolean;
  historyError: string | null;
  loadHistory: () => Promise<void>;
}

export const useMockStore = create<MockState>((set, get) => ({
  cardSetId: null,
  setCardSetId: (cardSetId) => set({ cardSetId, startError: null }),

  starting: false,
  startError: null,
  session: null,

  start: async () => {
    set({ starting: true, startError: null, notes: "", ending: null, scoreError: null });
    try {
      const session = await startMockSession(get().cardSetId);
      set({ session, starting: false });
      return session;
    } catch (err) {
      const conflict = err instanceof ApiError && err.status === 409;
      set({
        starting: false,
        startError: conflict
          ? "A speaking session is already open. Finish or end it before starting a mock."
          : message(err, "Couldn't start the mock test."),
      });
      return null;
    }
  },

  notes: "",
  setNotes: (notes) => set({ notes }),

  ending: null,
  scoring: false,
  scoreError: null,

  finish: async (sessionId) => {
    let turns = 0;
    let hangupError: string | null = null;
    try {
      // Hang up first: teardown flushes and flattens the transcript in the same
      // transaction (R2-24), so marking must not race it.
      turns = await hangUp(sessionId);
    } catch (err) {
      hangupError = message(err, "Couldn't close the session cleanly.");
    }
    set({ ending: { turns, hangupError } });

    if (turns === 0) {
      // Nothing was said. Marking silence would produce a band, which would be worse
      // than useless — it would go into the trend. Close the sitting anyway: the
      // server is under exam conditions until this row is closed, and a silent walk-out
      // must not leave the coach locked.
      await abandonMock(sessionId);
      set({ scoring: false });
      void get().loadHistory();
      return null;
    }
    return get().mark(sessionId);
  },

  mark: async (sessionId, opts = {}) => {
    set({ scoring: true, scoreError: null });
    try {
      const reportId = await scoreSession(sessionId, opts);
      set({ scoring: false });
      void get().loadHistory();
      return reportId;
    } catch (err) {
      // Marking is retryable, but the coach must not stay shut while the learner
      // retries: they have finished speaking, which is the whole point of the gate.
      await abandonMock(sessionId);
      set({
        scoring: false,
        scoreError: message(
          err,
          "Marking failed. Your recording and transcript are saved. You can retry.",
        ),
      });
      return null;
    }
  },

  reset: () =>
    set({ session: null, notes: "", ending: null, scoring: false, scoreError: null }),

  history: [],
  historyLoading: false,
  historyError: null,
  loadHistory: async () => {
    set({ historyLoading: true, historyError: null });
    try {
      const res = await api.get<{ items: SessionRecord[] }>(
        "/api/v1/speaking/sessions?limit=50",
      );
      set({
        history: (res.items ?? []).filter(isMockRecord),
        historyLoading: false,
      });
    } catch (err) {
      set({
        history: [],
        historyLoading: false,
        historyError: message(err, "Couldn't load your past mock tests."),
      });
    }
  },
}));
