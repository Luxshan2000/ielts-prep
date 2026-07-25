/**
 * Onboarding feature store (10 §2/§3).
 *
 * Holds the seven-step wizard, the placement sitting and the model-download
 * jobs. The placement sitting itself is durable on the sidecar
 * (`practice_sessions` with `module='placement'`), so a reload resumes rather
 * than restarts — this store only mirrors the current step.
 */

import { create } from "zustand";
import { api, ApiError, type Job } from "@/lib/api";
import { friendlyMessage } from "@/lib/errors";
import { clearOnboardingDeferral, deferOnboarding } from "../home/firstRun";
import { useHomeStore } from "../home/store";
import {
  DEFAULT_DRAFT,
  type ArtifactState,
  type DetectDoc,
  type DownloadState,
  type PlacementAdvanceResponse,
  type PlacementProgress,
  type PlacementResult,
  type PlacementStartResponse,
  type PlacementStep,
  type ProfileDraft,
  type RecommendedDoc,
} from "./types";

export const WIZARD_STEPS = [
  "welcome",
  "exam",
  "level",
  "engines",
  "models",
  "mic",
  "placement-offer",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

/** 10 §2: "Set up later" appears on every step after step 3. */
export const ESCAPE_HATCH_FROM_INDEX = 3;

export type Phase = "wizard" | "placement" | "result";

function detailOf(err: unknown): string {
  return friendlyMessage(
    err,
    "the request failed",
    "The BandReady sidecar isn't responding — setup can't be saved right now.",
  );
}

interface OnboardingState {
  phase: Phase;
  stepIndex: number;
  draft: ProfileDraft;
  error: string | null;
  busy: boolean;

  // engines
  detect: DetectDoc | null;
  detecting: boolean;
  detectError: string | null;

  // models
  recommended: RecommendedDoc | null;
  artifacts: ArtifactState[];
  downloads: Record<string, DownloadState>;
  modelsError: string | null;
  loadingModels: boolean;

  // placement
  placementId: string | null;
  progress: PlacementProgress | null;
  step: PlacementStep | null;
  estimatedMinutes: number | null;
  submitting: boolean;
  result: PlacementResult | null;

  setDraft: (patch: Partial<ProfileDraft>) => void;
  goTo: (index: number) => void;
  next: () => void;
  back: () => void;
  clearError: () => void;

  runDetect: (fresh?: boolean) => Promise<void>;
  loadModels: () => Promise<void>;
  startDownload: (artifactId: string) => Promise<void>;
  cancelDownload: (artifactId: string) => Promise<void>;

  startPlacement: () => Promise<boolean>;
  answerStep: (payload: Record<string, unknown>) => Promise<void>;
  skipStep: () => Promise<void>;
  completePlacement: () => Promise<void>;
  skipPlacement: () => Promise<void>;
  setUpLater: () => Promise<void>;
  deferEntirely: () => void;
}

const jobControllers = new Map<string, { jobId: string; abort: AbortController }>();

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  phase: "wizard",
  stepIndex: 0,
  draft: { ...DEFAULT_DRAFT },
  error: null,
  busy: false,

  detect: null,
  detecting: false,
  detectError: null,

  recommended: null,
  artifacts: [],
  downloads: {},
  modelsError: null,
  loadingModels: false,

  placementId: null,
  progress: null,
  step: null,
  estimatedMinutes: null,
  submitting: false,
  result: null,

  setDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch }, error: null })),
  goTo: (index) =>
    set({ stepIndex: Math.max(0, Math.min(WIZARD_STEPS.length - 1, index)), error: null }),
  next: () => get().goTo(get().stepIndex + 1),
  back: () => get().goTo(get().stepIndex - 1),
  clearError: () => set({ error: null }),

  runDetect: async (fresh = false) => {
    set({ detecting: true, detectError: null });
    try {
      const doc = await api.get<DetectDoc>(
        `/api/v1/providers/detect${fresh ? "?fresh=1" : ""}`,
      );
      set({ detect: doc });
    } catch (err) {
      set({ detectError: detailOf(err) });
    } finally {
      set({ detecting: false });
    }
  },

  loadModels: async () => {
    set({ loadingModels: true, modelsError: null });
    try {
      const doc = await api.get<RecommendedDoc>("/api/v1/models/recommended");
      set({ recommended: doc, artifacts: doc.required_artifacts ?? [] });
    } catch (err) {
      set({ modelsError: detailOf(err) });
    } finally {
      set({ loadingModels: false });
    }
  },

  startDownload: async (artifactId) => {
    set((s) => ({
      downloads: {
        ...s.downloads,
        [artifactId]: { pct: 0, detail: "queued", state: "queued", error: null },
      },
    }));
    try {
      const res = await api.post<{ job_id?: string; state?: string }>(
        "/api/v1/models/download",
        { artifact_id: artifactId },
      );
      if (!res.job_id) {
        set((s) => ({
          downloads: {
            ...s.downloads,
            [artifactId]: { pct: 100, detail: "already installed", state: "done", error: null },
          },
        }));
        await get().loadModels();
        return;
      }
      const abort = new AbortController();
      jobControllers.set(artifactId, { jobId: res.job_id, abort });
      await api.pollJob(
        res.job_id,
        (job: Job) =>
          set((s) => ({
            downloads: {
              ...s.downloads,
              [artifactId]: {
                pct: job.progress_pct,
                detail: job.detail,
                state: job.state === "done" ? "done" : "running",
                error: null,
              },
            },
          })),
        { signal: abort.signal },
      );
      set((s) => ({
        downloads: {
          ...s.downloads,
          [artifactId]: { pct: 100, detail: "complete", state: "done", error: null },
        },
      }));
      await get().loadModels();
    } catch (err) {
      const cancelled = err instanceof ApiError && err.code === "cancelled";
      set((s) => ({
        downloads: {
          ...s.downloads,
          [artifactId]: {
            pct: null,
            detail: null,
            state: cancelled ? "cancelled" : "error",
            error: cancelled ? null : detailOf(err),
          },
        },
      }));
    } finally {
      jobControllers.delete(artifactId);
    }
  },

  cancelDownload: async (artifactId) => {
    const entry = jobControllers.get(artifactId);
    if (!entry) return;
    entry.abort.abort();
    try {
      await api.cancelJob(entry.jobId);
    } catch {
      /* the job may already be terminal — the .part file is kept either way */
    }
    set((s) => ({
      downloads: {
        ...s.downloads,
        [artifactId]: {
          pct: null,
          detail: "cancelled — the partial file was kept",
          state: "cancelled",
          error: null,
        },
      },
    }));
  },

  startPlacement: async () => {
    set({ busy: true, error: null });
    try {
      const res = await api.post<PlacementStartResponse>("/api/v1/placement/start", get().draft);
      set({
        phase: "placement",
        placementId: res.placement_id,
        progress: res.progress,
        step: res.next,
        estimatedMinutes: res.estimated_minutes,
      });
      // Every section may have been unavailable — finish immediately rather than
      // parking the learner on a blank screen.
      if (res.next === null) await get().completePlacement();
      return true;
    } catch (err) {
      set({ error: detailOf(err) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  answerStep: async (payload) => {
    const { placementId, step } = get();
    if (!step) return;
    set({ submitting: true, error: null });
    try {
      const res = await api.post<PlacementAdvanceResponse>("/api/v1/placement/answer", {
        placement_id: placementId,
        step: step.step,
        ...payload,
      });
      set({ progress: res.progress, step: res.next });
      if (res.next === null) await get().completePlacement();
    } catch (err) {
      set({ error: detailOf(err) });
    } finally {
      set({ submitting: false });
    }
  },

  skipStep: async () => {
    await get().answerStep({ skip: true });
  },

  completePlacement: async () => {
    set({ submitting: true, error: null });
    try {
      const res = await api.post<PlacementResult>("/api/v1/placement/complete", {
        placement_id: get().placementId,
        generate_plan: true,
      });
      clearOnboardingDeferral();
      // The dashboard was mounted before the wizard ran and still holds a
      // `plan_id: null` summary; without this it would redirect straight back.
      useHomeStore.getState().invalidate();
      set({ phase: "result", result: res, step: null });
    } catch (err) {
      set({ error: detailOf(err) });
    } finally {
      set({ submitting: false });
    }
  },

  skipPlacement: async () => {
    set({ busy: true, error: null });
    try {
      // The profile has to land first — /placement/skip only seeds estimates.
      await api.post<PlacementStartResponse>("/api/v1/placement/start", get().draft);
      const res = await api.post<PlacementResult>("/api/v1/placement/skip", {
        self_level: get().draft.self_level,
      });
      clearOnboardingDeferral();
      useHomeStore.getState().invalidate();
      set({ phase: "result", result: res, step: null, placementId: null });
    } catch (err) {
      set({ error: detailOf(err) });
    } finally {
      set({ busy: false });
    }
  },

  setUpLater: async () => {
    await get().skipPlacement();
  },

  deferEntirely: () => {
    deferOnboarding();
  },
}));
