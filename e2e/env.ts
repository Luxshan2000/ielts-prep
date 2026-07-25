/**
 * Where the E2E stack lives.
 *
 * `app/playwright.config.ts` seeds these env vars at config load (it is the only
 * module Playwright is guaranteed to evaluate first, in every worker), so specs
 * never import the config — the config is an ES module inside `app/`, the specs
 * are CommonJS at the repo root, and importing across that boundary fails.
 */
export const SIDECAR_URL = process.env.BANDREADY_E2E_SIDECAR_URL ?? "http://127.0.0.1:8711";
export const SIDECAR_TOKEN = process.env.BANDREADY_E2E_TOKEN ?? "e2e-token";
export const UI_URL = process.env.BANDREADY_E2E_UI_URL ?? "http://localhost:5273";
