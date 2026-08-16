import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { getStoredTheme, setTheme as applyTheme, type Theme } from "@/lib/theme";

/**
 * Global store #2 (01 §7.1): the settings document cache + theme.
 * Secrets arrive masked ("•••• (stored)"); never echo them back in a PATCH.
 */

export interface ProviderConfig {
  preset?: string;
  endpoint?: string;
  model?: string;
  api_key?: string;
  [key: string]: unknown;
}

export interface SettingsDoc {
  first_run?: boolean;
  active_profile_id?: string;
  providers?: {
    llm?: ProviderConfig;
    stt?: ProviderConfig;
    tts?: ProviderConfig;
    [key: string]: ProviderConfig | undefined;
  };
  ui?: {
    /** Reading/writing body size, 14 | 15 | 17 (12 §2). */
    reading_font_px?: number;
    sidebar_collapsed?: boolean;
    [key: string]: unknown;
  };
  media?: { cache_budget_mb?: number; [key: string]: unknown };
  [key: string]: unknown;
}

interface SettingsState {
  doc: SettingsDoc | null;
  loading: boolean;
  saving: boolean;
  offline: boolean;
  error: string | null;
  theme: Theme;

  /**
   * Bumped every time the *provider* selection changes (see `bumpGeneration`).
   *
   * Anything the app has cached because a particular engine produced it — the listening
   * library's `audio_ready` flags, a loaded test detail, the coach's teaching documents,
   * a signed media ticket — was computed under the previous providers and is a claim
   * about them, not about the ones now selected. Readers compare the generation they
   * fetched under against this number instead of assuming their snapshot is still true.
   */
  generation: number;

  load: () => Promise<void>;
  /** Deep-merge partial update (18 §1 PATCH semantics). Returns success. */
  save: (patch: SettingsDoc) => Promise<boolean>;
  /**
   * Declare that generated artefacts may no longer match the selected providers.
   *
   * Called after a provider PATCH lands and after the generated-audio purge. It is
   * deliberately NOT called for theme, density or study preferences: those change
   * nothing about what an engine would produce, and dropping the library cache for
   * them would cost a round trip per toggle.
   */
  bumpGeneration: () => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  doc: null,
  loading: false,
  saving: false,
  offline: false,
  error: null,
  theme: typeof window === "undefined" ? "dark" : getStoredTheme(),
  generation: 0,

  bumpGeneration: () => set((s) => ({ generation: s.generation + 1 })),

  load: async () => {
    set({ loading: true, error: null });
    try {
      const doc = await api.get<SettingsDoc>("/api/v1/settings");
      set({ doc, loading: false, offline: false });
    } catch (err) {
      const offline = err instanceof ApiError && err.isOffline;
      set({
        loading: false,
        offline,
        error: err instanceof ApiError ? err.detail : "could not load settings",
      });
    }
  },

  save: async (patch) => {
    set({ saving: true, error: null });
    try {
      const doc = await api.patch<SettingsDoc>("/api/v1/settings", patch);
      set({ doc, saving: false, offline: false });
      return true;
    } catch (err) {
      const offline = err instanceof ApiError && err.isOffline;
      set({
        saving: false,
        offline,
        error: err instanceof ApiError ? err.detail : "could not save settings",
      });
      return false;
    }
  },

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },

  toggleTheme: () => {
    get().setTheme(get().theme === "dark" ? "light" : "dark");
  },
}));
