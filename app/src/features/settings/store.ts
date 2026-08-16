/**
 * Settings feature store (feature-local, ephemeral — 12 §7 / R2-23).
 *
 * The *document* lives in the global `useSettingsStore`. This store owns the
 * editing session on top of it: form drafts, the preset registry, detection and
 * verification results, and the in-flight setup / download jobs.
 *
 * Saving is a `PATCH /api/v1/settings` (18 §1 deep-merge) applied optimistically
 * to the global doc and rolled back when the sidecar rejects it.
 */

import { create } from "zustand";
import { api, ApiError, type Job } from "@/lib/api";
import { useSettingsStore, type SettingsDoc } from "@/stores";

// --------------------------------------------------------------------- types

export type Modality = "llm" | "stt" | "tts";
export const MODALITIES: Modality[] = ["llm", "stt", "tts"];

/** The one remote provider. One key, and it serves all three jobs. */
export const OPENROUTER_PRESET = "openrouter";

/** The engine that runs each job on this computer. There is exactly one per job. */
export const LOCAL_PRESET: Record<Modality, string> = {
  llm: "ollama",
  stt: "faster_whisper",
  tts: "kokoro",
};

/** The masked value `GET /api/v1/settings` returns for a stored secret (03 §8). */
export const SECRET_MASK = "•••• (stored)";

export type FieldType = "text" | "password" | "number" | "select" | "bool" | "slider";

/** 03 §4 `config_spec` entry — the only thing that decides what the form renders. */
export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  default?: unknown;
  options?: string[];
  /** Populate the `<select>` from the Verify call's model list. */
  options_from?: "verify";
  secret?: boolean;
  group?: "connection" | "params";
  placeholder?: string;
  help?: string;
  min?: number;
  max?: number;
  step?: number;
  readonly?: boolean;
}

export interface Preset {
  id: string;
  label: string;
  modalities: Modality[];
  kind: "local-server" | "cloud" | "local-inproc" | "mock" | string;
  base_url?: string;
  base_url_locked?: boolean;
  needs_key?: boolean;
  key_env_hint?: string;
  platforms?: string[];
  docs_url?: string;
  suggested_models?: string[];
  /**
   * Models we have actually pointed this app at, per modality. A provider that serves all
   * three needs a different list in each slot — offering the chat models in the
   * speech-to-text dropdown is how somebody ends up transcribing with a chat model.
   */
  models_by_modality?: Partial<Record<Modality, string[]>>;
  engine?: string;
  notes?: string;
  hidden?: boolean;
  divider_before?: boolean;
  config_spec: FieldSpec[];
}

export interface VerifyResult {
  ok: boolean;
  latency_ms?: number;
  ttft_ms?: number;
  models?: string[];
  state?: string;
  detail?: string;
  warnings?: string[];
}

export interface DetectEngine {
  id: string;
  state: "running" | "installed" | "absent" | "ready" | "needs_download" | "unknown_server" | string;
  via?: string;
  version?: string;
  models?: string[];
  base_url?: string;
  download_mb?: number;
  detail?: string;
  unsupported_platform?: boolean;
}

export interface PlatformInfo {
  os?: string;
  arch?: string;
  apple_silicon?: boolean;
  ram_gb?: number | null;
  tier?: string;
}

/** Per-engine guided-setup summary the detect route attaches (03 §6). */
export interface SetupFlow {
  runnable: boolean;
  kind: "download" | "command" | "manual" | "none" | string;
  /** The exact command the sidecar would run, shown verbatim before it runs. */
  command?: string;
  artifact?: string;
  reason?: string;
  url?: string;
  /** A command the app will never execute — copy-to-clipboard only. */
  copy?: string;
  instructions?: string;
}

export interface DetectReport {
  platform: PlatformInfo;
  engines: DetectEngine[];
  detected_at?: number;
  setup?: Record<string, SetupFlow>;
}

/** One row of `GET /api/v1/models/downloads`'s `artifacts` (13 §7.2). */
export interface ArtifactState {
  artifact_id: string;
  label: string;
  kind?: string;
  engine?: string;
  path?: string;
  approx_mb?: number | null;
  state: "installed" | "partial" | "absent" | string;
  files?: {
    name: string;
    present: boolean;
    bytes: number;
    partial_bytes: number;
    expected_size?: number | null;
  }[];
}

/**
 * One row of `GET /api/v1/providers/openrouter/models` (03 §9).
 *
 * The catalogue is fetched rather than shipped because it changes weekly, and because a
 * speech model's voice list exists nowhere else: Aura-2 alone carries ninety of them, and
 * a hardcoded copy would be wrong within a month.
 */
export interface CatalogueModel {
  id: string;
  name?: string;
  description?: string;
  pricing?: Record<string, unknown> | null;
  context_length?: number | null;
  /** Populated for text-to-speech models, `[]` everywhere else. */
  voices?: string[];
  input_modalities?: string[];
  output_modalities?: string[];
}

export interface CatalogueState {
  models: CatalogueModel[];
  /**
   * The sidecar's pick for this job. It comes back on every response *including* a failed
   * one, which is what lets a section stay usable with no listing at all.
   */
  recommended: string | null;
  loading: boolean;
  /** Set when the listing could not be fetched. Never fatal: `recommended` still stands. */
  error: string | null;
  loadedAt: number | null;
}

export interface JobView {
  jobId: string;
  state: Job["state"];
  pct: number | null;
  detail: string | null;
  error: string | null;
}

export type SlotDraft = Record<string, unknown>;

export interface VadDraft {
  confidence: number;
  start_secs: number;
  stop_secs: number;
  min_volume: number;
}

export interface Drafts {
  llm: SlotDraft;
  stt: SlotDraft;
  tts: SlotDraft;
  vad: VadDraft;
}

/** 03 §2.3: the schema clamps `min_volume` — above this normal speech is gated out. */
export const MIN_VOLUME_CAP = 0.6;

export const VAD_DEFAULTS: VadDraft = {
  confidence: 0.5,
  start_secs: 0.2,
  stop_secs: 0.6,
  min_volume: 0.0,
};

// ------------------------------------------------------------------- helpers

export function getPath(obj: Record<string, unknown> | undefined, path: string): unknown {
  if (!obj) return undefined;
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
    return undefined;
  }, obj);
}

export function setPath<T extends Record<string, unknown>>(
  obj: T,
  path: string,
  value: unknown,
): T {
  const parts = path.split(".");
  const out: Record<string, unknown> = { ...obj };
  let cursor = out;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const next = cursor[key];
    cursor[key] = next && typeof next === "object" ? { ...(next as object) } : {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
  return out as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  patch: Record<string, unknown>,
): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    out[key] = isPlainObject(value) && isPlainObject(current) ? deepMerge(current, value) : value;
  }
  return out as T;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** `${ENV_VAR}` references are shown literally — they are not secrets (03 §8). */
export function isEnvRef(value: unknown): value is string {
  return typeof value === "string" && /^\$\{[A-Z0-9_]+\}$/.test(value.trim());
}

export function isMasked(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("••••");
}

const EMPTY_SLOT: SlotDraft = {};

function slotOf(doc: SettingsDoc | null, modality: Modality): SlotDraft {
  const raw = doc?.[modality];
  return isPlainObject(raw) ? (raw as SlotDraft) : EMPTY_SLOT;
}

function vadOf(doc: SettingsDoc | null): VadDraft {
  const raw = isPlainObject(doc?.vad) ? (doc?.vad as Record<string, unknown>) : {};
  return {
    confidence: clamp(num(raw.confidence, VAD_DEFAULTS.confidence), 0.1, 0.9),
    start_secs: clamp(num(raw.start_secs, VAD_DEFAULTS.start_secs), 0.05, 1),
    stop_secs: clamp(num(raw.stop_secs, VAD_DEFAULTS.stop_secs), 0.2, 3),
    min_volume: clamp(num(raw.min_volume, VAD_DEFAULTS.min_volume), 0, MIN_VOLUME_CAP),
  };
}

function draftsFromDoc(doc: SettingsDoc | null): Drafts {
  return {
    llm: { ...slotOf(doc, "llm") },
    stt: { ...slotOf(doc, "stt") },
    tts: { ...slotOf(doc, "tts") },
    vad: vadOf(doc),
  };
}

function errText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.detail || err.code || fallback;
  return err instanceof Error ? err.message : fallback;
}

/** A 404 means the sidecar simply has not shipped that route in this build. */
function isMissingRoute(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405);
}

/** Strip secrets before an optimistic overlay — plaintext never enters the cache. */
function withoutSecrets(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "api_key") continue;
    out[key] = isPlainObject(value) ? withoutSecrets(value) : value;
  }
  return out;
}

/**
 * Optimistic `PATCH /api/v1/settings`: the global doc is updated before the
 * request so the UI never lags, and restored verbatim if the sidecar refuses.
 */
export async function patchSettingsOptimistic(patch: SettingsDoc): Promise<boolean> {
  const previous = useSettingsStore.getState().doc;
  if (previous) {
    useSettingsStore.setState({
      doc: deepMerge(previous as Record<string, unknown>, withoutSecrets(patch)) as SettingsDoc,
    });
  }
  const ok = await useSettingsStore.getState().save(patch);
  if (!ok && previous) useSettingsStore.setState({ doc: previous });
  // A provider change re-keys everything an engine has already produced, so anything
  // the app cached because "the audio is ready" has to be re-asked rather than
  // re-displayed. Only on success: a refused PATCH changed nothing to invalidate.
  if (ok && "providers" in patch) useSettingsStore.getState().bumpGeneration();
  return ok;
}

// --------------------------------------------------------------------- store

interface SettingsFeatureState {
  drafts: Drafts;
  baseline: Drafts;
  secretTouched: Record<Modality, boolean>;
  hydratedFrom: SettingsDoc | null;

  presets: Preset[];
  presetsLoading: boolean;
  presetsError: string | null;

  detectReport: DetectReport | null;
  detecting: boolean;
  detectError: string | null;

  verify: Partial<Record<Modality, VerifyResult>>;
  verifying: Modality | null;
  verifyError: Partial<Record<Modality, string>>;

  setupJobs: Record<string, JobView>;
  manualSetup: Record<string, SetupFlow>;
  downloads: Record<string, JobView>;
  artifacts: ArtifactState[];
  modelsError: string | null;

  /** The live OpenRouter catalogue, one entry per job that has asked for it. */
  catalogue: Partial<Record<Modality, CatalogueState>>;

  saving: boolean;
  savedAt: number | null;
  saveError: string | null;

  hydrate: (doc: SettingsDoc | null) => void;
  setField: (modality: Modality, key: string, value: unknown) => void;
  /** Write one key into every slot pointed at OpenRouter. Asked for once, used by all. */
  setOpenRouterKey: (value: string) => void;
  applyPreset: (modality: Modality, preset: Preset) => void;
  useDetectedEngine: (engine: DetectEngine) => void;
  setVad: (key: keyof VadDraft, value: number) => void;
  discard: () => void;
  isDirty: () => boolean;
  save: () => Promise<boolean>;

  loadPresets: () => Promise<void>;
  runDetect: (fresh?: boolean) => Promise<void>;
  runVerify: (modality: Modality) => Promise<void>;
  runSetup: (engineId: string) => Promise<void>;
  loadCatalogue: (modality: Modality, refresh?: boolean) => Promise<void>;
  loadModels: () => Promise<void>;
  startDownload: (artifactId: string) => Promise<void>;
  cancelDownload: (artifactId: string) => Promise<void>;
  presetsFor: (modality: Modality) => Preset[];
  presetById: (id: string | undefined) => Preset | undefined;
}

const emptyDrafts = (): Drafts => ({ llm: {}, stt: {}, tts: {}, vad: { ...VAD_DEFAULTS } });

export const useSettingsFeatureStore = create<SettingsFeatureState>((set, get) => ({
  drafts: emptyDrafts(),
  baseline: emptyDrafts(),
  secretTouched: { llm: false, stt: false, tts: false },
  hydratedFrom: null,

  presets: [],
  presetsLoading: false,
  presetsError: null,

  detectReport: null,
  detecting: false,
  detectError: null,

  verify: {},
  verifying: null,
  verifyError: {},

  setupJobs: {},
  manualSetup: {},
  downloads: {},
  artifacts: [],
  modelsError: null,

  catalogue: {},

  saving: false,
  savedAt: null,
  saveError: null,

  hydrate: (doc) => {
    const next = draftsFromDoc(doc);
    set({
      drafts: next,
      baseline: JSON.parse(JSON.stringify(next)) as Drafts,
      secretTouched: { llm: false, stt: false, tts: false },
      hydratedFrom: doc,
      saveError: null,
    });
  },

  setField: (modality, key, value) => {
    const drafts = get().drafts;
    const nextSlot = setPath({ ...drafts[modality] }, key, value);
    const secretTouched =
      key === "api_key"
        ? { ...get().secretTouched, [modality]: true }
        : get().secretTouched;
    set({ drafts: { ...drafts, [modality]: nextSlot }, secretTouched, savedAt: null });
  },

  /**
   * One key, three jobs.
   *
   * The sidecar stores a key per slot and never shares one across them, so a learner who
   * pasted a key for the examiner and then sent the voice to OpenRouter used to get
   * "the key was rejected" on a screen that told them a key was saved. The key field is
   * asked for once; this is what makes that true in storage as well as on screen.
   */
  setOpenRouterKey: (value) => {
    const drafts = { ...get().drafts };
    const secretTouched = { ...get().secretTouched };
    let changed = false;
    for (const modality of MODALITIES) {
      if (drafts[modality].preset !== OPENROUTER_PRESET) continue;
      drafts[modality] = { ...drafts[modality], api_key: value };
      secretTouched[modality] = true;
      changed = true;
    }
    if (!changed) return;
    set({ drafts, secretTouched, savedAt: null });
  },

  applyPreset: (modality, preset) => {
    const drafts = get().drafts;
    const previous = drafts[modality];
    // Re-selecting the provider that is already configured is a no-op, not a reset.
    // Otherwise: try local → it doesn't work → go back to the cloud service you had a
    // working key for → the key field is empty, Verify says the key was refused, and
    // nothing ever said BandReady had thrown it away.
    const samePreset = previous.preset === preset.id;
    if (samePreset) {
      set({ verify: { ...get().verify, [modality]: undefined }, savedAt: null });
      return;
    }

    let slot: SlotDraft = { preset: preset.id };
    if (preset.base_url !== undefined) slot.base_url = preset.base_url;
    if (preset.engine) slot.engine = preset.engine;
    // A different provider means a different key — never carry the previous one over.
    slot.api_key = "";
    for (const spec of preset.config_spec) {
      if (spec.default !== undefined) slot = setPath(slot, spec.key, spec.default);
    }
    const previousModel = previous.model;
    if (
      typeof previousModel === "string" &&
      preset.suggested_models?.includes(previousModel)
    ) {
      slot.model = previousModel;
    }
    if (modality === "stt") slot.language = "en";
    set({
      drafts: { ...drafts, [modality]: slot },
      secretTouched: { ...get().secretTouched, [modality]: true },
      verify: { ...get().verify, [modality]: undefined },
      savedAt: null,
    });
  },

  useDetectedEngine: (engine) => {
    const modality: Modality =
      engine.id === "kokoro" ? "tts" : engine.id.includes("whisper") ? "stt" : "llm";
    const preset = get().presetById(engine.id);
    if (!preset) return;
    get().applyPreset(modality, preset);
    const drafts = get().drafts;
    const slot: SlotDraft = { ...drafts[modality] };
    if (engine.base_url) slot.base_url = engine.base_url;
    if (engine.models && engine.models.length > 0) slot.model = engine.models[0];
    set({ drafts: { ...drafts, [modality]: slot }, savedAt: null });
  },

  setVad: (key, value) => {
    const vad = { ...get().drafts.vad, [key]: value };
    vad.min_volume = clamp(vad.min_volume, 0, MIN_VOLUME_CAP);
    set({ drafts: { ...get().drafts, vad }, savedAt: null });
  },

  discard: () => {
    const baseline = get().baseline;
    set({
      drafts: JSON.parse(JSON.stringify(baseline)) as Drafts,
      secretTouched: { llm: false, stt: false, tts: false },
      saveError: null,
      savedAt: null,
    });
  },

  isDirty: () => JSON.stringify(get().drafts) !== JSON.stringify(get().baseline),

  save: async () => {
    const { drafts, baseline, secretTouched } = get();
    const patch: Record<string, unknown> = {};
    for (const modality of MODALITIES) {
      const slot: SlotDraft = { ...drafts[modality] };
      if (!secretTouched[modality] || isMasked(slot.api_key)) delete slot.api_key;
      if (JSON.stringify(slot) !== JSON.stringify(stripKey(baseline[modality]))) {
        patch[modality] = slot;
      }
    }
    if (JSON.stringify(drafts.vad) !== JSON.stringify(baseline.vad)) patch.vad = drafts.vad;
    if (Object.keys(patch).length === 0) return true;

    set({ saving: true, saveError: null });
    const ok = await patchSettingsOptimistic(patch as SettingsDoc);
    if (ok) {
      const fresh = useSettingsStore.getState().doc;
      get().hydrate(fresh);
      set({ saving: false, savedAt: Date.now(), saveError: null });
    } else {
      set({
        saving: false,
        saveError: useSettingsStore.getState().error ?? "could not save settings",
      });
    }
    return ok;
  },

  loadPresets: async () => {
    set({ presetsLoading: true, presetsError: null });
    try {
      // The route answers `{presets: [...], mock_enabled}`; a bare array is also
      // accepted so the UI keeps working if that ever changes back.
      const res = await api.get<Preset[] | { presets?: Preset[] }>(
        "/api/v1/providers/presets",
      );
      const presets = Array.isArray(res) ? res : (res?.presets ?? []);
      set({
        presets,
        presetsLoading: false,
        presetsError: presets.length === 0 ? "No provider presets were returned." : null,
      });
    } catch (err) {
      set({
        presetsLoading: false,
        presetsError: isMissingRoute(err)
          ? "This sidecar build does not serve the provider registry yet."
          : errText(err, "could not load the provider presets"),
      });
    }
  },

  runDetect: async (fresh = false) => {
    set({ detecting: true, detectError: null });
    try {
      const report = await api.get<DetectReport>(
        `/api/v1/providers/detect${fresh ? "?fresh=1" : ""}`,
      );
      set({ detectReport: report, detecting: false });
    } catch (err) {
      set({
        detecting: false,
        detectError: isMissingRoute(err)
          ? "Engine detection is not available in this sidecar build."
          : errText(err, "detection failed"),
      });
    }
  },

  runVerify: async (modality) => {
    const { drafts, baseline, secretTouched } = get();
    const slot = { ...drafts[modality] };
    const untouchedSlot =
      JSON.stringify(stripKey(slot)) === JSON.stringify(stripKey(baseline[modality]));
    // The renderer never holds a plaintext key. With no unsaved edits we omit
    // `config` so the sidecar verifies the STORED slot — key included. With
    // unsaved edits we send the form state and the sentinel for the key.
    const useStored = !secretTouched[modality] && untouchedSlot;
    if (!secretTouched[modality] && slot.api_key !== undefined && `${slot.api_key}` !== "") {
      slot.api_key = SECRET_MASK;
    }
    set({ verifying: modality, verifyError: { ...get().verifyError, [modality]: undefined } });
    try {
      const result = await api.post<VerifyResult>(
        "/api/v1/providers/verify",
        useStored ? { modality } : { modality, config: slot },
      );
      if (!useStored && !result.ok && result.state === "unauthorized" && isMasked(slot.api_key)) {
        result.warnings = [
          ...(result.warnings ?? []),
          "Verified with your unsaved changes, which cannot include the stored key. Save first, or paste the key again.",
        ];
      }
      set({ verify: { ...get().verify, [modality]: result }, verifying: null });
    } catch (err) {
      set({
        verifying: null,
        verifyError: {
          ...get().verifyError,
          [modality]: isMissingRoute(err)
            ? "Verification is not available in this sidecar build."
            : errText(err, "verification failed"),
        },
      });
    }
  },

  runSetup: async (engineId) => {
    const track = (view: JobView) =>
      set({ setupJobs: { ...get().setupJobs, [engineId]: view } });
    track({ jobId: "", state: "queued", pct: null, detail: "starting…", error: null });
    try {
      const started = await api.post<{ job_id?: string } & SetupFlow>(
        `/api/v1/providers/setup/${encodeURIComponent(engineId)}`,
        {},
      );
      const jobId = started?.job_id;
      if (!jobId) {
        // Display-only step (installer / GUI app / piped shell script): the sidecar
        // hands back instructions instead of running anything (03 §6 policy).
        const jobs = { ...get().setupJobs };
        delete jobs[engineId];
        set({
          setupJobs: jobs,
          manualSetup: {
            ...get().manualSetup,
            [engineId]: { ...started, runnable: false, kind: started?.kind ?? "manual" },
          },
        });
        return;
      }
      track({ jobId, state: "queued", pct: null, detail: null, error: null });
      await api.pollJob(
        jobId,
        (job) =>
          track({
            jobId,
            state: job.state,
            pct: job.progress_pct,
            detail: job.detail,
            error: job.error?.detail ?? null,
          }),
        { intervalMs: 500 },
      );
      track({ jobId, state: "done", pct: 100, detail: "ready", error: null });
      await get().runDetect(true);
    } catch (err) {
      track({
        jobId: get().setupJobs[engineId]?.jobId ?? "",
        state: "error",
        pct: null,
        detail: null,
        error: isMissingRoute(err)
          ? "Guided setup is not available in this sidecar build."
          : errText(err, "setup failed"),
      });
    }
  },

  /**
   * The OpenRouter catalogue for one job (03 §9).
   *
   * Listing needs no key, so this answers before the learner has pasted anything — which is
   * what lets the picker show what is on offer instead of an empty box and a promise. The
   * sidecar caches for six hours; this caches again per session so that flipping between the
   * three sections does not re-ask.
   *
   * A failure is an ordinary state, not a dead end. The route answers with `models: []`, an
   * `error` sentence and *still* the recommended id, so the section keeps a model it can use.
   */
  loadCatalogue: async (modality, refresh = false) => {
    const current = get().catalogue[modality];
    if (current?.loading) return;
    if (current?.loadedAt && !refresh) return;
    const put = (next: CatalogueState) =>
      set({ catalogue: { ...get().catalogue, [modality]: next } });
    put({
      models: current?.models ?? [],
      recommended: current?.recommended ?? null,
      loading: true,
      error: null,
      loadedAt: current?.loadedAt ?? null,
    });
    try {
      const res = await api.get<{
        models?: CatalogueModel[];
        recommended?: string | null;
        error?: string;
      }>(
        `/api/v1/providers/openrouter/models?modality=${modality}${refresh ? "&refresh=true" : ""}`,
      );
      put({
        models: res.models ?? [],
        recommended: res.recommended ?? null,
        loading: false,
        error: res.error ?? null,
        loadedAt: Date.now(),
      });
    } catch (err) {
      put({
        models: [],
        // Whatever a previous fetch knew is better than nothing: the recommendation is the
        // one thing this section cannot work without.
        recommended: current?.recommended ?? null,
        loading: false,
        error: isMissingRoute(err)
          ? "This sidecar build cannot list OpenRouter models yet. Update BandReady to choose from the full list."
          : errText(err, "The model list could not be fetched. Try again in a moment."),
        loadedAt: Date.now(),
      });
    }
  },

  loadModels: async () => {
    try {
      // One call gives both the artifact manifest with on-disk state and the
      // download jobs (13 §7.3).
      const res = await api.get<{
        items?: Job<{ artifact_id?: string }>[];
        artifacts?: ArtifactState[];
      }>("/api/v1/models/downloads");
      const downloads: Record<string, JobView> = {};
      for (const job of res.items ?? []) {
        const artifactId = job.result?.artifact_id;
        if (!artifactId) continue;
        const existing = downloads[artifactId];
        if (existing && existing.state !== "queued" && existing.state !== "running") continue;
        downloads[artifactId] = {
          jobId: job.id,
          state: job.state,
          pct: job.progress_pct,
          detail: job.detail,
          error: job.error?.detail ?? null,
        };
      }
      // Locally tracked live polls win — they are fresher than a list snapshot.
      const live = get().downloads;
      for (const [artifactId, view] of Object.entries(live)) {
        if (view.state === "queued" || view.state === "running") downloads[artifactId] = view;
      }
      set({ artifacts: res.artifacts ?? [], downloads, modelsError: null });
    } catch (err) {
      set({
        artifacts: [],
        modelsError: isMissingRoute(err)
          ? "The model manager is not available in this sidecar build."
          : errText(err, "could not read the model list"),
      });
    }
  },

  startDownload: async (artifactId) => {
    const track = (view: JobView) =>
      set({ downloads: { ...get().downloads, [artifactId]: view } });
    track({ jobId: "", state: "queued", pct: null, detail: "queued…", error: null });
    try {
      const started = await api.post<{ job_id?: string; state?: string; path?: string }>(
        "/api/v1/models/download",
        { artifact_id: artifactId },
      );
      const jobId = started?.job_id;
      if (!jobId) {
        // Already on disk — the route answers 200 with the installed state.
        track({ jobId: "", state: "done", pct: 100, detail: "already installed", error: null });
        await get().loadModels();
        return;
      }
      track({ jobId, state: "running", pct: null, detail: null, error: null });
      await api.pollJob(
        jobId,
        (job) =>
          track({
            jobId,
            state: job.state,
            pct: job.progress_pct,
            detail: job.detail,
            error: job.error?.detail ?? null,
          }),
        { intervalMs: 500 },
      );
      track({ jobId, state: "done", pct: 100, detail: "installed", error: null });
      await get().loadModels();
    } catch (err) {
      const current = get().downloads[artifactId];
      track({
        jobId: current?.jobId ?? "",
        state: err instanceof ApiError && err.code === "cancelled" ? "cancelled" : "error",
        pct: current?.pct ?? null,
        detail: current?.detail ?? null,
        error: isMissingRoute(err)
          ? "Model downloads are not available in this sidecar build."
          : errText(err, "download failed"),
      });
    }
  },

  cancelDownload: async (artifactId) => {
    const view = get().downloads[artifactId];
    if (!view?.jobId) return;
    try {
      await api.cancelJob(view.jobId);
    } catch (err) {
      set({ modelsError: errText(err, "could not cancel the download") });
      return;
    }
    set({
      downloads: {
        ...get().downloads,
        [artifactId]: { ...view, state: "cancelled", error: null, detail: "cancelled" },
      },
    });
  },

  presetsFor: (modality) => {
    const applesilicon = get().detectReport?.platform?.apple_silicon;
    return get().presets.filter((preset) => {
      if (!preset.modalities?.includes(modality)) return false;
      // `hidden` presets are the mock adapters (03 §2.3 / 14 §7.1). The sidecar
      // already gates them: `GET /providers/presets` only lists them when it was
      // started with BANDREADY_ENABLE_MOCK=1. Filtering them a second time here
      // made the documented test seam unselectable and, once one was configured,
      // rendered it as "<id> (not in this build)" — which was simply untrue.
      // A shipped build never receives them, so nothing leaks into the product.
      const macOnly =
        Array.isArray(preset.platforms) &&
        preset.platforms.length > 0 &&
        preset.platforms.every((p) => p.startsWith("darwin-arm"));
      if (macOnly && applesilicon === false) return false;
      return true;
    });
  },

  presetById: (id) => (id ? get().presets.find((p) => p.id === id) : undefined),
}));

function stripKey(slot: SlotDraft): SlotDraft {
  const out = { ...slot };
  delete out.api_key;
  return out;
}
