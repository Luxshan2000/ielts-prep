import { create } from "zustand";
import { api, ApiError } from "@/lib/api";

/** Global store #4 (01 §7.1): SRS due counts + the current review-queue chunk. */

/** The six exercise types the sidecar emits (`bandready/srs/exercises.py::EXERCISE_TYPES`). */
export type ExerciseType =
  | "flip"
  | "cloze"
  | "use_in_sentence"
  | "collocation"
  | "audio_recall"
  | "speaking_drill";

export interface SrsQueueItem {
  card_id: string;
  entry_id: string;
  exercise_type: ExerciseType;
  /** Rendered payload for the chosen exercise type (shape owned by 08). */
  payload: Record<string, unknown>;
}

/**
 * `GET /api/v1/vocab/stats` (08 §8). The badge-relevant numbers are `due_today` at
 * the top level and the `counts` block — NOT flat `due`/`suggested` fields.
 */
export interface VocabStatsCounts {
  new?: number;
  learning?: number;
  young?: number;
  mature?: number;
  suspended?: number;
  known?: number;
  suggested?: number;
  active?: number;
  entries?: number;
  scheduled?: number;
  [key: string]: unknown;
}

export interface VocabStats {
  counts: VocabStatsCounts;
  due_today: number;
  due_now: number;
  new_available: number;
  reviews_today: number;
  retention_30d: number | null;
  streak: number;
  [key: string]: unknown;
}

interface SrsState {
  dueCount: number;
  suggestedCount: number;
  stats: VocabStats | null;
  queue: SrsQueueItem[];
  loading: boolean;
  offline: boolean;
  error: string | null;

  /** Cheap poll for the sidebar badge — stats only. */
  refreshDue: () => Promise<void>;
  /** Fetch the next review chunk. */
  loadQueue: (limit?: number) => Promise<void>;
  /** Drop the first queue item after it has been graded. */
  shiftQueue: () => void;
  clearQueue: () => void;
}

export const useSrsStore = create<SrsState>((set, get) => ({
  dueCount: 0,
  suggestedCount: 0,
  stats: null,
  queue: [],
  loading: false,
  offline: false,
  error: null,

  refreshDue: async () => {
    try {
      const stats = await api.get<VocabStats>("/api/v1/vocab/stats");
      set({
        stats,
        dueCount: Number(stats.due_today ?? stats.due_now ?? 0),
        suggestedCount: Number(stats.counts?.suggested ?? 0),
        offline: false,
        error: null,
      });
    } catch (err) {
      // The sidebar badge must never break the shell — degrade to zero.
      set({
        offline: err instanceof ApiError && err.isOffline,
        error: err instanceof ApiError ? err.detail : "could not load vocabulary stats",
      });
    }
  },

  loadQueue: async (limit = 20) => {
    set({ loading: true, error: null });
    try {
      const res = await api.get<{ items?: SrsQueueItem[] } | SrsQueueItem[]>(
        `/api/v1/srs/queue?limit=${limit}`,
      );
      const items = Array.isArray(res) ? res : (res.items ?? []);
      set({ queue: items, loading: false, offline: false });
    } catch (err) {
      set({
        queue: [],
        loading: false,
        offline: err instanceof ApiError && err.isOffline,
        error: err instanceof ApiError ? err.detail : "could not load the review queue",
      });
    }
  },

  shiftQueue: () => {
    const [, ...rest] = get().queue;
    set({ queue: rest, dueCount: Math.max(0, get().dueCount - 1) });
  },

  clearQueue: () => set({ queue: [] }),
}));
