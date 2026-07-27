/**
 * Feature-local store for the Writing Coach.
 *
 * Deliberately separate from `../../store.ts`. That store owns *an attempt in
 * progress* — one draft, one timer, one autosave loop — and the coach owns none of
 * those things: it is a study surface over a prompt's teaching payload plus
 * whatever the learner has already written on it. Sharing the store would mean
 * opening the coach clobbers a draft, which is the one thing a study screen must
 * never do.
 *
 * Prompts are cached per id for the life of the app process. The payload is pack
 * content — it cannot change between two reads — and the coach is a screen learners
 * move in and out of repeatedly.
 */

import { create } from "zustand";
import { api } from "@/lib/api";
import {
  message,
  type AttemptSummary,
  type WritingAttempt,
  type WritingPrompt,
} from "../../store";
import type { WritingTeaching } from "./types";

const PROMPTS = "/api/v1/writing/prompts";
const ATTEMPTS = "/api/v1/writing/attempts";
const COACH = "/api/v1/writing/coach/prompts";
const enc = encodeURIComponent;

export type SlotStatus = "idle" | "loading" | "ready" | "error";

export interface PromptSlot {
  status: SlotStatus;
  prompt: WritingPrompt | null;
  error: string | null;
}

/** The learner's own history on one prompt, as the coach needs it. */
export interface AttemptStanding {
  loading: boolean;
  error: string | null;
  /** Every attempt on this prompt, newest first. */
  attempts: AttemptSummary[];
  /** The newest scored attempt, fully loaded — the left column of Compare. */
  scored: WritingAttempt | null;
}

const EMPTY_STANDING: AttemptStanding = {
  loading: false,
  error: null,
  attempts: [],
  scored: null,
};

/**
 * Submitted — a draft with words in it has not been attempted yet.
 *
 * `failed` counts, and must: it does not mean the learner failed, it means the
 * *evaluator* could not be reached, which on an offline machine is where every
 * honest attempt lands. The sidecar's `coach.find_attempts` uses the same three
 * statuses; this is the optimistic local echo of it, used only until
 * {@link CoachGate} arrives from the server, which is the authority.
 */
export function isAttempted(attempts: AttemptSummary[]): boolean {
  return attempts.some(
    (a) => a.status === "submitted" || a.status === "scored" || a.status === "failed",
  );
}

/**
 * What the server will and will not hand over for one prompt.
 *
 * The gated half of the teaching payload — the three model answers, the ladder, the
 * swap slots, and the Academic overview's own content — is **not** on
 * `GET /writing/prompts/{id}`; the sidecar strips it there
 * (`writing/coach.py:redact_gated`) precisely so the lock cannot be picked with the
 * network tab. It arrives only here, from the one endpoint that reads the learner's
 * attempt history first, and only when that history earns it.
 *
 * Never cached with the prompt: pack content cannot change between two reads, but
 * whether this learner has written can, and does, the moment they submit.
 */
export interface CoachGate {
  loading: boolean;
  error: string | null;
  /** Null until the first successful load. */
  unlocked: boolean | null;
  /** The server's own reason: `not_attempted`, `attempted`, `exam_conditions`, … */
  reason: string | null;
  /** Empty while locked. */
  teaching: WritingTeaching | null;
}

const EMPTY_GATE: CoachGate = {
  loading: false,
  error: null,
  unlocked: null,
  reason: null,
  teaching: null,
};

/** The gated fields, exactly as `coach.py:GATED_FIELDS` names them. */
interface CoachTeachingResponse extends WritingTeaching {
  gate?: { unlocked?: boolean; reason?: string };
}

interface CoachState {
  prompts: Record<string, PromptSlot>;
  loadPrompt: (promptId: string, opts?: { force?: boolean }) => Promise<void>;

  standings: Record<string, AttemptStanding>;
  loadStanding: (promptId: string) => Promise<void>;

  gates: Record<string, CoachGate>;
  loadGate: (promptId: string) => Promise<void>;
  clearGates: () => void;

  /**
   * The find-the-difference answers, keyed by prompt. In memory only and on
   * purpose: this is a ten-second noticing task, not a record, and persisting it
   * would turn "say what changed" into "a thing I already answered once".
   */
  noticed: Record<string, string>;
  setNoticed: (promptId: string, value: string) => void;
  passed: Record<string, boolean>;
  pass: (promptId: string) => void;

  /**
   * The learner's own two whole-chart statements from the Overview Builder, kept so
   * they survive a tab change and can be set beside the authored ones afterwards.
   * Never scored, never sent anywhere.
   */
  overviewDraft: Record<string, [string, string]>;
  setOverviewDraft: (promptId: string, index: 0 | 1, value: string) => void;
}

export const useCoachStore = create<CoachState>((set, get) => ({
  prompts: {},

  loadPrompt: async (promptId, opts = {}) => {
    if (!promptId) return;
    const existing = get().prompts[promptId];
    if (!opts.force && existing && (existing.status === "ready" || existing.status === "loading")) {
      return;
    }
    set((s) => ({
      prompts: { ...s.prompts, [promptId]: { status: "loading", prompt: null, error: null } },
    }));
    try {
      const prompt = await api.get<WritingPrompt>(`${PROMPTS}/${enc(promptId)}`);
      set((s) => ({
        prompts: { ...s.prompts, [promptId]: { status: "ready", prompt, error: null } },
      }));
    } catch (err) {
      set((s) => ({
        prompts: {
          ...s.prompts,
          [promptId]: {
            status: "error",
            prompt: null,
            error: message(err, "That prompt could not be loaded."),
          },
        },
      }));
    }
  },

  standings: {},

  loadStanding: async (promptId) => {
    if (!promptId) return;
    set((s) => ({
      standings: {
        ...s.standings,
        [promptId]: { ...(s.standings[promptId] ?? EMPTY_STANDING), loading: true, error: null },
      },
    }));
    try {
      const res = await api.get<{ items: AttemptSummary[] }>(
        `${ATTEMPTS}?prompt_id=${enc(promptId)}&limit=40`,
      );
      const attempts = res.items ?? [];
      // One extra round trip, and only when there is something to fetch: the
      // summary carries a band but not the essay, the criteria or the annotations.
      const newestScored = attempts.find((a) => a.status === "scored") ?? null;
      let scored: WritingAttempt | null = null;
      if (newestScored) {
        scored = await api.get<WritingAttempt>(`${ATTEMPTS}/${enc(newestScored.id)}`);
      }
      set((s) => ({
        standings: { ...s.standings, [promptId]: { loading: false, error: null, attempts, scored } },
      }));
    } catch (err) {
      set((s) => ({
        standings: {
          ...s.standings,
          [promptId]: {
            ...(s.standings[promptId] ?? EMPTY_STANDING),
            loading: false,
            error: message(err, "Your attempts on this prompt could not be loaded."),
          },
        },
      }));
    }
  },

  gates: {},

  loadGate: async (promptId) => {
    if (!promptId) return;
    set((s) => ({
      gates: {
        ...s.gates,
        [promptId]: { ...(s.gates[promptId] ?? EMPTY_GATE), loading: true, error: null },
      },
    }));
    try {
      const doc = await api.get<CoachTeachingResponse>(`${COACH}/${enc(promptId)}/teaching`);
      const unlocked = Boolean(doc.gate?.unlocked);
      set((s) => ({
        gates: {
          ...s.gates,
          [promptId]: {
            loading: false,
            error: null,
            unlocked,
            reason: doc.gate?.reason ?? null,
            // Taken wholesale rather than merged field by field: this document is
            // the server's answer to "what may this learner see", and picking
            // through it here would put the decision back on the client.
            teaching: unlocked
              ? {
                  model_answers: doc.model_answers,
                  sentence_ladder: doc.sentence_ladder,
                  swap_slots: doc.swap_slots,
                  overview_brief: doc.overview_brief,
                  plan: doc.plan,
                }
              : null,
          },
        },
      }));
    } catch (err) {
      set((s) => ({
        gates: {
          ...s.gates,
          [promptId]: {
            ...(s.gates[promptId] ?? EMPTY_GATE),
            loading: false,
            unlocked: false,
            error: message(err, "The model answers could not be loaded."),
          },
        },
      }));
    }
  },

  /**
   * Drop every gated document held in memory. Called the moment a mock sitting
   * opens: the sitting is client-side today, so the sidecar would still answer the
   * teaching endpoint, and a model answer already sitting in a store is a model
   * answer the candidate can reach. Nothing is refetched until the hour is over.
   */
  clearGates: () => set({ gates: {} }),

  noticed: {},
  setNoticed: (promptId, value) =>
    set((s) => ({ noticed: { ...s.noticed, [promptId]: value } })),

  passed: {},
  pass: (promptId) => set((s) => ({ passed: { ...s.passed, [promptId]: true } })),

  overviewDraft: {},
  setOverviewDraft: (promptId, index, value) =>
    set((s) => {
      const current = s.overviewDraft[promptId] ?? ["", ""];
      const next: [string, string] = [current[0], current[1]];
      next[index] = value;
      return { overviewDraft: { ...s.overviewDraft, [promptId]: next } };
    }),
}));

/** Read a standing without subscribing to the whole map. */
export function standingOf(state: CoachState, promptId: string): AttemptStanding {
  return state.standings[promptId] ?? EMPTY_STANDING;
}
