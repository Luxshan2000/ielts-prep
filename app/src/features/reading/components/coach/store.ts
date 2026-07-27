/**
 * Feature-local store for the reading coach.
 *
 * Separate from `features/reading/store.ts` on purpose: that store owns an attempt
 * in progress — answers, flags, the clock, the autosave queue — and the coach owns
 * none of those. The coach is a reader of the content pack plus the learner's own
 * attempt ledger, and it holds one piece of learner input that is not an answer: the
 * paragraph labels written during the two-minute map.
 *
 * **The gate is a fetch decision, not a render decision.** While the worked
 * solutions are locked, the keyed document is never requested — so the padlock is
 * not a `hidden` attribute over an answer that is sitting in memory. Unlocking is
 * the learner's own submitted attempt (the ledger in `attempted.ts`); a mock in
 * progress shuts the whole surface regardless.
 */

import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { friendlyMessage } from "@/lib/errors";
import type { ReadingFormat, TestDocument } from "../../types";
import { attemptRecordFor, type PassageAttemptRecord } from "./attempted";
import type { CoachPassage } from "./types";
import { hasKey } from "./types";

const RD = "/api/v1/reading";
const enc = encodeURIComponent;

export type CoachStatus = "idle" | "loading" | "ready" | "error";

export interface CoachSlot {
  status: CoachStatus;
  error: string | null;
  passage: CoachPassage | null;
  format: ReadingFormat;
  title: string;
  /** True when the document that arrived carries the key and the solutions. */
  keyed: boolean;
  /** Set when the sidecar itself refused the keyed document, with its reason. */
  serverLocked: string | null;
  /** The learner's own record on this passage at load time. */
  attempt: PassageAttemptRecord | null;
}

/** One question's self-diagnosis, taken before the solution is revealed. */
export interface DiagnosisState {
  /** Did the learner know where the answer was? Their claim, not a measurement. */
  located: "found" | "missed" | null;
  /** A trap slug from the type's shortlist, or `unsure`. */
  trap: string | null;
  revealed: boolean;
}

const EMPTY_DIAGNOSIS: DiagnosisState = { located: null, trap: null, revealed: false };

interface CoachState {
  slots: Record<string, CoachSlot>;
  loadPassage: (passageId: string, options?: { force?: boolean }) => Promise<void>;
  /** Re-read the ledger after an attempt is submitted elsewhere in the app. */
  syncAttempt: (passageId: string) => void;

  // ---- self-diagnosis (one per passage/question) --------------------------
  diagnosis: Record<string, DiagnosisState>;
  setDiagnosis: (passageId: string, number: number, patch: Partial<DiagnosisState>) => void;
  reveal: (passageId: string, number: number) => void;
  revealAll: (passageId: string, numbers: number[]) => void;

  // ---- the two-minute map ------------------------------------------------
  mapDrafts: Record<string, string>;
  mapRevealed: Record<string, boolean>;
  setMapLabel: (passageId: string, paragraphId: string, label: string) => void;
  revealMap: (passageId: string) => void;
  resetMap: (passageId: string, paragraphIds: string[]) => void;
}

export function coachError(err: unknown): string {
  return friendlyMessage(err, "That passage could not be opened.");
}

function diagnosisKey(passageId: string, number: number): string {
  return `${passageId}:${number}`;
}

export function mapKey(passageId: string, paragraphId: string): string {
  return `${passageId}#${paragraphId}`;
}

/** The document endpoint returns a one-passage test envelope. */
function unwrap(doc: TestDocument): CoachPassage | null {
  const first = (doc.passages ?? [])[0];
  return (first as CoachPassage | undefined) ?? null;
}

/**
 * Belt and braces on the gate: drop every question-level field that would answer
 * the question, before it is ever put in the store.
 *
 * The passage- and group-level payloads survive — the map, the strategy, the
 * paraphrase families and the vocabulary are preparation material and give nothing
 * away. What goes is the per-question layer: the key, the evidence quote, the
 * explanation and the whole `teaching` object, whose paraphrase link is a map
 * straight to the answer.
 *
 * The sidecar strips these from an exam-mode document as well. Doing it again here
 * means a build talking to a service that does not yet strip `teaching` still cannot
 * leak it into a locked screen, and there is nothing for a devtools panel to find.
 */
function withoutTheKey(passage: CoachPassage | null): CoachPassage | null {
  if (!passage) return null;
  return {
    ...passage,
    question_groups: (passage.question_groups ?? []).map((group) => ({
      ...group,
      questions: (group.questions ?? []).map((question) => {
        const {
          answers: _answers,
          explanation: _explanation,
          evidence_quote: _evidence,
          trap_note: _trap,
          teaching: _teaching,
          ...rest
        } = question;
        return rest;
      }),
    })),
  };
}

export const useCoachStore = create<CoachState>((set, get) => ({
  slots: {},

  async loadPassage(passageId, options) {
    if (!passageId) return;
    const attempt = attemptRecordFor(passageId);
    const existing = get().slots[passageId];
    const unlocked = attempt !== null;
    // A passage already loaded is re-fetched only when the gate state changed —
    // otherwise a learner who just submitted would keep the redacted document.
    if (
      !options?.force &&
      existing?.status === "ready" &&
      existing.keyed === (unlocked && existing.serverLocked === null)
    ) {
      if (existing.attempt?.submittedAt !== attempt?.submittedAt) {
        set((s) => ({ slots: { ...s.slots, [passageId]: { ...existing, attempt } } }));
      }
      return;
    }

    set((s) => ({
      slots: {
        ...s.slots,
        [passageId]: {
          status: "loading",
          error: null,
          passage: existing?.passage ?? null,
          format: existing?.format ?? "academic",
          title: existing?.title ?? "",
          keyed: false,
          serverLocked: null,
          attempt,
        },
      },
    }));

    let serverLocked: string | null = null;
    let doc: TestDocument | null = null;
    try {
      if (unlocked) {
        try {
          doc = await api.get<TestDocument>(`${RD}/passages/${enc(passageId)}?mode=review`);
        } catch (err) {
          // The sidecar has its own gate on the keyed document. If it refuses, say
          // so in its own words and fall back to the open document rather than
          // showing an error page over material the learner is entitled to.
          if (err instanceof ApiError && (err.status === 403 || err.status === 409)) {
            serverLocked = err.detail;
          } else {
            throw err;
          }
        }
      }
      if (!doc) {
        doc = await api.get<TestDocument>(`${RD}/passages/${enc(passageId)}?mode=exam`);
      }
      // Locked — including "the sidecar refused the keyed document" — means the
      // per-question layer is dropped on arrival rather than hidden at render.
      const open = unwrap(doc);
      const passage = unlocked && serverLocked === null ? open : withoutTheKey(open);
      set((s) => ({
        slots: {
          ...s.slots,
          [passageId]: {
            status: "ready",
            error: null,
            passage,
            format: (doc?.format as ReadingFormat) ?? "academic",
            title: doc?.title ?? passage?.title ?? "",
            keyed: hasKey(passage),
            serverLocked,
            attempt,
          },
        },
      }));
    } catch (err) {
      set((s) => ({
        slots: {
          ...s.slots,
          [passageId]: {
            status: "error",
            error: coachError(err),
            passage: null,
            format: "academic",
            title: "",
            keyed: false,
            serverLocked: null,
            attempt,
          },
        },
      }));
    }
  },

  syncAttempt(passageId) {
    const slot = get().slots[passageId];
    if (!slot) return;
    const attempt = attemptRecordFor(passageId);
    if (attempt?.submittedAt === slot.attempt?.submittedAt) return;
    set((s) => ({ slots: { ...s.slots, [passageId]: { ...slot, attempt } } }));
    // The gate just opened, so the keyed document has to be fetched.
    if (attempt && !slot.keyed) void get().loadPassage(passageId, { force: true });
  },

  diagnosis: {},

  setDiagnosis(passageId, number, patch) {
    const key = diagnosisKey(passageId, number);
    set((s) => ({
      diagnosis: { ...s.diagnosis, [key]: { ...(s.diagnosis[key] ?? EMPTY_DIAGNOSIS), ...patch } },
    }));
  },

  reveal(passageId, number) {
    get().setDiagnosis(passageId, number, { revealed: true });
  },

  revealAll(passageId, numbers) {
    set((s) => {
      const next = { ...s.diagnosis };
      for (const number of numbers) {
        const key = diagnosisKey(passageId, number);
        next[key] = { ...(next[key] ?? EMPTY_DIAGNOSIS), revealed: true };
      }
      return { diagnosis: next };
    });
  },

  mapDrafts: {},
  mapRevealed: {},

  setMapLabel(passageId, paragraphId, label) {
    set((s) => ({ mapDrafts: { ...s.mapDrafts, [mapKey(passageId, paragraphId)]: label } }));
  },

  revealMap(passageId) {
    set((s) => ({ mapRevealed: { ...s.mapRevealed, [passageId]: true } }));
  },

  resetMap(passageId, paragraphIds) {
    set((s) => {
      const drafts = { ...s.mapDrafts };
      for (const id of paragraphIds) delete drafts[mapKey(passageId, id)];
      return { mapDrafts: drafts, mapRevealed: { ...s.mapRevealed, [passageId]: false } };
    });
  },
}));

/** Read one question's diagnosis without subscribing to the whole map. */
export function diagnosisOf(
  state: Record<string, DiagnosisState>,
  passageId: string,
  number: number,
): DiagnosisState {
  return state[diagnosisKey(passageId, number)] ?? EMPTY_DIAGNOSIS;
}
