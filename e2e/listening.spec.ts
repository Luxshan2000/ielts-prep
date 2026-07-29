/**
 * Listening — audio is rendered by a real job, the exam-mode player refuses to
 * scrub or replay, and a submitted attempt reviews with timestamp replay
 * (07-listening-module.md §3, §4, §6).
 */
import { expect, expectNoErrorBoundary, gotoRoute, test } from "./fixtures";

test.beforeEach(async ({ seed }) => {
  await seed.ensureOnboarded();
  await seed.selectMockProviders();
});

test("audio renders through a job, exam mode locks playback, and the attempt reviews", async ({
  page,
  seed,
}) => {
  await gotoRoute(page, "/listening");
  await expect(page.getByRole("heading", { name: "Listening", exact: true })).toBeVisible();

  // --- prepare the audio ----------------------------------------------------
  // The pack ships no rendered audio (every script has `audio_hash: null`), so a
  // fresh database always takes the render path. A re-run against a warm data
  // dir finds it cached, which is also a state worth asserting.
  const listTests = async () =>
    (await (await seed.api.get("/api/v1/listening/tests")).json()) as {
      items: { id: string; title: string; audio_ready: boolean; audio_ready_parts: number }[];
    };
  const before = await listTests();

  // Scope every control to ONE test card. The bank now ships several listening
  // papers, so an unscoped `getByRole("button", { name: "Start under exam
  // conditions" })` matches one per card and Playwright refuses it in strict mode
  // — and worse, waiting on the unscoped locator would wait on a card whose audio
  // this test never rendered. Rendering and starting must provably be the same paper.
  const card = page
    .locator("article, section, div")
    .filter({ hasText: before.items[0].title })
    .filter({ has: page.getByRole("button", { name: "Start under exam conditions" }) })
    .last();
  const startTest = card.getByRole("button", { name: "Start under exam conditions" });

  if (!before.items[0].audio_ready) {
    const renderPosted = page.waitForResponse(
      (res) => res.url().includes("/render") && res.request().method() === "POST",
    );
    await card.getByRole("button", { name: "Prepare audio" }).click();
    const renderResponse = await renderPosted;
    expect([200, 202]).toContain(renderResponse.status());
    // The job really runs: the sidecar synthesises four parts before the test
    // can be started, and the button stays disabled until it has.
    await expect(startTest).toBeEnabled({ timeout: 180_000 });
  } else {
    await expect(startTest).toBeEnabled();
  }

  const after = await listTests();
  expect(after.items[0].audio_ready, "the render job really produced audio").toBe(true);
  expect(after.items[0].audio_ready_parts).toBe(4);

  // --- exam mode ------------------------------------------------------------
  await startTest.click();
  await expect(page).toHaveURL(/#\/listening\/test\//);
  await page.getByRole("button", { name: "Start the test" }).click();

  // 07 §4: one play, no pause, no scrubbing.
  await expect(page.getByText("Plays once", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("slider", { name: "Playback position" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back 5 seconds" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Replay from the start" })).toHaveCount(0);

  // --- answer a few questions ----------------------------------------------
  const answers = page.getByRole("textbox", { name: /^Answer for question \d+$/ });
  await expect(answers.first()).toBeVisible();
  const toAnswer = Math.min(await answers.count(), 4);
  for (let i = 0; i < toAnswer; i += 1) {
    await answers.nth(i).fill(`answer ${i + 1}`);
  }

  // --- transfer + submit ----------------------------------------------------
  await page.getByRole("button", { name: "Go to the check step" }).click();
  await expect(page.getByRole("heading", { name: "Transfer and check" })).toBeVisible();
  await page.getByRole("button", { name: /Submit/ }).first().click();

  // --- score + review -------------------------------------------------------
  await expect(page).toHaveURL(/#\/listening\/review\//, { timeout: 60_000 });
  const attemptId = (page.url().match(/review\/([^/?]+)/) ?? [])[1];
  const review = (await (
    await seed.api.get(`/api/v1/listening/attempts/${attemptId}/review`)
  ).json()) as {
    raw_score: number;
    total_questions: number;
    band: number | null;
    questions?: unknown[];
  };
  expect(review.total_questions).toBe(40);
  expect(review.raw_score).toBeGreaterThanOrEqual(0);
  expect(review.band, "a full four-part test reports a band").not.toBeNull();

  await expect(page.getByText(new RegExp(`${review.raw_score}\\s*/\\s*40`))).toBeVisible();
  // Playback is unlocked again in review, and every transcript line is a jump.
  await expect(
    page.getByText("Playback is unlocked in review", { exact: false }),
  ).toBeVisible();
  const jump = page.getByRole("button", { name: /^Play from \d+:\d\d/ }).first();
  await expect(jump).toBeVisible();
  await jump.click();
  await expectNoErrorBoundary(page);
});
