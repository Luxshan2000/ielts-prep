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

  load: () => Promise<void>;
  /** Deep-merge partial update (18 §1 PATCH semantics). Returns success. */
  save: (patch: SettingsDoc) => Promise<boolean>;
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
