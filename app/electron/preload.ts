/**
 * Preload — the ENTIRE renderer→main surface (01 §5: "exactly the four methods").
 * Runs sandboxed + context-isolated; keep this file dependency-free so the bundler
 * never splits a shared chunk out of it.
 */
import { contextBridge, ipcRenderer } from 'electron';

export interface SidecarInfo {
  /** e.g. "http://127.0.0.1:53411" — empty string until the sidecar is up. */
  baseUrl: string;
  token: string;
  status: 'stopped' | 'starting' | 'ready' | 'restarting' | 'fatal';
}

export type WindowOp = 'minimize' | 'maximize' | 'close';

const bridge = {
  /** Always reads live state from main — safe to re-call after a sidecar restart. */
  getSidecarInfo: (): Promise<SidecarInfo> => ipcRenderer.invoke('sidecar:info'),
  /** https: URLs only; resolves false when main refuses. */
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('shell:openExternal', url),
  /** Custom window chrome (frameless Windows/Linux). Returns isMaximized after 'maximize'. */
  windowControl: (op: WindowOp): Promise<boolean> => ipcRenderer.invoke('window:control', op),
  /** The app's semver, e.g. "0.1.0". */
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
};

export type BandReadyBridge = typeof bridge;

contextBridge.exposeInMainWorld('bandready', bridge);
