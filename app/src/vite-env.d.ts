/// <reference types="vite/client" />

/** Platform string as reported by Electron's `process.platform`. */
export type BandReadyPlatform = "darwin" | "win32" | "linux";

export type WindowControlAction = "minimize" | "maximize-toggle" | "close";

/**
 * Sidecar contract handed to the renderer over the preload bridge (01 §5).
 *
 * `app/electron/preload.ts` returns camelCase `baseUrl`. `base_url` is kept as an
 * optional alias so a bridge that speaks the wire format still type-checks —
 * `lib/api.ts` reads whichever is present.
 */
export interface SidecarInfo {
  baseUrl?: string;
  base_url?: string;
  token: string;
  status?: "stopped" | "starting" | "ready" | "restarting" | "fatal";
}

/**
 * contextBridge surface exposed by `app/electron/preload.ts` (owned by the
 * Electron agent). Every member is optional at runtime — in a plain browser dev
 * server `window.bandready` is undefined and the app falls back to Vite env vars.
 */
export interface BandReadyBridge {
  platform?: BandReadyPlatform;
  appVersion?: string;
  getSidecarInfo(): Promise<SidecarInfo>;
  /** Electron's `app.getVersion()` — the shipped app semver. */
  getVersion?(): Promise<string>;
  windowControl?(action: WindowControlAction): void;
  openExternal?(url: string): void;
  /** Reveals a path in Finder/Explorer. Resolves false when main refuses. */
  showItemInFolder?(path: string): Promise<boolean>;
  onSidecarStatus?(cb: (status: { state: string; detail?: string }) => void): () => void;
}

declare global {
  interface ImportMetaEnv {
    readonly VITE_SIDECAR_URL?: string;
    readonly VITE_SIDECAR_TOKEN?: string;
  }

  interface Window {
    bandready?: BandReadyBridge;
  }
}
