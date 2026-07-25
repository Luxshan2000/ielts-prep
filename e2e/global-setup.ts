/**
 * Runs once, after Playwright has started the sidecar + Vite web servers and
 * before the first spec. It proves the stack the whole suite depends on is
 * really there: the sidecar is healthy, it is in mock mode (otherwise every
 * LLM-backed assertion would need a real model), and the shipped content pack
 * seeded into this run's fresh database.
 */
import { request } from "@playwright/test";
import { SIDECAR_TOKEN, SIDECAR_URL } from "./env";

export default async function globalSetup(): Promise<void> {
  const api = await request.newContext({
    baseURL: SIDECAR_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${SIDECAR_TOKEN}` },
  });

  const health = await api.get("/health");
  if (!health.ok()) {
    throw new Error(`sidecar /health returned ${health.status()} — the E2E stack is not up`);
  }

  const info = await api.get("/api/v1/system/info");
  if (info.ok()) {
    const body = (await info.json()) as { mock_enabled?: boolean };
    if (!body.mock_enabled) {
      throw new Error(
        "the E2E sidecar is not running with BANDREADY_ENABLE_MOCK=1 — mock providers are " +
          "required (14 §7.1); check playwright.config.ts webServer env",
      );
    }
  }

  // The pack is imported by the sidecar's startup seed. If it is missing, every
  // data-driven spec would fail with a confusing empty state instead.
  const tests = await api.get("/api/v1/reading/tests");
  const payload = (await tests.json()) as { items?: unknown[] } | unknown[];
  const items = Array.isArray(payload) ? payload : (payload.items ?? []);
  if (items.length === 0) {
    throw new Error(
      "no reading tests in the E2E database — content/core-en did not seed. Run " +
        "`uv run --project sidecar python -m tools.content.build content/core-en` from the repo root.",
    );
  }

  await api.dispose();
}
