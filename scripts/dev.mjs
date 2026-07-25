#!/usr/bin/env node
/**
 * BandReady dev orchestrator — docs/plan/01-architecture.md §10.
 *
 *   pnpm dev                  Vite (5273) + Electron. Electron spawns the sidecar
 *                             itself through app/electron/sidecar.ts (the real
 *                             lifecycle path: random port, random token).
 *   pnpm dev --browser        Sidecar on a FIXED port/token + Vite, no Electron.
 *                             The SPA runs in a plain browser and the E2E suite
 *                             drives it. Mock providers are enabled.
 *
 * Flags
 *   --browser                 browser mode (see above)
 *   --port <n>                Vite port                    (default 5273)
 *   --sidecar-port <n>        sidecar port in browser mode (default 8710)
 *   --token <s>               sidecar token in browser mode(default "dev-token")
 *   --data-dir <path>         BANDREADY_DATA_DIR           (default <repo>/.dev-data)
 *   --no-mock                 do not set BANDREADY_ENABLE_MOCK=1
 *   --dev-sidecar             (default mode) also run the fixed-port sidecar and
 *                             point Electron at it instead of spawning its own
 *   --no-electron-build       skip the main/preload bundle build
 *
 * Ctrl-C tears every child down.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const appDir = path.join(repoRoot, 'app');
const sidecarDir = path.join(repoRoot, 'sidecar');
const isWindows = process.platform === 'win32';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    browser: false,
    port: Number(process.env.VITE_DEV_PORT ?? 5273),
    sidecarPort: Number(process.env.BANDREADY_DEV_PORT ?? 8710),
    token: process.env.BANDREADY_DEV_TOKEN ?? 'dev-token',
    dataDir: process.env.BANDREADY_DATA_DIR ?? path.join(repoRoot, '.dev-data'),
    mock: true,
    devSidecar: false,
    electronBuild: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const valueOf = (inline) => (inline !== undefined ? inline : argv[++i]);
    const [flag, inline] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
    switch (flag) {
      case '--browser':
        opts.browser = true;
        break;
      case '--port':
        opts.port = Number(valueOf(inline));
        break;
      case '--sidecar-port':
        opts.sidecarPort = Number(valueOf(inline));
        break;
      case '--token':
        opts.token = String(valueOf(inline));
        break;
      case '--data-dir':
        opts.dataDir = path.resolve(repoRoot, String(valueOf(inline)));
        break;
      case '--no-mock':
        opts.mock = false;
        break;
      case '--dev-sidecar':
        opts.devSidecar = true;
        break;
      case '--no-electron-build':
        opts.electronBuild = false;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.warn(`[dev] ignoring unknown flag: ${arg}`);
    }
  }
  return opts;
}

function printHelp() {
  console.log(
    [
      'Usage: node scripts/dev.mjs [--browser] [--port 5273] [--sidecar-port 8710]',
      '                           [--token dev-token] [--data-dir ./.dev-data]',
      '                           [--no-mock] [--dev-sidecar] [--no-electron-build]',
    ].join('\n'),
  );
}

// ---------------------------------------------------------------------------
// Child process bookkeeping
// ---------------------------------------------------------------------------

const children = [];
let shuttingDown = false;

function track(name, child) {
  children.push({ name, child });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[dev] ${name} exited (code=${code} signal=${signal ?? 'none'}) — shutting down`);
    shutdown(code ?? 1);
  });
  return child;
}

function killTree(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  try {
    if (isWindows) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else if (child.pid) {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) killTree(child);
  setTimeout(() => {
    for (const { child } of children) {
      if (child.exitCode === null && !isWindows && child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* ignore */
        }
      }
    }
    process.exit(code);
  }, 800).unref();
}

process.on('SIGINT', () => {
  console.log('\n[dev] Ctrl-C — stopping…');
  shutdown(0);
});
process.on('SIGTERM', () => shutdown(0));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function probe(url, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const target = new URL(url);
    const req = http.request(
      {
        host: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method: 'GET',
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        resolve(typeof res.statusCode === 'number' && res.statusCode < 500);
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

async function waitFor(label, url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (shuttingDown) throw new Error('shutting down');
    if (await probe(url)) return true;
    await sleep(200);
  }
  throw new Error(`${label} did not come up at ${url} within ${Math.round(timeoutMs / 1000)}s`);
}

function binIn(dir, name) {
  const bin = path.join(dir, 'node_modules', '.bin', isWindows ? `${name}.cmd` : name);
  if (!fs.existsSync(bin)) throw new Error(`${name} not found at ${bin} — run pnpm install`);
  return bin;
}

function spawnTracked(name, cmd, args, options) {
  const child = spawn(cmd, args, {
    stdio: 'inherit',
    detached: !isWindows,
    ...options,
  });
  child.on('error', (err) => {
    console.error(`[dev] failed to start ${name}: ${err.message}`);
  });
  return track(name, child);
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function startVite(opts, extraEnv) {
  console.log(`[dev] starting vite on port ${opts.port}…`);
  // No --host: Vite's default binds loopback under the name `localhost`, which is
  // what Playwright/browsers expect. --strictPort makes a busy port a hard error
  // instead of a silent shift the E2E suite would miss.
  return spawnTracked('vite', binIn(appDir, 'vite'), ['--port', String(opts.port), '--strictPort'], {
    cwd: appDir,
    env: { ...process.env, ...extraEnv },
  });
}

function startSidecar(opts) {
  fs.mkdirSync(opts.dataDir, { recursive: true });
  const env = {
    ...process.env,
    BANDREADY_HOST: '127.0.0.1',
    BANDREADY_PORT: String(opts.sidecarPort),
    BANDREADY_AUTH_TOKEN: opts.token,
    BANDREADY_DATA_DIR: opts.dataDir,
    BANDREADY_PARENT_PID: String(process.pid),
    BANDREADY_LOG_LEVEL: 'debug',
    PYTHONUNBUFFERED: '1',
  };
  if (opts.mock) env.BANDREADY_ENABLE_MOCK = '1';

  const venvPython = isWindows
    ? path.join(sidecarDir, '.venv', 'Scripts', 'python.exe')
    : path.join(sidecarDir, '.venv', 'bin', 'python');

  let cmd;
  let args;
  if (fs.existsSync(venvPython)) {
    cmd = venvPython;
    args = ['-m', 'bandready.cli', 'serve'];
  } else {
    cmd = 'uv';
    args = ['run', 'python', '-m', 'bandready.cli', 'serve'];
  }

  console.log(`[dev] starting sidecar on 127.0.0.1:${opts.sidecarPort} (data: ${opts.dataDir})…`);
  return spawnTracked('sidecar', cmd, args, { cwd: sidecarDir, env });
}

async function buildElectronBundle() {
  console.log('[dev] building electron main/preload bundle…');
  const child = spawn(binIn(appDir, 'vite'), ['build', '-c', 'electron.vite.config.ts'], {
    cwd: appDir,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  if (code !== 0) throw new Error(`electron bundle build failed (exit ${code})`);
  for (const f of ['main.js', 'preload.js']) {
    const p = path.join(appDir, 'dist-electron', f);
    if (!fs.existsSync(p)) throw new Error(`electron bundle missing ${p}`);
  }
}

function startElectron(opts, extraEnv) {
  const require = createRequire(path.join(appDir, 'package.json'));
  const electronPath = require('electron');
  console.log('[dev] launching electron…');
  return spawnTracked('electron', electronPath, ['.'], {
    cwd: appDir,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ELECTRON_ENABLE_LOGGING: '1',
      VITE_DEV_SERVER_URL: `http://localhost:${opts.port}`,
      ...extraEnv,
    },
  });
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

async function runBrowserMode(opts) {
  const sidecarUrl = `http://127.0.0.1:${opts.sidecarPort}`;
  const uiUrl = `http://localhost:${opts.port}`;

  const alreadyUp = await probe(`${sidecarUrl}/health`, 500);
  if (alreadyUp) {
    console.log(`[dev] reusing sidecar already listening at ${sidecarUrl}`);
  } else {
    startSidecar(opts);
    await waitFor('sidecar', `${sidecarUrl}/health`, 90_000);
  }
  console.log(`[dev] sidecar ready   -> ${sidecarUrl}  (token: ${opts.token}${opts.mock ? ', mock providers ON' : ''})`);

  startVite(opts, {
    VITE_SIDECAR_URL: sidecarUrl,
    VITE_SIDECAR_TOKEN: opts.token,
  });
  await waitFor('vite', `${uiUrl}/`, 90_000);
  console.log(`[dev] vite ready      -> ${uiUrl}`);
  console.log('[dev] BROWSER MODE READY');
  console.log(`[dev] open ${uiUrl} — Ctrl-C to stop`);
}

async function runElectronMode(opts) {
  const uiUrl = `http://localhost:${opts.port}`;

  if (opts.electronBuild) await buildElectronBundle();

  let electronEnv = {};
  if (opts.devSidecar) {
    const sidecarUrl = `http://127.0.0.1:${opts.sidecarPort}`;
    if (await probe(`${sidecarUrl}/health`, 500)) {
      console.log(`[dev] reusing sidecar already listening at ${sidecarUrl}`);
    } else {
      startSidecar(opts);
      await waitFor('sidecar', `${sidecarUrl}/health`, 90_000);
    }
    console.log(`[dev] sidecar ready   -> ${sidecarUrl}  (token: ${opts.token})`);
    electronEnv = { BANDREADY_DEV_SIDECAR: sidecarUrl, BANDREADY_DEV_TOKEN: opts.token };
  }

  startVite(opts, {});
  await waitFor('vite', `${uiUrl}/`, 90_000);
  console.log(`[dev] vite ready      -> ${uiUrl}`);

  startElectron(opts, electronEnv);
  console.log('[dev] ELECTRON MODE READY — Ctrl-C to stop');
}

// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.browser) await runBrowserMode(opts);
  else await runElectronMode(opts);
}

main().catch((err) => {
  if (!shuttingDown) console.error(`[dev] ${err.message}`);
  shutdown(1);
});
