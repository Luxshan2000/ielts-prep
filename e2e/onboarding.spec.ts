/**
 * First-run onboarding (10 §2 + §3).
 *
 * This spec owns the app's virgin state: it is its own Playwright project and
 * every other spec depends on it, so it runs first against the fresh database
 * the sidecar's webServer command created.
 */
import { expect, expectNoErrorBoundary, gotoRoute, isoDaysFromNow, test } from "./fixtures";

const EXAM_DATE = isoDaysFromNow(84);

test("a first run redirects into the wizard and finishes with estimates and a plan", async ({
  page,
  seed,
  errors,
}) => {
  expect(
    await seed.isFirstRun(),
    "onboarding.spec must run against a virgin database — check that the sidecar webServer wiped BANDREADY_DATA_DIR",
  ).toBe(true);

  // --- the dashboard hands over to the wizard -------------------------------
  await page.goto("/");
  await expect(page).toHaveURL(/#\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Welcome to BandReady" })).toBeVisible();

  // Step 1 — welcome.
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2 — format, target band, exam date.
  await expect(
    page.getByRole("heading", { name: "Which test, and what are you aiming for?" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /^Academic/ }).check();
  await page.getByLabel("Target band").selectOption("7.5").catch(async () => {
    // The Select is a headless-ui button+listbox, not a native <select>.
    await page.getByLabel("Target band").click();
    await page.getByRole("option", { name: "7.5" }).click();
  });
  await page.getByRole("radio", { name: /Yes, I have a date/ }).check();
  await page.getByLabel("Exam date").fill(EXAM_DATE);
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3 — self-rating, minutes, study days.
  await expect(
    page.getByRole("heading", { name: "Your starting point and your week" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /^Upper intermediate/ }).check();
  await page.getByRole("radio", { name: /^60 min/ }).first().check();
  // At least three study days must stay on; the default already satisfies it.
  await expect(page.getByText("Select at least three study days.")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();

  // Steps 4–6 — engines, model weights, mic check. All informational: they must
  // render without blocking, and the wizard must let the learner through.
  for (const heading of [
    "What's already on this machine",
    "Voice and speech weights",
    "Microphone check",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
  }

  // Step 7 — the placement offer.
  await expect(page.getByRole("heading", { name: "Take the placement test?" })).toBeVisible();
  await page.getByRole("button", { name: "Take the placement test" }).click();

  // --- placement: skip every section, one at a time -------------------------
  // The sitting is durable on the sidecar, so the runner only appears once
  // `POST /placement/start` has answered.
  await expect(page.getByRole("heading", { name: /^Placement · / })).toBeVisible({
    timeout: 30_000,
  });
  const skipButton = page.getByRole("button", {
    name: /^Skip (Reading|Listening|Writing|Speaking)$/,
  });
  const done = page.getByRole("heading", { name: /You'?re set up/ });
  for (let i = 0; i < 10; i += 1) {
    if (await done.isVisible().catch(() => false)) break;
    if (await skipButton.first().isVisible().catch(() => false)) {
      await skipButton.first().click();
      await page.waitForTimeout(600);
      continue;
    }
    // A section with no installed content offers a plain Continue instead.
    // `exact` matters: "Submit and continue" would otherwise match too.
    const cont = page.getByRole("button", { name: "Continue", exact: true });
    if (await cont.isVisible().catch(() => false)) {
      await cont.click();
      await page.waitForTimeout(600);
      continue;
    }
    await page.waitForTimeout(1_000);
  }

  // --- the result screen ----------------------------------------------------
  await expect(page.getByRole("heading", { name: /You'?re set up/ })).toBeVisible({
    timeout: 60_000,
  });
  await expectNoErrorBoundary(page);

  // --- and the dashboard now has estimates and a plan -----------------------
  const summary = await seed.api.get("/api/v1/progress/summary");
  const body = (await summary.json()) as {
    plan_id?: string | null;
    estimates: Record<string, { band: number | null }>;
    profile: { target_band: number; exam_date: string | null };
  };
  expect(body.profile.target_band).toBe(7.5);
  expect(body.profile.exam_date).toBe(EXAM_DATE);
  expect(Object.keys(body.estimates)).toEqual(
    expect.arrayContaining(["listening", "reading", "speaking", "writing"]),
  );
  for (const skill of ["listening", "reading", "speaking", "writing"]) {
    expect(body.estimates[skill].band, `${skill} has no starting band`).not.toBeNull();
  }

  const plan = await seed.api.get("/api/v1/plan");
  expect(plan.ok()).toBe(true);
  const planBody = (await plan.json()) as { plan?: { id?: string; weeks?: unknown[] } | null };
  expect(planBody.plan, "placement completion must generate a study plan").toBeTruthy();

  await gotoRoute(page, "/");
  await expect(page).not.toHaveURL(/onboarding/);
  await expect(page.getByRole("heading", { name: "Band estimates" })).toBeVisible();
  await expect(page.getByText("Target 7.5")).toBeVisible();
  await expectNoErrorBoundary(page);
  expect(errors.uncaught, "no uncaught exceptions during onboarding").toEqual([]);
});
