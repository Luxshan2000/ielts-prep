/**
 * Reading — a full academic test taken in the player, submitted, and reviewed
 * (06-reading-module.md §3, §4.2, §6.1), plus the double-click dictionary.
 */
import type { Locator } from "@playwright/test";
import { expect, expectNoErrorBoundary, gotoRoute, test } from "./fixtures";

/**
 * Answer-sheet radios are `sr-only` inputs inside styled labels, so the label is
 * what a learner actually clicks — `check()` on the hidden input is intercepted.
 */
async function chooseOption(group: Locator, label: string): Promise<void> {
  await group.getByText(label, { exact: true }).click();
  await expect(group.getByRole("radio", { name: label })).toBeChecked();
}

test.beforeEach(async ({ seed }) => {
  await seed.ensureOnboarded();
  await seed.selectMockProviders();
});

test("a full reading test is answered, flagged, submitted and reviewed", async ({ page, seed }) => {
  await gotoRoute(page, "/reading");
  await expect(page.getByRole("heading", { name: "Reading", exact: true })).toBeVisible();

  // --- start ---------------------------------------------------------------
  // Pin to ONE known paper. Every assertion below names a specific question type,
  // question number and passage title, so it only means anything against the test
  // it was written for. The bank has grown to a dozen papers and the browser is
  // sorted by id, so `.first()` silently began opening a different paper whose
  // question 1 is matching-headings rather than True/False/Not Given.
  const card = page
    .locator("article, section, div")
    .filter({ hasText: "Academic Reading Test 1" })
    .filter({ has: page.getByRole("button", { name: "Start test" }) })
    .last();
  await card.getByRole("button", { name: "Start test" }).click();
  const dialog = page.getByRole("dialog");
  const start = dialog.getByRole("button", { name: "Start", exact: true });
  await expect(start).toBeVisible();
  await start.click();
  await expect(page).toHaveURL(/#\/reading\/attempt\//);
  const attemptId = (page.url().match(/attempt\/([^/?]+)/) ?? [])[1];
  expect(attemptId, "the player owns a real attempt id").toBeTruthy();

  // The timer and the answered counter are the player's two live readouts.
  await expect(page.getByText(/Reading attempt: \d+:\d\d/)).toBeVisible();
  // The counter is a progress bar with a "<answered> / <total>" detail label.
  const answeredDetail = page.getByText(/^\d+ \/ 40$/);
  await expect(answeredDetail).toHaveText("0 / 40");

  // --- answer three DIFFERENT question types -------------------------------
  // 1) True / False / Not Given (radio group)
  await chooseOption(page.getByRole("radiogroup", { name: /^Question 1:/ }), "TRUE");
  await expect(answeredDetail).toHaveText("1 / 40");

  // 2) Sentence completion (gap textbox with a word limit)
  const gap = page.getByRole("textbox", { name: /^Question 6:/ });
  await gap.fill("widened");
  await gap.blur();

  // 3) Short answer
  const shortAnswer = page.getByRole("textbox", { name: /^Question 10:/ });
  await shortAnswer.fill("daylighting");
  await shortAnswer.blur();
  await expect(answeredDetail).toHaveText("3 / 40");

  // --- flag one question ----------------------------------------------------
  await page.getByRole("button", { name: "Flag question 3 for review" }).click();
  // The control relabels itself once the flag is on, and the palette agrees.
  await expect(page.getByRole("button", { name: "Unflag question 3 for review" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Question 3, .*flagged/ })).toBeVisible();

  // --- jump through the palette into passage 2 ------------------------------
  // Question 25 lives in the second passage, so the palette must switch passages.
  await page.getByRole("button", { name: /^Question 25, / }).click();
  await expect(page.getByRole("heading", { name: "The Grid Learns to Wait" })).toBeVisible();

  // 4) Multiple choice — a fourth question type, on another passage.
  const mc = page.getByRole("radiogroup", { name: /^Question 25:/ });
  await expect(mc).toBeVisible();
  const firstOption = mc.getByRole("radio").first();
  await firstOption.click({ force: true });
  await expect(firstOption).toBeChecked();
  await expect(answeredDetail).toHaveText("4 / 40");

  // The autosave must have reached the sidecar before we submit.
  await expect
    .poll(
      async () => {
        const res = await seed.api.get(`/api/v1/reading/attempts/${attemptId}`);
        const body = (await res.json()) as {
          resume_state?: { answers?: Record<string, unknown> };
        };
        return Object.keys(body.resume_state?.answers ?? {}).length;
      },
      { message: "answers autosave to the sidecar", timeout: 20_000 },
    )
    .toBeGreaterThanOrEqual(4);

  // --- submit ---------------------------------------------------------------
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  const confirmSubmit = page.getByRole("button", { name: "Submit for marking" });
  if (await confirmSubmit.waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false)) {
    await confirmSubmit.click();
  }

  // --- results + review -----------------------------------------------------
  await expect(page).toHaveURL(/#\/reading\/review\//, { timeout: 30_000 });
  await expect(page.getByRole("img", { name: /Band .* Reading band|Reading band/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/\d+ \/ 40 correct/)).toBeVisible();
  await expect(page.getByText("Every question")).toBeVisible();

  // The key and the per-question explanation are what makes it a review.
  const review = (await (
    await seed.api.get(`/api/v1/reading/attempts/${attemptId}/review`)
  ).json()) as {
    raw_score: number;
    total_questions: number;
    band: number | null;
    per_question: { number: number; correct: boolean; accepted_answers: string[] }[];
  };
  expect(review.total_questions).toBe(40);
  expect(review.per_question.length).toBe(40);
  expect(
    review.per_question.every((q) => q.accepted_answers.length > 0),
    "every reviewed question exposes its answer key",
  ).toBe(true);
  await expect(page.getByText(`${review.raw_score} / 40 correct`)).toBeVisible();
  await expectNoErrorBoundary(page);
});

test("double-clicking a passage word opens the dictionary popover", async ({ page }) => {
  await gotoRoute(page, "/reading");
  await page.getByRole("tab", { name: /Single passages/ }).click();
  await page.getByRole("button", { name: "Practise" }).first().click();
  // Single-passage practice starts straight away; a full test asks first.
  const start = page.getByRole("dialog").getByRole("button", { name: "Start", exact: true });
  if (await start.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false)) {
    await start.click();
  }
  await expect(page).toHaveURL(/#\/reading\/attempt\//);

  // Double-click near the start of the first paragraph so the browser's own
  // word selection lands on a word rather than on whitespace.
  const paragraph = page.locator("[data-paragraph-id]").first();
  await expect(paragraph).toBeVisible();
  await paragraph.dblclick({ position: { x: 30, y: 12 } });

  const word = (await page.evaluate(() => window.getSelection()?.toString().trim())) ?? "";
  expect(word, "the double-click selected a word").not.toBe("");

  const popover = page.getByRole("dialog", { name: new RegExp(`^Dictionary: ${word}`) });
  await expect(popover).toBeVisible({ timeout: 20_000 });
  // Either a definition or the honest "no entry / lexicon not installed" state —
  // both are correct (08 §6.3). A blank popover or a crash is not.
  await expect(
    popover.getByText(
      /No dictionary entry|installing|not installed|[a-z]{3,}/,
    ).first(),
  ).toBeVisible();
  await expect(popover.getByRole("button", { name: "Add to vocabulary" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expectNoErrorBoundary(page);
});
