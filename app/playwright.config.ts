/**
 * Playwright E2E configuration — 14-testing-strategy.md §7.3.
 *
 * The suite drives the REAL renderer (Vite dev server, port 5273) in real
 * Chromium against the REAL sidecar (FastAPI + SQLite + the shipped content
 * pack) running with `BANDREADY_ENABLE_MOCK=1`, so every layer below the UI is
 * production code and only the LLM/STT/TTS adapters are canned.
 *
 * Hermetic runs: the sidecar's own launch command wipes and recreates its
 * `BANDREADY_DATA_DIR` before exec'ing, so each `playwright test` invocation
 * starts from a virgin database that re-seeds `content/core-en`. (Playwright
 * starts `webServer` entries before `globalSetup`, so the wipe has to live in
 * the command itself.)
 *
 * Ordering: `onboarding.spec.ts` is the one spec that needs a first-run
 * profile, so it runs as its own project that every other spec depends on.
 */
import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "..");
const sidecarDir = path.join(repoRoot, "sidecar");

/** Static so every Playwright worker (each re-evaluates this file) agrees. */
export const DATA_DIR = process.env.BANDREADY_E2E_DATA_DIR ?? path.join(os.tmpdir(), "bandready-e2e-data");
export const SIDECAR_PORT = Number(process.env.BANDREADY_E2E_SIDECAR_PORT ?? 8711);
export const SIDECAR_URL = `http://127.0.0.1:${SIDECAR_PORT}`;
export const SIDECAR_TOKEN = process.env.BANDREADY_E2E_TOKEN ?? "e2e-token";
/** 5273 is pinned: vite.config.ts uses strictPort and it is in the sidecar's CORS allow-list. */
export const UI_PORT = 5273;
export const UI_URL = `http://localhost:${UI_PORT}`;

// The specs live at the repo root (outside `app/`), where they are transpiled as
// CommonJS and cannot import this ES module. This config is the first thing every
// worker evaluates, so it publishes the stack's coordinates through the
// environment and `e2e/env.ts` reads them back.
process.env.BANDREADY_E2E_SIDECAR_URL = SIDECAR_URL;
process.env.BANDREADY_E2E_TOKEN = SIDECAR_TOKEN;
process.env.BANDREADY_E2E_UI_URL = UI_URL;

const venvPython = path.join(
  sidecarDir,
  ".venv",
  process.platform === "win32" ? "Scripts" : "bin",
  process.platform === "win32" ? "python.exe" : "python",
);
const pythonCmd = existsSync(venvPython) ? JSON.stringify(venvPython) : "uv run python";

const reuse = Boolean(process.env.E2E_REUSE_SERVER);
const quoted = JSON.stringify(DATA_DIR);

export default defineConfig({
  testDir: path.join(repoRoot, "e2e"),
  // `test-results/` and `playwright-report/` are already in .gitignore.
  outputDir: path.join(repoRoot, "test-results"),
  // Every spec shares one sidecar and one SQLite database, so they must not
  // interleave. Serial + one worker also keeps the LLM-mock jobs predictable.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Generous: audio rendering and mock-LLM jobs are real background work.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  globalSetup: path.join(repoRoot, "e2e", "global-setup.ts"),
  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { outputFolder: path.join(repoRoot, "playwright-report"), open: "never" }],
        ["github"],
      ]
    : [["list"], ["html", { outputFolder: path.join(repoRoot, "playwright-report"), open: "never" }]],

  use: {
    baseURL: UI_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: process.env.CI ? "off" : "off",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    // The sidecar is a second origin in browser mode; nothing here needs cookies.
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: "onboarding",
      testMatch: /onboarding\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], ...chromiumLaunch() },
    },
    {
      name: "chromium",
      testIgnore: /onboarding\.spec\.ts/,
      dependencies: ["onboarding"],
      use: { ...devices["Desktop Chrome"], ...chromiumLaunch() },
    },
  ],

  webServer: [
    {
      // The wipe lives in the command so it happens before the sidecar opens
      // the database — `globalSetup` runs after webServer entries are up.
      command:
        process.platform === "win32"
          ? `node -e "require('fs').rmSync(${quoted.replace(/"/g, '\\"')},{recursive:true,force:true})" && ${pythonCmd} -m bandready.cli serve`
          : `rm -rf ${quoted} && mkdir -p ${quoted} && exec ${pythonCmd} -m bandready.cli serve`,
      cwd: sidecarDir,
      url: `${SIDECAR_URL}/health`,
      timeout: 180_000,
      reuseExistingServer: reuse,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        BANDREADY_HOST: "127.0.0.1",
        BANDREADY_PORT: String(SIDECAR_PORT),
        BANDREADY_AUTH_TOKEN: SIDECAR_TOKEN,
        BANDREADY_DATA_DIR: DATA_DIR,
        BANDREADY_ENABLE_MOCK: "1",
        BANDREADY_LOG_LEVEL: "info",
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      command: `pnpm exec vite --port ${UI_PORT} --strictPort`,
      cwd: appDir,
      url: `${UI_URL}/`,
      timeout: 120_000,
      reuseExistingServer: reuse,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        VITE_SIDECAR_URL: SIDECAR_URL,
        VITE_SIDECAR_TOKEN: SIDECAR_TOKEN,
      },
    },
  ],
});

/** Fake mic/camera so `getUserMedia` resolves headlessly and permission auto-grants. */
function chromiumLaunch() {
  return {
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
        "--disable-features=WebRtcHideLocalIpsWithMdns",
      ],
    },
    permissions: ["microphone"] as string[],
  };
}
