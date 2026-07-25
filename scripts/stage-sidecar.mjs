#!/usr/bin/env node
/**
 * Stage the Python sidecar for packaging.
 *
 * `app/electron-builder.yml` maps two directories into the bundle that nothing else
 * produces:
 *
 *   build/python/        a relocatable CPython (python-build-standalone)
 *   build/sidecar-venv/  a venv holding the sidecar and its dependencies
 *
 * They are separate because the venv's `pyvenv.cfg` points at an interpreter, and a
 * Homebrew or uv-managed Python on the build machine will not exist on the user's.
 * Bundling the interpreter alongside the venv and rewriting the venv to point at it
 * is what makes the tree relocatable.
 *
 * Usage:
 *   node scripts/stage-sidecar.mjs [--arch arm64|x64] [--voice] [--python-dir DIR]
 *
 * `--voice` includes pipecat/torch/faster-whisper (adds roughly 2-3 GB; required for
 * live speaking). Without it everything except the live examiner call still works.
 *
 * Model weights are deliberately NOT staged: they are downloaded or adopted on first
 * run into the user's data directory (see `bandready.models_local`), so the installer
 * stays small and no model licence is redistributed.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { platform } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BUILD = join(REPO, 'build')
const VENV = join(BUILD, 'sidecar-venv')
const PYDIR = join(BUILD, 'python')

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const opt = (name, fallback = null) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

const arch = opt('--arch', process.arch === 'arm64' ? 'arm64' : 'x64')
const withVoice = flag('--voice')
const pythonDir = opt('--python-dir')
const isWindows = platform() === 'win32'
const venvBin = join(VENV, isWindows ? 'Scripts' : 'bin')
const venvPython = join(venvBin, isWindows ? 'python.exe' : 'python')

const run = (cmd, args, cwd = REPO) => {
  process.stdout.write(`  $ ${cmd} ${args.join(' ')}\n`)
  execFileSync(cmd, args, { cwd, stdio: 'inherit' })
}

const step = (msg) => process.stdout.write(`\n▸ ${msg}\n`)

// ---------------------------------------------------------------- interpreter ---

step(`Staging a relocatable CPython for ${arch}`)
rmSync(PYDIR, { recursive: true, force: true })
mkdirSync(PYDIR, { recursive: true })

if (pythonDir) {
  // An already-downloaded python-build-standalone tree — useful offline or on a slow
  // connection, where re-fetching ~50 MB per build is the dominant cost.
  step(`Copying the interpreter from ${pythonDir}`)
  run('cp', ['-R', `${pythonDir.replace(/\/$/, '')}/.`, PYDIR])
} else {
  // `uv python install` keeps its own copy of python-build-standalone; reuse it rather
  // than downloading a second one.
  step('Locating a standalone interpreter via uv')
  let found
  try {
    found = execFileSync('uv', ['python', 'find', '3.11'], { encoding: 'utf8' }).trim()
  } catch {
    console.error(
      '\nCould not find a Python 3.11 through uv.\n' +
        'Run `uv python install 3.11`, or pass an already-downloaded\n' +
        'python-build-standalone tree with --python-dir DIR.\n',
    )
    process.exit(1)
  }
  // <root>/install/bin/python3.11 → <root>/install
  const root = resolve(dirname(dirname(found)))
  if (!existsSync(join(root, 'lib'))) {
    console.error(
      `\n${found} does not look like a relocatable standalone tree (no lib/ beside bin/).\n` +
        'Pass --python-dir with a python-build-standalone extraction instead.\n',
    )
    process.exit(1)
  }
  step(`Copying ${root}`)
  run('cp', ['-R', `${root}/.`, PYDIR])
}

// ----------------------------------------------------------------------- venv ---

step('Building the sidecar venv')
rmSync(VENV, { recursive: true, force: true })
const stagedPython = join(PYDIR, isWindows ? 'python.exe' : join('bin', 'python3.11'))
run('uv', ['venv', '--python', existsSync(stagedPython) ? stagedPython : '3.11', VENV])

const extras = withVoice ? '[voice]' : ''
step(`Installing the sidecar${extras ? ' with the voice extra' : ' (no voice extra)'}`)
run('uv', ['pip', 'install', '--python', venvPython, `${join(REPO, 'sidecar')}${extras}`])

// ------------------------------------------------------------------ relocate ---

step('Rewriting the venv to use the bundled interpreter')
// electron-builder places both trees side by side under Resources/, so a relative
// `home` keeps working wherever the user installs the app.
const cfg = join(VENV, 'pyvenv.cfg')
if (existsSync(cfg)) {
  const rewritten = readFileSync(cfg, 'utf8')
    .split('\n')
    .map((line) =>
      line.startsWith('home =')
        ? `home = ${isWindows ? '..\\python' : '../python/bin'}`
        : line,
    )
    .join('\n')
  writeFileSync(cfg, rewritten)
}

// Console scripts hard-code the build machine's interpreter path in their shebang.
// The app spawns `python -m bandready.cli`, so the shebangs are not on the critical
// path, but a stale absolute path in a shipped file is a footgun worth removing.
if (!isWindows) {
  const shebang = '#!/bin/sh\n"exec" "$(dirname "$0")/python" "$0" "$@"\n'
  for (const script of ['bandready-sidecar']) {
    const p = join(venvBin, script)
    if (!existsSync(p)) continue
    const body = readFileSync(p, 'utf8').split('\n').slice(1).join('\n')
    writeFileSync(p, shebang + body, { mode: 0o755 })
  }
}

// -------------------------------------------------------------------- verify ---

step('Verifying the staged sidecar imports and serves')
run(venvPython, ['-c', 'from bandready.server.app import create_app; a=create_app(); print(f"  routes: {len(a.state.route_paths)}")'])

step('Done')
process.stdout.write(
  `  ${PYDIR}\n  ${VENV}\n\n` +
    'Next:\n' +
    '  cd app && pnpm build && node ../scripts/build-electron.mjs\n' +
    '  cd app && pnpm exec electron-builder --config electron-builder.yml\n',
)
