/**
 * The Writing Desk — draft → autosave → evaluation → rewrite (05-writing-module.md
 * §3, §6, §7, §8) and the Academic Task 1 chart renderer (05 §2.2).
 */
import type { Page } from "@playwright/test";
import { SAMPLE_ESSAY, expect, expectNoErrorBoundary, gotoRoute, test } from "./fixtures";

/**
 * Submit an attempt, clearing the pre-check gate when it appears.
 *
 * The gate is real behaviour (05 §5): the local checks run before the model is
 * called and a warning — here "this may be off-topic", because the seeded essay
 * answers a different prompt — asks for an explicit acknowledgement.
 */
async function submitAttempt(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Submit" }).click();
  const gate = page.getByRole("dialog").getByRole("button", { name: "Submit anyway" });
  // The pre-check is a round trip, so wait for the gate rather than sampling it.
  const gated = await gate
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (gated) await gate.click();
}

test.beforeEach(async ({ seed }) => {
  await seed.ensureOnboarded();
  await seed.selectMockProviders();
});

test("a Task 2 essay is drafted, autosaved, scored and rewritten", async ({ page }) => {
  await gotoRoute(page, "/writing");
  await expect(page.getByRole("heading", { name: "Writing" })).toBeVisible();

  // --- pick a Task 2 prompt -------------------------------------------------
  await page.getByRole("button", { name: "Task type" }).click();
  await page.getByRole("option", { name: "Task 2 (essay)" }).click();
  const firstStart = page.getByRole("button", { name: "Start", exact: true }).first();
  await expect(firstStart).toBeVisible();
  await firstStart.click();

  // The headless-ui dialog root is a zero-box wrapper, so assert on its contents.
  const dialog = page.getByRole("dialog");
  const startPractice = dialog.getByRole("button", { name: /^Start practice$/ });
  await expect(startPractice).toBeVisible();
  await startPractice.click();
  await expect(page).toHaveURL(/#\/writing\/attempt\//);

  // --- the editor: live word count and a real autosave ----------------------
  const essay = page.getByRole("textbox", { name: "Your answer" });
  await expect(essay).toBeVisible();
  // The readout is two spans ("42" + "/ 250 words"), so match the joined text.
  const wordCount = (n: number) => page.getByText(new RegExp(`^${n}\\s*/\\s*250 words$`));
  await expect(wordCount(0)).toBeVisible();

  await essay.fill("A short opening sentence with exactly eight words.");
  await expect(wordCount(8)).toBeVisible();

  const saved = page.waitForResponse(
    (res) =>
      res.url().includes("/api/v1/writing/attempts/") && res.request().method() === "PATCH",
  );
  await essay.fill(SAMPLE_ESSAY);
  const words = SAMPLE_ESSAY.trim().split(/\s+/).length;
  await expect(wordCount(words)).toBeVisible();
  // The autosave debounce fires on its own; blurring is the documented flush.
  await essay.blur();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByText(/^Saved /)).toBeVisible({ timeout: 20_000 });

  // --- submit and wait for the evaluation job -------------------------------
  await submitAttempt(page);
  await expect(page.getByRole("img", { name: /Band \d(\.\d)? — Overall/ })).toBeVisible({
    timeout: 90_000,
  });
  await expectNoErrorBoundary(page);

  // Band card: an overall band plus the four criteria.
  for (const label of ["Task Response", "Coherence", "Lexis", "Grammar"]) {
    await expect(
      page.getByRole("img", { name: new RegExp(`Band \\d(\\.\\d)? — ${label}`) }),
    ).toBeVisible();
  }

  // Inline annotations live on the "Your answer" tab.
  await page.getByRole("tab", { name: /Your answer/ }).click();
  // The essay is rendered with the model's errors marked in place, so the text
  // is deliberately broken up by <mark> elements.
  await expect(page.getByText("gives every resident", { exact: false })).toBeVisible();
  // Each resolved annotation is a focusable button carrying the flagged span.
  const annotated = page.locator("button[data-annotation]");
  expect(
    await annotated.count(),
    "the evaluation's annotations resolve to offsets and render inline",
  ).toBeGreaterThan(0);
  await expect(annotated.filter({ hasText: "In nowadays" }).first()).toBeVisible();

  // Vocabulary upgrades live on the "Improve" tab.
  await page.getByRole("tab", { name: "Improve" }).click();
  await expect(page.getByText("Vocabulary upgrades")).toBeVisible();

  // --- rewrite with feedback, resubmit, and read the diff -------------------
  await page.getByRole("button", { name: "Rewrite with feedback" }).click();
  await expect(page.getByRole("textbox", { name: "Your answer" })).toBeVisible({
    timeout: 30_000,
  });
  const rewrite = page.getByRole("textbox", { name: "Your answer" });
  await expect(rewrite).not.toHaveValue("");
  await rewrite.fill(
    `${SAMPLE_ESSAY} Finally, a further consideration is that reliable transport also reduces the number of avoidable road deaths each year.`,
  );
  await rewrite.blur();
  await submitAttempt(page);

  await expect(page.getByRole("tab", { name: "Since last time" })).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole("tab", { name: "Since last time" }).click();
  await expect(page.getByText("Against your previous attempt")).toBeVisible();
  await expect(page.getByText("What you changed")).toBeVisible();
  await expectNoErrorBoundary(page);
});

test("an Academic Task 1 prompt renders its chart as SVG with a text alternative", async ({
  page,
}) => {
  await gotoRoute(page, "/writing");
  await page.getByRole("button", { name: "Task type" }).click();
  await page.getByRole("option", { name: "Academic Task 1" }).click();

  await page.getByRole("button", { name: "Preview" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Academic Task 1/ })).toBeVisible();

  const svg = dialog.locator("figure svg").first();
  await expect(svg).toBeVisible();
  // 05 §2.2: the chart is never an opaque image — it carries a described
  // alternative and a tabular fallback.
  await expect(dialog.getByRole("img", { name: /Bar chart|Line graph|chart:/i })).toBeVisible();
  await dialog.getByRole("button", { name: "View as table" }).click();
  await expect(dialog.getByRole("table")).toBeVisible();
  await expectNoErrorBoundary(page);
});
