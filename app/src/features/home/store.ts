/**
 * Dashboard feature store (per-feature ephemeral store — 01 §7.1).
 *
 * The global `useProgressStore` predates the curriculum routes and models a
 * different summary shape, so the dashboard talks to `/api/v1/progress/summary`
 * and `/api/v1/plan` directly and keeps the wire document verbatim. Nothing here
 * is attempt-in-progress state — durability stays the sidecar's job.
 */

import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import type { PlanResponse, PlanSession, ProgressSummary, SessionMarkResult } from "./types";

export interface LoadFailure {
  detail: string;
  code: string;
  offline: boolean;
}

function toFailure(err: unknown): LoadFailure {
  if (err instanceof ApiError) {
    return { detail: err.detail, code: err.code, offline: err.isOffline };
  }
  return {
    detail: err instanceof Error ? err.message : "the dashboard could not be loaded",
    code: "internal",
    offline: false,
  };
}

interface HomeState {
  summary: ProgressSummary | null;
  plan: PlanResponse | null;
  loading: boolean;
  /** True only for the very first load, so refreshes never flash a skeleton. */
  initialized: boolean;
  error: LoadFailure | null;
  /** Ids of callouts dismissed in this session (optimistic hide). */
  dismissing: string[];
  /** Set while POST /plan/generate is in flight. */
  generating: boolean;
  actionError: string | null;
  busySession: string | null;

  load: () => Promise<void>;
  /**
   * Drop the cached dashboard so the next visit refetches.
   *
   * Onboarding calls this the moment a plan exists: the dashboard is mounted
   * before the wizard runs (it owns the first-run redirect), so without this its
   * `plan_id: null` summary survives the whole sitting and bounces the learner
   * straight back into `/onboarding` after they finish.
   */
  invalidate: () => void;
  generatePlan: () => Promise<void>;
  dismissCallout: (eventId: string) => Promise<void>;
  startSession: (sessionId: string) => Promise<void>;
  completeSession: (sessionId: string, minutes?: number) => Promise<SessionMarkResult | null>;
  skipSession: (sessionId: string) => Promise<void>;
  clearActionError: () => void;
}

export const useHomeStore = create<HomeState>((set, get) => ({
  summary: null,
  plan: null,
  loading: false,
  initialized: false,
  error: null,
  dismissing: [],
  generating: false,
  actionError: null,
  busySession: null,

  load: async () => {
    set({ loading: true, error: null });
    const [summary, plan] = await Promise.allSettled([
      api.get<ProgressSummary>("/api/v1/progress/summary"),
      api.get<PlanResponse>("/api/v1/plan"),
    ]);

    // The summary is the screen; a plan failure alone is an empty state, not an error.
    if (summary.status === "rejected") {
      set({
        loading: false,
        initialized: true,
        error: toFailure(summary.reason),
        summary: null,
        plan: plan.status === "fulfilled" ? plan.value : null,
      });
      return;
    }
    set({
      summary: summary.value,
      plan: plan.status === "fulfilled" ? plan.value : null,
      loading: false,
      initialized: true,
      error: null,
    });
  },

  invalidate: () => set({ summary: null, plan: null, initialized: false, error: null }),

  generatePlan: async () => {
    set({ generating: true, actionError: null });
    try {
      await api.post<{ plan: unknown }>("/api/v1/plan/generate", {});
      await get().load();
    } catch (err) {
      set({ actionError: toFailure(err).detail });
    } finally {
      set({ generating: false });
    }
  },

  dismissCallout: async (eventId) => {
    set((s) => ({ dismissing: [...s.dismissing, eventId], actionError: null }));
    try {
      await api.post(`/api/v1/progress/callouts/${encodeURIComponent(eventId)}/dismiss`);
    } catch (err) {
      // Put it back — a failed dismiss must not silently hide the callout.
      set((s) => ({
        dismissing: s.dismissing.filter((id) => id !== eventId),
        actionError: toFailure(err).detail,
      }));
    }
  },

  startSession: async (sessionId) => {
    set({ busySession: sessionId, actionError: null });
    try {
      await api.post(`/api/v1/plan/sessions/${encodeURIComponent(sessionId)}/start`);
      const summary = await api.get<ProgressSummary>("/api/v1/progress/summary");
      set({ summary });
    } catch (err) {
      set({ actionError: toFailure(err).detail });
    } finally {
      set({ busySession: null });
    }
  },

  completeSession: async (sessionId, minutes) => {
    set({ busySession: sessionId, actionError: null });
    try {
      const result = await api.post<SessionMarkResult>(
        `/api/v1/plan/sessions/${encodeURIComponent(sessionId)}/complete`,
        minutes === undefined ? {} : { minutes },
      );
      await get().load();
      return result;
    } catch (err) {
      set({ actionError: toFailure(err).detail });
      return null;
    } finally {
      set({ busySession: null });
    }
  },

  skipSession: async (sessionId) => {
    set({ busySession: sessionId, actionError: null });
    try {
      await api.post(`/api/v1/plan/sessions/${encodeURIComponent(sessionId)}/skip`);
      await get().load();
    } catch (err) {
      set({ actionError: toFailure(err).detail });
    } finally {
      set({ busySession: null });
    }
  },

  clearActionError: () => set({ actionError: null }),
}));

/** Today's session, from the summary first and the plan document as a fallback. */
export function todaysSession(
  summary: ProgressSummary | null,
  plan: PlanResponse | null,
): PlanSession | null {
  return summary?.today ?? plan?.today ?? null;
}
