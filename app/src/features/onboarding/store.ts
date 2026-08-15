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
import { useSettingsStore, type SettingsDoc } from "@/stores";
import { clearOnboardingDeferral, deferOnboarding } from "../home/firstRun";
import { useHomeStore } from "../home/store";
import {
  DEFAULT_DRAFT,
  type ArtifactState,
  type DetectDoc,
  type DownloadState,
  type EngineEntry,
  type LlmSlotPatch,
  type PlacementAdvanceResponse,
  type PlacementProgress,
  type PlacementResult,
  type PlacementStartResponse,
  type PlacementStep,
  type ProfileDraft,
  type ProviderPreset,
  type RecommendedDoc,
  type ScoringChoice,
  type SetupFlow,
  type SetupJobView,
  type VerifyResult,
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

/**
 * The "finish without the placement test" hatch appears from step 2 on.
 *
 * 10 §2 put it at step 4, which left steps 2 and 3 with no way out but Back —
 * and step 3 is where the wizard first asks a learner to commit to a weekly time
 * budget. Everything the hatch needs is valid by then: `DEFAULT_DRAFT` is a
 * complete profile, and the page disables it while a step's answers are not.
 */
export const ESCAPE_HATCH_FROM_INDEX = 1;

export type Phase = "wizard" | "placement" | "result";

function detailOf(err: unknown): string {
  return friendlyMessage(
    err,
    "the request failed",
    "The BandReady sidecar isn't responding — setup can't be saved right now.",
  );
}

// ------------------------------------------------------------- draft durability ---

/**
 * The wizard used to live in memory only, so a reload — or an Electron restart,
 * or a stray click into a practice room — threw away the exam date, target band
 * and study days and dropped the learner back on step 1. The answers are worth
 * three screens of typing and nothing about them is secret, so they ride in
 * `localStorage` next to `br-theme` until a plan is written.
 */
const DRAFT_KEY = "br-onboarding-draft";

interface StoredDraft {
  draft: ProfileDraft;
  step_index: number;
}

function loadStoredDraft(): StoredDraft {
  const empty: StoredDraft = { draft: { ...DEFAULT_DRAFT }, step_index: 0 };
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return empty;
    const saved = JSON.parse(raw) as Partial<StoredDraft>;
    return {
      draft: { ...DEFAULT_DRAFT, ...(saved.draft ?? {}) },
      step_index:
        typeof saved.step_index === "number"
          ? Math.max(0, Math.min(WIZARD_STEPS.length - 1, saved.step_index))
          : 0,
    };
  } catch {
    // A half-written or stale blob must never be the reason setup won't open.
    return empty;
  }
}

function persistDraft(draft: ProfileDraft, stepIndex: number): void {
  try {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ draft, step_index: stepIndex } satisfies StoredDraft),
    );
  } catch {
    /* private mode — the wizard still works, it just won't survive a reload */
  }
}

function clearStoredDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* the profile is on the sidecar now; the local copy is only a convenience */
  }
}

// ------------------------------------------------------------------- marking ---

/** The learner-facing sentence for a `POST /providers/verify` result. */
export function scoringStateSentence(result: VerifyResult | null): string {
  if (result === null) return "Not checked yet.";
  if (result.ok) return "Marking is ready.";
  switch (result.state) {
    case "unreachable":
      return "The model you chose isn't answering — it may not be started yet.";
    case "timeout":
      return "The model took too long to answer. It may still be loading.";
    case "unauthorized":
      return "That key was rejected. Check it and paste it again.";
    case "unconfigured":
      return "No marking model has been chosen yet.";
    case "no_model":
      return "The provider answered, but no usable model is selected.";
    default:
      return "The marking model could not be reached.";
  }
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

  // marking (step 4)
  presets: ProviderPreset[];
  scoring: VerifyResult | null;
  scoringChecking: boolean;
  scoringError: string | null;
  scoringChoice: ScoringChoice;
  savingScoring: boolean;
  setupJobs: Record<string, SetupJobView>;
  manualSetup: Record<string, SetupFlow>;

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
  /**
   * Sections the learner actually answered. `/placement/complete` reports a
   * section that could not be scored exactly like one that was skipped, so
   * without this the result screen would tell someone who wrote 150 words that
   * their band came "from your self-rating" (10 §6.4 — nothing claims more than
   * it knows). Paired with `scoringAtStart` it can say the truer thing.
   */
  answered: string[];
  /** Whether marking was reachable when the sitting began. */
  scoringAtStart: boolean | null;

  setDraft: (patch: Partial<ProfileDraft>) => void;
  goTo: (index: number) => void;
  next: () => void;
  back: () => void;
  clearError: () => void;

  runDetect: (fresh?: boolean) => Promise<void>;
  loadPresets: () => Promise<void>;
  checkScoring: () => Promise<void>;
  setScoringChoice: (choice: ScoringChoice) => void;
  runEngineSetup: (engineId: string) => Promise<void>;
  useLocalEngine: (engine: EngineEntry) => Promise<boolean>;
  saveCloudProvider: (presetId: string, apiKey: string, model: string) => Promise<boolean>;
  /** Write the `llm` slot and re-verify it. Used by both routes above. */
  saveScoringSlot: (patch: LlmSlotPatch, choice: ScoringChoice) => Promise<boolean>;
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

const restored = loadStoredDraft();

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  phase: "wizard",
  stepIndex: restored.step_index,
  draft: restored.draft,
  error: null,
  busy: false,

  detect: null,
  detecting: false,
  detectError: null,

  presets: [],
  scoring: null,
  scoringChecking: false,
  scoringError: null,
  scoringChoice: "later",
  savingScoring: false,
  setupJobs: {},
  manualSetup: {},

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
  answered: [],
  scoringAtStart: null,

  setDraft: (patch) =>
    set((s) => {
      const draft = { ...s.draft, ...patch };
      persistDraft(draft, s.stepIndex);
      return { draft, error: null };
    }),
  goTo: (index) => {
    const stepIndex = Math.max(0, Math.min(WIZARD_STEPS.length - 1, index));
    persistDraft(get().draft, stepIndex);
    set({ stepIndex, error: null });
  },
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

  loadPresets: async () => {
    if (get().presets.length > 0) return;
    try {
      const res = await api.get<ProviderPreset[] | { presets?: ProviderPreset[] }>(
        "/api/v1/providers/presets",
      );
      set({ presets: Array.isArray(res) ? res : (res?.presets ?? []) });
    } catch {
      // The cloud option simply doesn't appear; the local route and "Not now"
      // both still work, so this is never worth an error banner mid-wizard.
      set({ presets: [] });
    }
  },

  checkScoring: async () => {
    set({ scoringChecking: true, scoringError: null });
    try {
      // No `config` — verify the slot that is actually STORED, which is what the
      // next scored attempt will use.
      const res = await api.post<VerifyResult>("/api/v1/providers/verify", { modality: "llm" });
      set({ scoring: res ?? null, scoringChoice: res?.ok ? "local" : get().scoringChoice });
    } catch (err) {
      set({ scoringError: detailOf(err) });
    } finally {
      set({ scoringChecking: false });
    }
  },

  setScoringChoice: (choice) => set({ scoringChoice: choice }),

  runEngineSetup: async (engineId) => {
    const track = (view: SetupJobView) =>
      set((s) => ({ setupJobs: { ...s.setupJobs, [engineId]: view } }));
    track({ state: "queued", pct: null, detail: "starting…", error: null });
    try {
      const started = await api.post<{ job_id?: string } & SetupFlow>(
        `/api/v1/providers/setup/${encodeURIComponent(engineId)}`,
        {},
      );
      if (!started?.job_id) {
        // Installers, GUI apps and piped shell scripts: the sidecar hands back
        // instructions rather than running anything (03 §6).
        set((s) => {
          const jobs = { ...s.setupJobs };
          delete jobs[engineId];
          return {
            setupJobs: jobs,
            manualSetup: {
              ...s.manualSetup,
              [engineId]: { ...started, runnable: false, kind: started?.kind ?? "manual" },
            },
          };
        });
        return;
      }
      await api.pollJob(
        started.job_id,
        (job: Job) =>
          track({
            state: job.state === "done" ? "done" : "running",
            pct: job.progress_pct,
            detail: job.detail,
            error: null,
          }),
        { intervalMs: 500 },
      );
      track({ state: "done", pct: 100, detail: "ready", error: null });
      await get().runDetect(true);
    } catch (err) {
      track({ state: "error", pct: null, detail: null, error: detailOf(err) });
    }
  },

  useLocalEngine: async (engine) => {
    const preset = get().presets.find((p) => p.id === engine.id);
    const patch: LlmSlotPatch = { preset: engine.id };
    const baseUrl = engine.base_url ?? preset?.base_url;
    if (baseUrl) patch.base_url = baseUrl;
    // Rule 3 (03 §4): the model is chosen from what this endpoint actually
    // serves, never typed. `detect` already asked it.
    if (engine.models && engine.models.length > 0) patch.model = engine.models[0];
    return get().saveScoringSlot(patch, "local");
  },

  saveCloudProvider: async (presetId, apiKey, model) => {
    const preset = get().presets.find((p) => p.id === presetId);
    const patch: LlmSlotPatch = { preset: presetId, model };
    if (preset?.base_url) patch.base_url = preset.base_url;
    if (apiKey.trim()) patch.api_key = apiKey.trim();
    return get().saveScoringSlot(patch, "cloud");
  },

  saveScoringSlot: async (patch, choice) => {
    set({ savingScoring: true, scoringError: null });
    try {
      const saved = await useSettingsStore.getState().save({ llm: patch } as SettingsDoc);
      if (!saved) {
        set({
          scoringError:
            useSettingsStore.getState().error ??
            "That choice could not be saved. You can set it up in Settings instead.",
        });
        return false;
      }
      set({ scoringChoice: choice });
      await get().checkScoring();
      return get().scoring?.ok === true;
    } finally {
      set({ savingScoring: false });
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
        answered: [],
        scoringAtStart: get().scoring?.ok ?? null,
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
      const worked = payload.skip !== true;
      set((s) => ({
        progress: res.progress,
        step: res.next,
        answered:
          worked && !s.answered.includes(step.skill) ? [...s.answered, step.skill] : s.answered,
      }));
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
      clearStoredDraft();
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
      clearStoredDraft();
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
