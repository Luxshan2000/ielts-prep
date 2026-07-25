import { create } from "zustand";
import { api, ApiError } from "@/lib/api";

/**
 * Global store #3 (01 §7.1): band estimates, today's plan and the streak.
 *
 * The shapes below are the ones `sidecar/bandready/server/routes/progress.py` and
 * `plan.py` actually return (10 §7 / §4) — `GET /api/v1/progress/summary` nests the
 * bands under `estimates.<skill>.band`, the streak under `streak.current`, and the
 * target band under `profile.target_band`. Read them through the selectors at the
 * bottom of this file rather than reaching into the payload from a component.
 */

export type Skill = "speaking" | "writing" | "reading" | "listening";

export interface BandEstimates {
  overall: number | null;
  speaking: number | null;
  writing: number | null;
  reading: number | null;
  listening: number | null;
}

/** One row of `summary.estimates` (10 §6 estimator output). */
export interface BandEstimate {
  skill: Skill | "overall";
  band: number | null;
  band_raw: number | null;
  range_low: number | null;
  range_high: number | null;
  confidence: "insufficient" | "low" | "medium" | "high" | string;
  attempts_used: number;
  method: string;
  stale: boolean;
  /** Pre-formatted for display — "—" when there is nothing to show yet. */
  display: string;
  [key: string]: unknown;
}

export interface ProgressCallout {
  id: string;
  kind?: string;
  title?: string;
  body?: string;
  severity?: "info" | "warn" | "success" | string;
  [key: string]: unknown;
}

export interface StreakSummary {
  current: number;
  longest: number;
  today_minutes: number;
  today_goal_met: boolean;
  daily_goal_min: number;
  next_milestone?: number | null;
  [key: string]: unknown;
}

export interface ProgressProfile {
  target_band: number | null;
  exam_date: string | null;
  exam_in_days: number | null;
  exam_format: "academic" | "general_training" | string;
  daily_minutes: number;
  study_days: string[];
}

export interface ProgressSummary {
  profile: ProgressProfile;
  estimates: Partial<Record<Skill | "overall", BandEstimate>>;
  streak: StreakSummary;
  callouts: ProgressCallout[];
  /** Present when a plan exists; `null` before onboarding generates one. */
  plan_id: string | null;
  needs_placement: boolean;
  stale_skills: Skill[];
  /** Verbatim 00 §8 wording — always render it next to a band number. */
  disclaimer: string;
  tooltip: string;
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

/** `GET /api/v1/plan` — the envelope, not the plan row itself. */
export interface PlanResponse {
  plan: { id: string; phase?: string; [key: string]: unknown } | null;
  today: { sessions?: PlanSession[]; [key: string]: unknown } | null;
  next: PlanSession | null;
  /** Set when `plan` is null, e.g. "no_plan_yet". */
  empty_reason?: string | null;
  hint?: string | null;
  [key: string]: unknown;
}

/** One cell of `GET /api/v1/progress/heatmap` (10 §7). */
export interface HeatmapPoint {
  date: string;
  minutes: number;
  level: number;
  goal_met: boolean;
  is_rest_day: boolean;
  future: boolean;
}

interface ProgressState {
  summary: ProgressSummary | null;
  plan: PlanResponse | null;
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

const SKILL_KEYS = ["overall", "speaking", "writing", "reading", "listening"] as const;

/** Band estimates with every skill present (null = not yet assessed). */
export function bandsOf(summary: ProgressSummary | null): BandEstimates {
  const out: BandEstimates = { ...EMPTY_BANDS };
  const estimates = summary?.estimates;
  if (!estimates) return out;
  for (const key of SKILL_KEYS) {
    const band = estimates[key]?.band;
    out[key] = typeof band === "number" ? band : null;
  }
  return out;
}

/** Current study streak in days — 0 when nothing has been studied yet. */
export function streakOf(summary: ProgressSummary | null): number {
  return Number(summary?.streak?.current ?? 0);
}

/** The learner's target band, or null before onboarding sets one. */
export function targetBandOf(summary: ProgressSummary | null): number | null {
  const target = summary?.profile?.target_band;
  return typeof target === "number" ? target : null;
}

/** Today's plan blocks — `[]` when no plan exists or today is a rest day. */
export function todaySessionsOf(plan: PlanResponse | null): PlanSession[] {
  return plan?.today?.sessions ?? [];
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
      api.get<PlanResponse>("/api/v1/plan"),
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
      const res = await api.get<{ cells?: HeatmapPoint[]; items?: HeatmapPoint[] } | HeatmapPoint[]>(
        `/api/v1/progress/heatmap?weeks=${weeks}`,
      );
      const items = Array.isArray(res) ? res : (res.cells ?? res.items ?? []);
      set({ heatmap: items, offline: false });
    } catch (err) {
      set({ heatmap: [], offline: err instanceof ApiError && err.isOffline });
    }
  },
}));
