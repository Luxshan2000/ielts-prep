import { create } from "zustand";
import { api, ApiError } from "@/lib/api";

/** Global store #3 (01 §7.1): band estimates, today's plan and the streak. */

export type Skill = "speaking" | "writing" | "reading" | "listening";

export interface BandEstimates {
  overall: number | null;
  speaking: number | null;
  writing: number | null;
  reading: number | null;
  listening: number | null;
}

export interface ProgressSummary {
  bands: Partial<BandEstimates>;
  streak_days?: number;
  target_band?: number | null;
  exam_date?: string | null;
  callouts?: { id: string; text: string; severity?: "info" | "warn" }[];
  [key: string]: unknown;
}

export interface PlanSession {
  id: string;
  title: string;
  skill?: Skill | "vocab";
  minutes?: number;
  state?: "pending" | "in_progress" | "done" | "skipped";
  /** Frontend route to start this block, e.g. "/speaking". */
  route?: string;
  [key: string]: unknown;
}

export interface StudyPlan {
  id?: string;
  today?: PlanSession[];
  phase?: string;
  [key: string]: unknown;
}

export interface HeatmapPoint {
  date: string;
  minutes: number;
  activities?: string[];
}

interface ProgressState {
  summary: ProgressSummary | null;
  plan: StudyPlan | null;
  heatmap: HeatmapPoint[];
  loading: boolean;
  offline: boolean;
  error: string | null;
  loadedAt: number | null;

  refresh: () => Promise<void>;
  refreshHeatmap: (weeks?: number) => Promise<void>;
}

const EMPTY_BANDS: BandEstimates = {
  overall: null,
  speaking: null,
  writing: null,
  reading: null,
  listening: null,
};

/** Band estimates with every skill present (null = not yet assessed). */
export function bandsOf(summary: ProgressSummary | null): BandEstimates {
  return { ...EMPTY_BANDS, ...(summary?.bands ?? {}) };
}

export const useProgressStore = create<ProgressState>((set) => ({
  summary: null,
  plan: null,
  heatmap: [],
  loading: false,
  offline: false,
  error: null,
  loadedAt: null,

  refresh: async () => {
    set({ loading: true, error: null });
    const [summary, plan] = await Promise.allSettled([
      api.get<ProgressSummary>("/api/v1/progress/summary"),
      api.get<StudyPlan>("/api/v1/plan"),
    ]);

    const failures = [summary, plan].filter((r) => r.status === "rejected");
    const offline = failures.some(
      (r) => r.status === "rejected" && r.reason instanceof ApiError && r.reason.isOffline,
    );
    const firstError = failures[0];

    set({
      summary: summary.status === "fulfilled" ? summary.value : null,
      // A missing plan (404 before onboarding) is an empty state, not an error.
      plan: plan.status === "fulfilled" ? plan.value : null,
      loading: false,
      offline,
      loadedAt: Date.now(),
      error:
        failures.length > 0 && firstError?.status === "rejected"
          ? firstError.reason instanceof ApiError
            ? firstError.reason.detail
            : "could not load progress"
          : null,
    });
  },

  refreshHeatmap: async (weeks = 12) => {
    try {
      const res = await api.get<{ items?: HeatmapPoint[] } | HeatmapPoint[]>(
        `/api/v1/progress/heatmap?weeks=${weeks}`,
      );
      const items = Array.isArray(res) ? res : (res.items ?? []);
      set({ heatmap: items, offline: false });
    } catch (err) {
      set({ heatmap: [], offline: err instanceof ApiError && err.isOffline });
    }
  },
}));
