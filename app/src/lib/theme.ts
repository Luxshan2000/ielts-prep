export type Theme = "light" | "dark";

const STORAGE_KEY = "br-theme";
const DEFAULT_THEME: Theme = "dark";

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/** The theme currently persisted (falls back to the dark default). */
export function getStoredTheme(): Theme {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/**
 * Applies the persisted theme synchronously. Called from main.tsx *before*
 * `createRoot().render()` so the first paint is already themed — no flash.
 */
export function bootstrapTheme(): Theme {
  const theme = getStoredTheme();
  applyTheme(theme);
  return theme;
}

/** Persist + apply a theme. Safe to call from a store action. */
export function setTheme(theme: Theme): Theme {
  applyTheme(theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode / storage disabled — the in-memory class still applied */
  }
  return theme;
}

/** Flip between light and dark, returning the new theme. */
export function toggleTheme(): Theme {
  return setTheme(getStoredTheme() === "dark" ? "light" : "dark");
}
