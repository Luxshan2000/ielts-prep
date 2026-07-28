/**
 * Feature-local store for the listening coach.
 *
 * Separate from `features/listening/store.ts` on purpose: that store owns an attempt in
 * progress — answers, the clock, the autosave queue, the play ledger — and the coach owns
 * none of those. The coach reads three documents and writes one thing that is not an
 * answer.
 *
 * It reads:
 *   1. `GET /listening/coach/scripts/{id}/teaching` — the whole part, with the timeline
 *      half present or absent according to the server's own gate;
 *   2. `GET /listening/coach/predictions/{id}` — the prediction drill, which is runnable
 *      before the part has ever been played and is the only listening exercise immune to
 *      the once-only constraint;
 *   3. `POST /listening/coach/replay` — the playable windows for one question, computed
 *      from `timing.json`'s sample-accurate offsets rather than a words-per-minute guess.
 *
 * It writes the learner's slot predictions, taken before any audio plays. Those live in
 * memory only: they are a warm-up, not a record.
 *
 * **The gate belongs to the sidecar, and this store does not second-guess it.** There is
 * no client-side attempt lookup here and no `unlocked` computed from a ledger — the
 * transcript, the signposts, the decoys and the authored slots are simply absent from the
 * response until the learner has submitted an attempt covering this script. `gate.message`
 * is what the padlock says, in the server's words, so the two can never drift apart.
 *
 * **A live mock shuts everything**, including a part legitimately unlocked last week, and
 * it shuts it from the moment the sitting is created rather than from `start` — a learner
 * reading transcripts while the render queue runs has already sat the paper. That refusal
 * arrives as a 409 on every route but `…/teaching`, which downgrades to a locked document
 * instead so the screen has something to render.
 */

import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { friendlyMessage } from "@/lib/errors";
import type { ExamConditions, PredictionsDoc, ReplayDoc, TeachingPayload } from "./types";

const COACH = "/api/v1/listening/coach";
const enc = encodeURIComponent;

export type CoachStatus = "idle" | "loading" | "ready" | "error";

export interface CoachSlot {
  status: CoachStatus;
  error: string | null;
  doc: TeachingPayload | null;
  predictions: PredictionsDoc | null;
  /** Set when the prediction drill itself was refused — i.e. a mock is running. */
  predictionsError: string | null;
}

const EMPTY_SLOT: CoachSlot = {
  status: "idle",
  error: null,
  doc: null,
  predictions: null,
  predictionsError: null,
};

/** What the learner predicted for one gap, before the audio played. */
export interface PredictionGuess {
  slot: string | null;
  revealed: boolean;
}

const EMPTY_GUESS: PredictionGuess = { slot: null, revealed: false };

/** One question's replay windows, kept per `(scriptId, number)`. */
export interface ReplaySlot {
  status: "loading" | "ready" | "error";
  doc: ReplayDoc | null;
  error: string | null;
}

interface CoachState {
  slots: Record<string, CoachSlot>;
  slotFor: (scriptId: string) => CoachSlot;
  loadScript: (scriptId: string, options?: { force?: boolean }) => Promise<void>;

  /** The live sitting holding the coach shut, if there is one. */
  conditions: ExamConditions | null;
  loadConditions: () => Promise<void>;

  // ---- the prediction warm-up ---------------------------------------------
  guesses: Record<string, PredictionGuess>;
  guessFor: (scriptId: string, number: number) => PredictionGuess;
  setGuess: (scriptId: string, number: number, slot: string) => void;
  revealPrediction: (scriptId: string, number: number) => void;
  revealAllPredictions: (scriptId: string, numbers: number[]) => void;
  resetPredictions: (scriptId: string, numbers: number[]) => void;

  // ---- replay --------------------------------------------------------------
  replays: Record<string, ReplaySlot>;
  replayFor: (scriptId: string, number: number) => ReplaySlot | null;
  loadReplay: (scriptId: string, number: number) => Promise<ReplayDoc | null>;
}

function guessKey(scriptId: string, number: number): string {
  return `${scriptId}:${number}`;
}

export const useCoachStore = create<CoachState>((set, get) => ({
  slots: {},
  conditions: null,

  slotFor: (scriptId) => get().slots[scriptId] ?? EMPTY_SLOT,

  async loadConditions() {
    try {
      set({ conditions: await api.get<ExamConditions>(`${COACH}/exam-conditions`) });
    } catch {
      // The guard must never take the screen down. Degrading to "no mock is running"
      // matches what the sidecar itself does when the lookup fails.
      set({ conditions: null });
    }
  },

  async loadScript(scriptId, options) {
    if (!scriptId) return;
    const existing = get().slots[scriptId];
    if (!options?.force && existing?.status === "ready") return;
    if (existing?.status === "loading") return;

    const patch = (next: Partial<CoachSlot>) =>
      set((state) => ({
        slots: {
          ...state.slots,
          [scriptId]: { ...(state.slots[scriptId] ?? EMPTY_SLOT), ...next },
        },
      }));

    patch({ status: "loading", error: null, predictionsError: null });
    void get().loadConditions();

    try {
      const doc = await api.get<TeachingPayload>(
        `${COACH}/scripts/${enc(scriptId)}/teaching`,
      );

      // The prediction drill is a second document because it is a different exercise
      // with a different lock: the cue table and the printed frames are never gated,
      // only the authored slot is. A 409 here means a mock is running, and that is a
      // state to render rather than an error to throw.
      let predictions: PredictionsDoc | null = null;
      let predictionsError: string | null = null;
      try {
        predictions = await api.get<PredictionsDoc>(`${COACH}/predictions/${enc(scriptId)}`);
      } catch (err) {
        predictionsError =
          err instanceof ApiError
            ? err.detail
            : friendlyMessage(err, "The prediction drill could not be opened.");
      }

      patch({ status: "ready", error: null, doc, predictions, predictionsError });
    } catch (err) {
      patch({
        status: "error",
        error: friendlyMessage(err, "That part could not be opened."),
        doc: null,
        predictions: null,
      });
    }
  },

  // ------------------------------------------------------------- predictions --
  guesses: {},

  guessFor: (scriptId, number) => get().guesses[guessKey(scriptId, number)] ?? EMPTY_GUESS,

  setGuess(scriptId, number, slot) {
    const key = guessKey(scriptId, number);
    set((state) => ({
      guesses: { ...state.guesses, [key]: { ...(state.guesses[key] ?? EMPTY_GUESS), slot } },
    }));
  },

  revealPrediction(scriptId, number) {
    const key = guessKey(scriptId, number);
    set((state) => ({
      guesses: {
        ...state.guesses,
        [key]: { ...(state.guesses[key] ?? EMPTY_GUESS), revealed: true },
      },
    }));
  },

  revealAllPredictions(scriptId, numbers) {
    set((state) => {
      const next = { ...state.guesses };
      for (const number of numbers) {
        const key = guessKey(scriptId, number);
        next[key] = { ...(next[key] ?? EMPTY_GUESS), revealed: true };
      }
      return { guesses: next };
    });
  },

  resetPredictions(scriptId, numbers) {
    set((state) => {
      const next = { ...state.guesses };
      for (const number of numbers) delete next[guessKey(scriptId, number)];
      return { guesses: next };
    });
  },

  // ------------------------------------------------------------------ replay --
  replays: {},

  replayFor: (scriptId, number) => get().replays[guessKey(scriptId, number)] ?? null,

  async loadReplay(scriptId, number) {
    const key = guessKey(scriptId, number);
    const existing = get().replays[key];
    if (existing?.status === "ready" && existing.doc) return existing.doc;
    if (existing?.status === "loading") return null;

    set((state) => ({
      replays: { ...state.replays, [key]: { status: "loading", doc: null, error: null } },
    }));
    try {
      const doc = await api.post<ReplayDoc>(`${COACH}/replay`, {
        script_id: scriptId,
        number,
      });
      set((state) => ({
        replays: { ...state.replays, [key]: { status: "ready", doc, error: null } },
      }));
      return doc;
    } catch (err) {
      set((state) => ({
        replays: {
          ...state.replays,
          [key]: {
            status: "error",
            doc: null,
            error: friendlyMessage(err, "That moment could not be located in the recording."),
          },
        },
      }));
      return null;
    }
  },
}));
