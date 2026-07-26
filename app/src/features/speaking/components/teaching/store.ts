/**
 * Feature-local store for the teaching screens: a pack cache and the attempt gate.
 *
 * ## The attempt gate is pedagogy, not a paywall
 *
 * DESIGN.md §7 F1: a model answer shown *before* the learner has tried the card is a
 * script to memorise, and memorised language is exactly what the descriptors refuse
 * to credit. So `Compare` and the model answers unlock only once this set has been
 * attempted. Two things count, and both are real speaking:
 *
 *  - a finished speaking session whose `card_set_id` is this set (read from history);
 *  - a completed rehearsal in the prep coach — sixty seconds of prep followed by a
 *    full two-minute turn against the same cue card. No transcript, but the learner
 *    did the work, and refusing them the model afterwards would be pure gatekeeping.
 *
 * The local half is persisted so it survives a reload; losing it would re-lock a
 * screen the learner has already earned, which reads as a bug.
 */

import { create } from "zustand";
import { fetchTeachingPack, TeachingUnavailableError } from "./api";
import type { TeachingPack } from "./types";

const ATTEMPTS_KEY = "br-speaking-attempted-sets";

function readAttempts(): string[] {
  try {
    const raw = window.localStorage.getItem(ATTEMPTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    // Private mode, or somebody hand-edited the value. An empty gate is the safe
    // default: it locks the model answers rather than leaking them.
    return [];
  }
}

function writeAttempts(ids: string[]): void {
  try {
    window.localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(ids));
  } catch {
    /* the gate still holds for this session */
  }
}

export type PackStatus = "idle" | "loading" | "ready" | "unavailable" | "error";

export interface PackSlot {
  status: PackStatus;
  pack: TeachingPack | null;
  /** The raw thrown value, so `ErrorState` can classify offline vs provider. */
  error: unknown;
}

const EMPTY_SLOT: PackSlot = { status: "idle", pack: null, error: null };

interface TeachingState {
  packs: Record<string, PackSlot>;
  /** Sets the learner has spoken against outside a scored session. */
  rehearsed: string[];

  loadPack: (setId: string, opts?: { force?: boolean }) => Promise<void>;
  slot: (setId: string) => PackSlot;
  markRehearsed: (setId: string) => void;
}

export const useTeachingStore = create<TeachingState>((set, get) => ({
  packs: {},
  rehearsed: readAttempts(),

  slot: (setId) => get().packs[setId] ?? EMPTY_SLOT,

  loadPack: async (setId, opts = {}) => {
    if (!setId) return;
    const current = get().packs[setId];
    if (!opts.force && current && (current.status === "loading" || current.status === "ready")) {
      return;
    }
    set((s) => ({
      packs: { ...s.packs, [setId]: { status: "loading", pack: null, error: null } },
    }));
    try {
      const pack = await fetchTeachingPack(setId);
      set((s) => ({ packs: { ...s.packs, [setId]: { status: "ready", pack, error: null } } }));
    } catch (err) {
      set((s) => ({
        packs: {
          ...s.packs,
          [setId]: {
            status: err instanceof TeachingUnavailableError ? "unavailable" : "error",
            pack: null,
            error: err,
          },
        },
      }));
    }
  },

  markRehearsed: (setId) => {
    if (!setId || get().rehearsed.includes(setId)) return;
    const next = [...get().rehearsed, setId];
    writeAttempts(next);
    set({ rehearsed: next });
  },
}));

/**
 * Which sets the learner has already spoken against in a real session.
 * A session counts once it has ended and produced either a report or some duration —
 * starting a session and hanging up in the first five seconds is not an attempt.
 */
export function attemptedSetIds(
  history: { card_set_id: string | null; report_id?: string | null; duration_s: number | null }[],
): Set<string> {
  const ids = new Set<string>();
  for (const row of history) {
    if (!row.card_set_id) continue;
    const spoke = Boolean(row.report_id) || (row.duration_s ?? 0) >= 30;
    if (spoke) ids.add(row.card_set_id);
  }
  return ids;
}
