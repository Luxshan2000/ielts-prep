/**
 * Settings — provider selection, verification, and the VAD guard rails
 * (03-providers-and-settings.md §2.3 and §4).
 *
 * /settings opens a dialog rather than a screen, so the sections are links in the dialog's
 * rail. The route, the deep links and the sidebar entry are unchanged.
 */
import { expect, expectNoErrorBoundary, gotoRoute, test } from "./fixtures";

test.beforeEach(async ({ seed }) => {
  await seed.ensureOnboarded();
});

test("each job is checked on opening, and a route change saves and survives a reload", async ({
  page,
  seed,
}) => {
  // The mock adapters are the shared test seam (14 §7.1). The Providers pane no longer
  // offers them as a choice — it offers "On this computer" or "Through OpenRouter" per
  // job — so they are selected through the API, as the other specs do.
  await seed.selectMockProviders();

  await gotoRoute(page, "/settings?tab=providers");
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Settings" })).toBeVisible();

  // Every "Open Settings" in the app lands here because something failed, so the pane
  // checks each job itself instead of waiting for three button presses.
  const examiner = page.getByRole("group", { name: "The examiner" });
  await expect(examiner.getByText("Working", { exact: true })).toBeVisible({ timeout: 20_000 });

  // Switch the examiner to the local route, save, and read the result back from the
  // sidecar — the source of truth, not the React store.
  const local = examiner.getByRole("button", { name: /^On this computer/ });
  await local.click();
  await expect(local).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  const stored = (await (await seed.api.get("/api/v1/settings")).json()) as {
    llm: { preset: string };
  };
  expect(stored.llm.preset).toBe("ollama");

  await page.reload();
  await expect(
    page
      .getByRole("group", { name: "The examiner" })
      .getByRole("button", { name: /^On this computer/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expectNoErrorBoundary(page);

  // Put the shared seam back for the specs that follow.
  await seed.selectMockProviders();
});

test("the VAD volume gate cannot be pushed past the documented 0.6 cap", async ({ page, seed }) => {
  await gotoRoute(page, "/settings");
  await page.getByRole("link", { name: "Voice" }).click();

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
  await page.getByRole("link", { name: "Voice" }).click();
  await expect(page.getByLabel("Minimum volume gate")).toHaveValue("0.6");
  await expectNoErrorBoundary(page);

  // Leave the profile on a sane value for the specs that follow.
  await seed.api.patch("/api/v1/settings", { data: { vad: { min_volume: 0 } } });
});
