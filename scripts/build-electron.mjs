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

function viteBin() {
  const bin = path.join(
    appDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vite.cmd' : 'vite',
  );
  if (!fs.existsSync(bin)) {
    throw new Error(`vite binary not found at ${bin} — run pnpm install first`);
  }
  return bin;
}

export function buildElectron({ watch: watchMode = false, stdio = 'inherit' } = {}) {
  const args = ['build', '-c', 'electron.vite.config.ts'];
  if (watchMode) args.push('--watch');
  const child = spawn(viteBin(), args, {
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
