/**
 * Sidecar lifecycle — spawn, health-poll, crash-restart, graceful shutdown.
 *
 * Canonical spec: docs/plan/01-architecture.md §4 (spawn / health / restart /
 * shutdown) and §9 (process/port/env contract); docs/plan/13-packaging-distribution.md
 * §3.4 (packaged interpreter resolution).
 *
 * Contract handed to the sidecar EXCLUSIVELY through the environment — never argv,
 * because argv is world-readable via `ps`.
 */
import { app, dialog, shell } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

export type SidecarStatus = 'stopped' | 'starting' | 'ready' | 'restarting' | 'fatal';

export interface SidecarInfo {
  /** e.g. "http://127.0.0.1:53411" — no trailing slash, no /api/v1 suffix. */
  baseUrl: string;
  /** Per-launch bearer token. Rotates on every (re)start. */
  token: string;
  status: SidecarStatus;
}

/** Emits `changed` with a {@link SidecarInfo} whenever baseUrl/token/status move. */
export const sidecarEvents = new EventEmitter();

// ---------------------------------------------------------------------------
// Tunables (01 §4.2 / §4.4, overridden by the A4 task brief: 200 ms / 60 s)
// ---------------------------------------------------------------------------
const HEALTH_POLL_INTERVAL_MS = 200;
const HEALTH_TIMEOUT_MS = 60_000;
const BACKOFF_MS = [500, 1_000, 2_000, 4_000, 8_000] as const;
const MAX_CONSECUTIVE_FAILURES = 5;
const HEALTHY_RESET_MS = 60_000;
const SHUTDOWN_GRACE_MS = 5_000;
const LOG_MAX_BYTES = 5 * 1024 * 1024;
const LOG_MAX_FILES = 5;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------
let child: ChildProcess | null = null;
let currentPort = 0;
let currentToken = '';
let status: SidecarStatus = 'stopped';
let quitting = false;
let consecutiveFailures = 0;
let healthyResetTimer: NodeJS.Timeout | null = null;
let restartTimer: NodeJS.Timeout | null = null;
let logStream: fs.WriteStream | null = null;
let logPath = '';
/** Set when an external dev sidecar is attached instead of a spawned child. */
let attachedExternal = false;

const isWindows = process.platform === 'win32';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function logsDir(): string {
  return path.join(app.getPath('userData'), 'logs');
}

export function sidecarLogPath(): string {
  return logPath || path.join(logsDir(), 'sidecar.log');
}

function rotateIfNeeded(file: string): void {
  try {
    const st = fs.statSync(file);
    if (st.size < LOG_MAX_BYTES) return;
  } catch {
    return; // no file yet
  }
  for (let i = LOG_MAX_FILES - 1; i >= 1; i -= 1) {
    const from = i === 1 ? file : `${file}.${i - 1}`;
    const to = `${file}.${i}`;
    try {
      if (fs.existsSync(from)) fs.renameSync(from, to);
    } catch {
      /* best effort */
    }
  }
}

function openLog(): void {
  if (logStream) return;
  const dir = logsDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logPath = path.join(dir, 'sidecar.log');
    rotateIfNeeded(logPath);
    logStream = fs.createWriteStream(logPath, { flags: 'a' });
    logStream.on('error', (err) => {
      console.error('[sidecar] log stream error:', err);
      logStream = null;
    });
  } catch (err) {
    console.error('[sidecar] cannot open log file:', err);
    logStream = null;
  }
}

/** Writes to <userData>/logs/sidecar.log AND the main-process console. */
function log(line: string): void {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(`[sidecar] ${line}`);
  openLog();
  logStream?.write(`${stamped}\n`);
}

function pipeChildOutput(proc: ChildProcess): void {
  openLog();
  const forward = (stream: NodeJS.ReadableStream | null, tag: 'out' | 'err') => {
    if (!stream) return;
    stream.setEncoding('utf8');
    let buffer = '';
    stream.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line) continue;
        // eslint-disable-next-line no-console
        console.log(`[sidecar:${tag}] ${line}`);
        logStream?.write(`${line}\n`);
      }
    });
  };
  forward(proc.stdout, 'out');
  forward(proc.stderr, 'err');
}

// ---------------------------------------------------------------------------
// Interpreter resolution
// ---------------------------------------------------------------------------

function repoRoot(): string {
  // __dirname === <repo>/app/dist-electron in dev.
  return path.resolve(__dirname, '..', '..');
}

function venvPython(venvRoot: string): string {
  return isWindows
    ? path.join(venvRoot, 'Scripts', 'python.exe')
    : path.join(venvRoot, 'bin', 'python');
}

interface SidecarCommand {
  bin: string;
  args: string[];
  cwd: string;
  extraEnv: Record<string, string>;
}

/**
 * Dev      → <repo>/sidecar/.venv/bin/python -m bandready.cli serve
 * Packaged → <resources>/sidecar-venv/bin/python -m bandready.cli serve, falling back
 *            to the python-build-standalone base interpreter + PYTHONPATH when the
 *            venv launcher is not usable (13 §3.4 — pyvenv.cfg is not rewritten).
 */
export function resolveSidecarCommand(): SidecarCommand {
  const override = process.env.BANDREADY_SIDECAR_PYTHON;
  if (override) {
    return { bin: override, args: ['-m', 'bandready.cli', 'serve'], cwd: process.cwd(), extraEnv: {} };
  }

  if (!app.isPackaged) {
    const root = repoRoot();
    return {
      bin: venvPython(path.join(root, 'sidecar', '.venv')),
      args: ['-m', 'bandready.cli', 'serve'],
      cwd: path.join(root, 'sidecar'),
      extraEnv: { PYTHONUNBUFFERED: '1' },
    };
  }

  const resources = process.resourcesPath;
  const venvRoot = path.join(resources, 'sidecar-venv');
  const venvBin = venvPython(venvRoot);
  const extraEnv: Record<string, string> = {
    PYTHONUNBUFFERED: '1',
    PYTHONNOUSERSITE: '1',
    PYTHONDONTWRITEBYTECODE: '1',
  };

  if (fs.existsSync(venvBin)) {
    return { bin: venvBin, args: ['-s', '-m', 'bandready.cli', 'serve'], cwd: resources, extraEnv };
  }

  // Fallback: bundled base interpreter + PYTHONPATH into the venv's site-packages.
  const baseBin = isWindows
    ? path.join(resources, 'python', 'python.exe')
    : path.join(resources, 'python', 'bin', 'python3.11');
  const sitePackages = isWindows
    ? path.join(venvRoot, 'Lib', 'site-packages')
    : path.join(venvRoot, 'lib', 'python3.11', 'site-packages');
  return {
    bin: baseBin,
    args: ['-s', '-m', 'bandready.cli', 'serve'],
    cwd: resources,
    extraEnv: { ...extraEnv, PYTHONPATH: sitePackages },
  };
}

/**
 * Provider keys the settings document may reference as `${VAR}` instead of storing.
 *
 * That option exists so a key never has to be written to disk, but it only works if
 * the variable actually reaches the sidecar — and `minimalEnv` deliberately drops the
 * inherited environment. Forwarding names that end in `_API_KEY` (the shape of every
 * `key_env_hint` in the provider presets) keeps the feature usable without handing the
 * child the whole environment.
 *
 * Note this only helps when the app inherits the variable in the first place: launched
 * from Finder it will not, so a `${VAR}` reference is really for `npm run dev` and for
 * launching the app from a shell.
 */
const API_KEY_ENV = /^[A-Z0-9_]+_API_KEY$/;

/** PATH/HOME/TMP plus referenced provider keys — nothing else is inherited (01 §4.1). */
function minimalEnv(): Record<string, string> {
  const keep = [
    'PATH',
    'HOME',
    'USERPROFILE',
    'TMPDIR',
    'TEMP',
    'TMP',
    'LANG',
    'LC_ALL',
    'SystemRoot',
    'SYSTEMROOT',
    'COMSPEC',
    'PATHEXT',
    'WINDIR',
    'NUMBER_OF_PROCESSORS',
    'PROCESSOR_ARCHITECTURE',
  ];
  const out: Record<string, string> = {};
  for (const key of keep) {
    const value = process.env[key];
    if (value !== undefined) out[key] = value;
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && API_KEY_ENV.test(key)) out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Port picking + health
// ---------------------------------------------------------------------------

async function pickPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      const { port } = addr;
      srv.close(() => resolve(port));
    });
  });
}

function probeHealth(port: number, timeoutMs = 1_000): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/health', method: 'GET', timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function waitForHealth(port: number, proc: ChildProcess | null): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (proc && proc.exitCode !== null) {
      throw new Error(`sidecar exited during startup (code ${proc.exitCode})`);
    }
    if (await probeHealth(port)) return;
    await sleep(HEALTH_POLL_INTERVAL_MS);
  }
  throw new Error(`sidecar did not become healthy within ${HEALTH_TIMEOUT_MS / 1000}s`);
}

// ---------------------------------------------------------------------------
// Public accessors
// ---------------------------------------------------------------------------

export function getSidecarInfo(): SidecarInfo {
  return {
    baseUrl: currentPort ? `http://127.0.0.1:${currentPort}` : '',
    token: currentToken,
    status,
  };
}

function setStatus(next: SidecarStatus): void {
  if (status === next) return;
  status = next;
  sidecarEvents.emit('changed', getSidecarInfo());
}

function emitChanged(): void {
  sidecarEvents.emit('changed', getSidecarInfo());
}

// ---------------------------------------------------------------------------
// Start / restart
// ---------------------------------------------------------------------------

async function launchOnce(): Promise<void> {
  const port = await pickPort();
  const token = randomUUID();
  const cmd = resolveSidecarCommand();

  if (!fs.existsSync(cmd.bin)) {
    throw new Error(
      `python interpreter not found at ${cmd.bin}. ` +
        (app.isPackaged
          ? 'The bundled sidecar venv is missing from this build.'
          : 'Run `uv sync --extra dev` in sidecar/ first.'),
    );
  }

  const env: Record<string, string> = {
    ...minimalEnv(),
    ...cmd.extraEnv,
    BANDREADY_HOST: '127.0.0.1',
    BANDREADY_PORT: String(port),
    BANDREADY_AUTH_TOKEN: token,
    BANDREADY_DATA_DIR: app.getPath('userData'),
    BANDREADY_PARENT_PID: String(process.pid),
    BANDREADY_LOG_LEVEL: app.isPackaged ? 'info' : 'debug',
  };
  // electron-builder stages the shipped content pack into Resources/content. Without
  // this the sidecar only looks beside the source tree, so a packaged install boots
  // with an empty bank — no reading tests, no prompts, no vocabulary.
  if (app.isPackaged) {
    env.BANDREADY_RESOURCES_DIR = process.resourcesPath;
  }
  if (process.env.BANDREADY_ENABLE_MOCK) {
    env.BANDREADY_ENABLE_MOCK = process.env.BANDREADY_ENABLE_MOCK;
  }

  log(`spawning ${cmd.bin} ${cmd.args.join(' ')} (port ${port})`);
  const proc = spawn(cmd.bin, cmd.args, {
    cwd: cmd.cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child = proc;
  currentPort = port;
  currentToken = token;
  pipeChildOutput(proc);

  proc.on('error', (err) => log(`spawn error: ${err.message}`));
  proc.on('exit', (code, signal) => {
    if (proc !== child) return; // superseded
    log(`exited (code=${code} signal=${signal})`);
    child = null;
    if (quitting) {
      setStatus('stopped');
      return;
    }
    setStatus('restarting');
    scheduleRestart();
  });

  setStatus('starting');
  emitChanged();

  await waitForHealth(port, proc);

  log(`healthy on http://127.0.0.1:${port}`);
  setStatus('ready');
  emitChanged();

  if (healthyResetTimer) clearTimeout(healthyResetTimer);
  healthyResetTimer = setTimeout(() => {
    consecutiveFailures = 0;
  }, HEALTHY_RESET_MS);
}

function killChild(): void {
  const proc = child;
  child = null;
  if (!proc || proc.exitCode !== null) return;
  try {
    if (isWindows && proc.pid) {
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true });
    } else {
      proc.kill('SIGKILL');
    }
  } catch {
    /* best effort */
  }
}

function scheduleRestart(): void {
  if (quitting || restartTimer) return;
  const delay = BACKOFF_MS[Math.min(consecutiveFailures, BACKOFF_MS.length - 1)];
  log(`restarting in ${delay}ms (consecutive failures: ${consecutiveFailures})`);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    void attempt();
  }, delay);
}

function fatal(reason: string): void {
  setStatus('fatal');
  emitChanged();
  log(`FATAL: ${reason}`);
  const file = sidecarLogPath();
  void dialog
    .showMessageBox({
      type: 'error',
      title: 'BandReady could not start',
      message: 'The BandReady background service failed to start.',
      detail: `${reason}\n\nLog file:\n${file}`,
      buttons: ['Show Log', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    })
    .then((res) => {
      if (res.response === 0) shell.showItemInFolder(file);
      app.quit();
    })
    .catch(() => app.quit());
}

async function attempt(): Promise<void> {
  if (quitting) return;
  try {
    await launchOnce();
    consecutiveFailures = 0;
  } catch (err) {
    killChild();
    consecutiveFailures += 1;
    const message = err instanceof Error ? err.message : String(err);
    log(`start attempt failed: ${message}`);
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      fatal(message);
      return;
    }
    setStatus('restarting');
    scheduleRestart();
    throw err;
  }
}

/**
 * Starts the sidecar and resolves once it answers `GET /health`.
 * Rejects if the first attempt fails; retries continue in the background.
 *
 * In dev, `BANDREADY_DEV_SIDECAR=http://127.0.0.1:8710` attaches to an
 * already-running sidecar instead of spawning one (01 §10.3).
 */
export async function startSidecar(): Promise<SidecarInfo> {
  quitting = false;

  const external = process.env.BANDREADY_DEV_SIDECAR;
  if (external && !app.isPackaged) {
    const url = new URL(external);
    attachedExternal = true;
    currentPort = Number(url.port || 80);
    currentToken = process.env.BANDREADY_DEV_TOKEN ?? 'dev-token';
    log(`attaching to external dev sidecar at ${external}`);
    await waitForHealth(currentPort, null);
    setStatus('ready');
    emitChanged();
    return getSidecarInfo();
  }

  await attempt();
  return getSidecarInfo();
}

// ---------------------------------------------------------------------------
// Shutdown (01 §4.5)
// ---------------------------------------------------------------------------

function requestShutdown(port: number, token: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/internal/shutdown',
        method: 'POST',
        timeout: timeoutMs,
        headers: { Authorization: `Bearer ${token}`, 'Content-Length': '0' },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve());
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve();
    });
    req.on('error', () => resolve());
    req.end();
  });
}

function waitForExit(proc: ChildProcess, ms: number): Promise<boolean> {
  if (proc.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/** Graceful stop: /internal/shutdown → SIGTERM → SIGKILL after 5 s. */
export async function stopSidecar(): Promise<void> {
  quitting = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (healthyResetTimer) {
    clearTimeout(healthyResetTimer);
    healthyResetTimer = null;
  }

  const proc = child;
  if (attachedExternal || !proc) {
    setStatus('stopped');
    return;
  }

  log('graceful shutdown requested');
  await requestShutdown(currentPort, currentToken, 1_500);
  if (await waitForExit(proc, 1_500)) {
    child = null;
    setStatus('stopped');
    return;
  }

  log('sending SIGTERM');
  try {
    proc.kill('SIGTERM');
  } catch {
    /* already gone */
  }
  if (await waitForExit(proc, SHUTDOWN_GRACE_MS)) {
    child = null;
    setStatus('stopped');
    return;
  }

  log('sending SIGKILL');
  killChild();
  setStatus('stopped');
}
