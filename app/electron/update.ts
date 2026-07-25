/**
 * Auto-update — electron-updater against GitHub Releases (13 §9).
 *
 * Rules: packaged builds only, `latest` channel only, notify-only. We NEVER
 * auto-restart: a live speaking session must not be killed. The user clicks
 * "Restart now", and only then do we run the graceful sidecar shutdown ladder
 * before `quitAndInstall()`.
 */
import { app, dialog, type BrowserWindow } from 'electron';
import type { AppUpdater } from 'electron-updater';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 h

let timer: NodeJS.Timeout | null = null;
let promptOpen = false;
let autoUpdater: AppUpdater;

/**
 * Loaded lazily so a build that did not ship `electron-updater` (it currently sits
 * in app/package.json devDependencies) degrades to "no auto-update" instead of
 * crashing the main process at require time.
 */
function loadUpdater(): AppUpdater | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('electron-updater') as typeof import('electron-updater');
    return mod.autoUpdater;
  } catch (err) {
    console.warn(
      '[update] electron-updater unavailable — auto-update disabled:',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

export function initAutoUpdater(
  getWindow: () => BrowserWindow | null,
  onBeforeInstall: () => Promise<void>,
): void {
  if (!app.isPackaged) {
    console.log('[update] disabled in dev');
    return;
  }

  const updater = loadUpdater();
  if (!updater) return;
  autoUpdater = updater;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = process.env.BANDREADY_ALLOW_PRERELEASE === '1';
  autoUpdater.logger = null;

  autoUpdater.on('error', (err) => {
    console.warn('[update] error:', err instanceof Error ? err.message : String(err));
  });
  autoUpdater.on('update-available', (info) => {
    console.log(`[update] available: ${info.version}`);
  });
  autoUpdater.on('update-not-available', () => {
    console.log('[update] up to date');
  });
  autoUpdater.on('download-progress', (p) => {
    console.log(`[update] downloading ${Math.round(p.percent)}%`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[update] downloaded: ${info.version}`);
    void promptRestart(getWindow(), info.version, onBeforeInstall);
  });

  void check();
  timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
  app.on('before-quit', () => {
    if (timer) clearInterval(timer);
    timer = null;
  });
}

async function check(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.warn('[update] check failed:', err instanceof Error ? err.message : String(err));
  }
}

async function promptRestart(
  win: BrowserWindow | null,
  version: string,
  onBeforeInstall: () => Promise<void>,
): Promise<void> {
  if (promptOpen) return;
  promptOpen = true;
  const opts = {
    type: 'info' as const,
    title: 'Update ready',
    message: `BandReady ${version} is ready to install.`,
    detail: 'The update will be applied when you restart. Any practice in progress will end.',
    buttons: ['Restart now', 'Later'],
    defaultId: 1,
    cancelId: 1,
  };
  try {
    const res = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    if (res.response === 0) {
      await onBeforeInstall();
      autoUpdater.quitAndInstall(false, true);
    }
  } finally {
    promptOpen = false;
  }
}
