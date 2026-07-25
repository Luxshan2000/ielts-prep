/**
 * ipcMain handlers backing the four preload bridge methods (01 §4.3 / §5).
 * Nothing else is reachable from the renderer.
 */
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { getSidecarInfo, type SidecarInfo } from './sidecar';

export type WindowOp = 'minimize' | 'maximize' | 'close';

const WINDOW_OPS: readonly WindowOp[] = ['minimize', 'maximize', 'close'];

function isSafeExternalUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 2048) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

let registered = false;

export function registerIpcHandlers(): void {
  if (registered) return;
  registered = true;

  ipcMain.handle('sidecar:info', (): SidecarInfo => getSidecarInfo());

  ipcMain.handle('shell:openExternal', async (_event, url: unknown): Promise<boolean> => {
    if (!isSafeExternalUrl(url)) {
      console.warn('[ipc] refused openExternal for non-https url');
      return false;
    }
    await shell.openExternal(url);
    return true;
  });

  // Reveal-in-file-manager for the About tab's data dir / log file. `showItemInFolder`
  // only selects the item in the OS file manager — it never executes it — but we still
  // require a plain absolute path so a renderer bug cannot hand it a URL.
  ipcMain.handle('shell:showItemInFolder', (_event, target: unknown): boolean => {
    if (typeof target !== 'string' || target.length === 0 || target.length > 4096) return false;
    if (!isAbsolute(target) || target.includes('\0')) {
      console.warn('[ipc] refused showItemInFolder for a non-absolute path');
      return false;
    }
    if (!existsSync(target)) return false;
    shell.showItemInFolder(target);
    return true;
  });

  ipcMain.handle('window:control', (event, op: unknown): boolean => {
    if (typeof op !== 'string' || !WINDOW_OPS.includes(op as WindowOp)) return false;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    switch (op as WindowOp) {
      case 'minimize':
        win.minimize();
        return false;
      case 'maximize':
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        return win.isMaximized();
      case 'close':
        win.close();
        return false;
      default:
        return false;
    }
  });

  ipcMain.handle('app:version', (): string => app.getVersion());
}
