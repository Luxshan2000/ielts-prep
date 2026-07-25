/**
 * Progress — with real scored data on the sidecar, the trajectory chart, the
 * criterion breakdown, the activity heatmap and the readiness checklist all
 * render (10-curriculum-progress.md §5–§8).
 */
import { expect, expectNoErrorBoundary, gotoRoute, test } from "./fixtures";

test.beforeEach(async ({ seed }) => {
  await seed.ensureOnboarded();
  await seed.selectMockProviders();
});

test("the progress screen renders every panel against seeded data", async ({ page, seed }) => {
  // --- seed something to draw ----------------------------------------------
  await seed.seedActivity(6);
  await seed.seedReadingAttempt();
  await seed.seedWritingAttempt();
  await seed.api.post("/api/v1/progress/estimates/recompute");

  const summary = (await (await seed.api.get("/api/v1/progress/summary")).json()) as {
    estimates: Record<string, { band: number | null }>;
    profile: { target_band: number };
  };

  await gotoRoute(page, "/progress");
  await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();

  // --- per-skill estimates --------------------------------------------------
  for (const skill of ["Listening", "Reading", "Writing", "Speaking"]) {
    await expect(page.getByText(skill, { exact: true }).first()).toBeVisible();
  }
  await expect(
    page.getByText(`Target ${summary.profile.target_band.toFixed(1)}`, { exact: true }).first(),
  ).toBeVisible();

  // --- trajectory chart (recharts SVG) --------------------------------------
  await expect(page.getByRole("heading", { name: "Band trajectory" })).toBeVisible();
  const trajectory = page
    .locator("section, div")
    .filter({ has: page.getByRole("heading", { name: "Band trajectory" }) })
    .first();
  await expect(trajectory.locator("svg").first()).toBeVisible();
  // The chart has a text alternative and a numbers table behind a disclosure.
  await page.getByRole("button", { name: "Show the numbers" }).click();
  await expect(page.getByRole("table").first()).toBeVisible();

  // --- criterion breakdown --------------------------------------------------
  await expect(page.getByRole("heading", { name: "Criterion breakdown" })).toBeVisible();
  await page
    .getByLabel("Criterion breakdown skill")
    .getByRole("tab", { name: "Writing" })
    .click();
  // Either a radar with criterion bands, or the labelled "not enough data" state.
  const criteria = (await (
    await seed.api.get("/api/v1/progress/criteria?skill=writing")
  ).json()) as Record<string, unknown>;
  expect(criteria, "the criteria route answers for writing").toBeTruthy();
  // The seeded writing attempt is scored, so the radar draws all four criteria.
  for (const label of [
    "Task Achievement (TA)",
    "Coherence and Cohesion (CC)",
    "Lexical Resource (LR)",
    "Grammatical Range and Accuracy (GRA)",
  ]) {
    await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
  }

  // --- activity heatmap -----------------------------------------------------
  await expect(page.getByRole("heading", { name: "Activity calendar" })).toBeVisible();
  const heatCells = page.getByRole("button", { name: /\d+ minutes$/ });
  expect(await heatCells.count(), "the heatmap draws a cell per day").toBeGreaterThan(50);
  // The seeded minutes are really on the grid.
  // At least one day carries the minutes we logged (the exact figure accumulates
  // across a warm data dir, so assert "studied", not a specific number).
  await expect(page.getByRole("button", { name: /: [1-9]\d* minutes$/ }).first()).toBeVisible();
  await expect(page.getByText("Days studied")).toBeVisible();

  // --- readiness checklist --------------------------------------------------
  await expect(page.getByRole("heading", { name: "Exam readiness" })).toBeVisible();
  await expect(page.getByText("Automatic checks passed")).toBeVisible();
  const manual = page.getByRole("checkbox", { name: /Exam booked/ });
  await expect(manual).toBeVisible();
  await manual.check();
  await expect
    .poll(
      async () => {
        const res = await seed.api.get("/api/v1/readiness");
        const body = (await res.json()) as { items: { id: string; checked: boolean }[] };
        return body.items.some((item) => item.checked);
      },
      { message: "a manual readiness tick persists to the sidecar", timeout: 20_000 },
    )
    .toBe(true);

  await expectNoErrorBoundary(page);
});
