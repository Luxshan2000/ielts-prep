/**
 * Settings — provider selection, verification, and the VAD guard rails
 * (03-providers-and-settings.md §2.3 and §4).
 */
import { expect, expectNoErrorBoundary, gotoRoute, test } from "./fixtures";

test.beforeEach(async ({ seed }) => {
  await seed.ensureOnboarded();
});

test("selecting the mock LLM verifies, lists models, and survives a reload", async ({
  page,
  seed,
}) => {
  await gotoRoute(page, "/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("tab", { name: "Providers" }).click();

  // Pick the hidden mock preset (registered because the sidecar runs with
  // BANDREADY_ENABLE_MOCK=1 — 14 §7.1's shared test seam).
  const providerSelect = page.getByRole("button", { name: "Language model provider" });
  await expect(providerSelect).toBeVisible();
  await providerSelect.click();
  await page.getByRole("option", { name: "Mock LLM (tests)" }).click();
  await expect(providerSelect).toContainText("Mock LLM");

  // Verify really calls POST /api/v1/providers/verify.
  const verified = page.waitForResponse(
    (res) => res.url().includes("/api/v1/providers/verify") && res.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Verify" })
    .first()
    .click();
  const verifyResponse = await verified;
  expect(verifyResponse.status()).toBe(200);
  const verifyBody = (await verifyResponse.json()) as { ok: boolean; models: string[] };
  expect(verifyBody.ok, "the mock provider must verify successfully").toBe(true);
  expect(verifyBody.models.length, "verification returns the served model list").toBeGreaterThan(0);

  // …and the success plus the served model reach the screen. The mock preset's
  // `config_spec` declares `model` as free text, so the slot renders a textbox
  // holding the model the sidecar just reported.
  await expect(page.getByText("mock provider — deterministic fixtures")).toBeVisible();
  await expect(page.getByText("Verified", { exact: true }).first()).toBeVisible();
  // The Language-model card is the first slot on the tab; the STT slot renders a
  // "Model" textbox of its own once a mock preset is configured.
  await expect(
    page.getByRole("textbox", { name: "Model", exact: true }).first(),
  ).toHaveValue(verifyBody.models[0]);

  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();

  // The sidecar is the source of truth, not the React store.
  const stored = (await (await seed.api.get("/api/v1/settings")).json()) as {
    llm: { preset: string; model: string };
  };
  expect(stored.llm.preset).toBe("mock_llm");

  await page.reload();
  await page.getByRole("tab", { name: "Providers" }).click();
  await expect(page.getByRole("button", { name: "Language model provider" })).toContainText(
    "Mock LLM",
  );
  await expectNoErrorBoundary(page);
});

test("the VAD volume gate cannot be pushed past the documented 0.6 cap", async ({ page, seed }) => {
  await gotoRoute(page, "/settings");
  await page.getByRole("tab", { name: "Voice" }).click();

  const slider = page.getByLabel("Minimum volume gate");
  await expect(slider).toBeVisible();
  // The cap is enforced by the control itself (03 §2.3: Pipecat's own default of
  // 0.6 silently mutes normal speech, so BandReady clamps it).
  await expect(slider).toHaveAttribute("max", "0.6");

  await slider.fill("0.6");
  await expect(slider).toHaveValue("0.6");
  // Pushing further with the keyboard must not move past the cap.
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");
  await expect(slider).toHaveValue("0.6");
  await expect(
    page.getByText("Above ~0.3 quiet speakers start getting cut off.", { exact: false }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();

  const stored = (await (await seed.api.get("/api/v1/settings")).json()) as {
    vad: { min_volume: number };
  };
  expect(stored.vad.min_volume).toBeCloseTo(0.6, 5);

  await page.reload();
  await page.getByRole("tab", { name: "Voice" }).click();
  await expect(page.getByLabel("Minimum volume gate")).toHaveValue("0.6");
  await expectNoErrorBoundary(page);

  // Leave the profile on a sane value for the specs that follow.
  await seed.api.patch("/api/v1/settings", { data: { vad: { min_volume: 0 } } });
});
