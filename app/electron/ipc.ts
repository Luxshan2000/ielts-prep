/**
 * ipcMain handlers backing the four preload bridge methods (01 §4.3 / §5).
 * Nothing else is reachable from the renderer.
 */
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
