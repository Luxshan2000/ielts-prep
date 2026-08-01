#!/usr/bin/env node
/**
 * Builds the Electron main + preload bundles into app/dist-electron/.
 *
 *   node scripts/build-electron.mjs            one-shot build
 *   node scripts/build-electron.mjs --watch     rebuild on change (blocks)
 *
 * The renderer bundle is built separately by `pnpm --filter bandready-app build`.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const appDir = path.join(repoRoot, 'app');
const outDir = path.join(appDir, 'dist-electron');
const REQUIRED = ['main.js', 'preload.js'];

const watch = process.argv.includes('--watch');

/**
 * Vite's own entry script, run under this Node rather than through the `.bin` shim.
 *
 * The shim is `vite.cmd` on Windows, and since Node 18.20/20.12 closed CVE-2024-27980
 * `spawn` refuses a `.cmd` without `shell: true` — it throws EINVAL, which is exactly how
 * this failed on the first Windows CI run. Turning `shell: true` on would fix it and hand
 * the whole command line to cmd.exe, where a path like `Lux's Projects` becomes a quoting
 * problem instead. Running the script directly has neither issue and behaves identically on
 * all three platforms.
 *
 * Resolved by path rather than `require.resolve`: vite's `exports` map does not expose
 * `./bin/vite.js`, though the file is right there on disk.
 */
function viteEntry() {
  const entry = path.join(appDir, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(entry)) {
    throw new Error(`vite not found at ${entry} — run pnpm install first`);
  }
  return entry;
}

export function buildElectron({ watch: watchMode = false, stdio = 'inherit' } = {}) {
  const args = [viteEntry(), 'build', '-c', 'electron.vite.config.ts'];
  if (watchMode) args.push('--watch');
  const child = spawn(process.execPath, args, {
    cwd: appDir,
    stdio,
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? 'production' },
  });
  return child;
}

function verify() {
  const missing = REQUIRED.filter((f) => !fs.existsSync(path.join(outDir, f)));
  if (missing.length) {
    throw new Error(`electron build produced no ${missing.join(', ')} in ${outDir}`);
  }
  for (const f of REQUIRED) {
    const { size } = fs.statSync(path.join(outDir, f));
    console.log(`[build-electron] ${path.join('dist-electron', f)}  ${(size / 1024).toFixed(1)} kB`);
  }
}

async function main() {
  if (watch) {
    const child = buildElectron({ watch: true });
    await new Promise((resolve) => child.on('exit', resolve));
    return;
  }

  const child = buildElectron({ watch: false });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  if (code !== 0) {
    console.error(`[build-electron] vite exited with code ${code}`);
    process.exit(code ?? 1);
  }
  verify();
  console.log('[build-electron] ok');
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`[build-electron] ${err.message}`);
    process.exit(1);
  });
}
