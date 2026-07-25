/// <reference types="vite/client" />

/** Platform string as reported by Electron's `process.platform`. */
export type BandReadyPlatform = "darwin" | "win32" | "linux";

export type WindowControlAction = "minimize" | "maximize-toggle" | "close";

/** Sidecar contract handed to the renderer over the preload bridge (01 §5). */
export interface SidecarInfo {
  base_url: string;
  token: string;
}

/**
 * contextBridge surface exposed by `app/electron/preload.ts` (owned by the
 * Electron agent). Every member is optional at runtime — in a plain browser dev
 * server `window.bandready` is undefined and the app falls back to Vite env vars.
 */
export interface BandReadyBridge {
  platform: BandReadyPlatform;
  appVersion?: string;
  getSidecarInfo(): Promise<SidecarInfo>;
  windowControl?(action: WindowControlAction): void;
  openExternal?(url: string): void;
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
