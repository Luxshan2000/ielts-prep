/**
 * Electron main process — app lifecycle + window creation.
 * Spec: docs/plan/01-architecture.md §4 (lifecycle), §5 (security), §10 (dev mode).
 *
 * No splash screen (01 §4.2): the window is simply not shown until the sidecar is
 * healthy AND the renderer has painted.
 */
import {
  app,
  BrowserWindow,
  Menu,
  session,
  shell,
  type MenuItemConstructorOptions,
} from 'electron';
import path from 'node:path';
import { registerIpcHandlers } from './ipc';
import { getSidecarInfo, sidecarEvents, startSidecar, stopSidecar, type SidecarInfo } from './sidecar';
import { initAutoUpdater } from './update';

const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? '';
const isDev = !app.isPackaged;

// `app.getPath('userData')` derives from the package name, which would put a user's
// essays and recordings in a folder called "bandready-app". Name the app before any
// path is read so the data directory matches the product — and the documented path.
app.setName('BandReady');

let mainWindow: BrowserWindow | null = null;
let rendererReady = false;
let shuttingDown = false;

// ---------------------------------------------------------------------------
// Single instance — two sidecars on one data dir would fight over the SQLite WAL.
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  void bootstrap();
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function rendererOrigins(): string[] {
  const origins = ['file://'];
  if (devServerUrl) {
    try {
      origins.push(new URL(devServerUrl).origin);
    } catch {
      /* ignore malformed dev url */
    }
  }
  return origins;
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0b0f14',
    autoHideMenuBar: !isMac,
    title: 'BandReady',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 18 } : undefined,
    // Windows/Linux get custom in-app controls via window:control.
    frame: !isWindows,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => {
    rendererReady = true;
    maybeShow();
  });

  win.on('closed', () => {
    mainWindow = null;
    rendererReady = false;
  });

  // Deny every popup; https links leave through the OS browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL();
    if (url === current) return;
    if (devServerUrl && url.startsWith(devServerUrl)) return;
    event.preventDefault();
    if (url.startsWith('https://')) void shell.openExternal(url);
  });

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
    if (process.env.BANDREADY_OPEN_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  return win;
}

function maybeShow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!rendererReady) return;
  if (getSidecarInfo().status !== 'ready') return;
  mainWindow.show();
  mainWindow.focus();
}

// ---------------------------------------------------------------------------
// Session hardening (01 §5)
// ---------------------------------------------------------------------------

function hardenSession(): void {
  const allowed = rendererOrigins();
  const ses = session.defaultSession;

  // Only our own renderer may use the microphone; everything else is denied.
  ses.setPermissionRequestHandler((contents, permission, callback) => {
    const origin = new URL(contents.getURL() || 'about:blank').origin;
    const ours = allowed.some((o) => origin.startsWith(o)) || origin === 'null';
    callback(ours && (permission === 'media' || permission === 'clipboard-sanitized-write'));
  });
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    const ours = allowed.some((o) => requestingOrigin.startsWith(o)) || requestingOrigin === '';
    return ours && permission === 'media';
  });

  if (!isDev) {
    const csp = [
      "default-src 'self'",
      "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*",
      "media-src 'self' blob: http://127.0.0.1:*",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      // `blob:` is same-origin, never network: the speaking room's audio worklet
      // (Pipecat's WavMediaManager) is compiled into a blob URL at runtime, and
      // without this the microphone pipeline cannot start. Kept in step with the
      // meta CSP in app/index.html.
      "script-src 'self' blob:",
      "worker-src 'self' blob:",
      "child-src 'self' blob:",
      "font-src 'self' data:",
    ].join('; ');
    ses.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp],
        },
      });
    });
  }
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  template.push({
    label: 'File',
    submenu: isMac ? [{ role: 'close' }] : [{ role: 'quit' }],
  });

  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac
        ? ([{ role: 'pasteAndMatchStyle' }, { role: 'selectAll' }] as MenuItemConstructorOptions[])
        : ([{ role: 'selectAll' }] as MenuItemConstructorOptions[])),
    ],
  });

  template.push({
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  });

  template.push({
    label: 'Window',
    submenu: isMac
      ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
      : [{ role: 'minimize' }, { role: 'close' }],
  });

  template.push({
    role: 'help',
    submenu: [
      {
        label: 'BandReady on GitHub',
        click: () => void shell.openExternal('https://github.com/bandready/bandready'),
      },
    ],
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function bootstrap(): Promise<void> {
  await app.whenReady();

  hardenSession();
  buildMenu();
  registerIpcHandlers();

  sidecarEvents.on('changed', (info: SidecarInfo) => {
    if (info.status === 'ready') maybeShow();
  });

  // Create the window immediately so the renderer can boot in parallel; it stays
  // hidden until the sidecar answers /health.
  mainWindow = createWindow();

  try {
    await startSidecar();
  } catch (err) {
    console.error('[main] sidecar start failed:', err instanceof Error ? err.message : String(err));
    // sidecar.ts keeps retrying with backoff and shows a fatal dialog after 5 tries.
  }
  maybeShow();

  initAutoUpdater(
    () => mainWindow,
    async () => {
      shuttingDown = true;
      await stopSidecar();
    },
  );

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      maybeShow();
    } else {
      mainWindow?.show();
    }
  });
}

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

app.on('before-quit', (event) => {
  if (shuttingDown) return;
  event.preventDefault();
  shuttingDown = true;
  void stopSidecar().finally(() => app.exit(0));
});
