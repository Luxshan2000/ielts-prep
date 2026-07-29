/**
 * Vocabulary + SRS — the suggestion inbox is opt-in (R2-5), accepting schedules
 * a card immediately, and a review session moves the FSRS state
 * (08-vocabulary-srs.md §4, §5, §8).
 */
import { expect, expectNoErrorBoundary, gotoRoute, test } from "./fixtures";

interface VocabStats {
  due_today: number;
  due_now: number;
  reviews_today: number;
  counts: { suggested: number; active: number; entries: number };
}

const stats = async (api: { get(path: string): Promise<{ json(): Promise<unknown> }> }) =>
  (await (await api.get("/api/v1/vocab/stats")).json()) as VocabStats;

test.beforeEach(async ({ seed }) => {
  await seed.ensureOnboarded();
  await seed.selectMockProviders();
});

test("accepting a suggestion schedules it, and a review session clears the queue", async ({
  page,
  seed,
}) => {
  // Unique terms keep the spec independent of anything already in the bank —
  // `POST /vocab/suggestions` skips a term that is already an entry.
  const stamp = Date.now().toString(36);
  const terms = [`mitigate${stamp}`, `prevalent${stamp}`, `curtail${stamp}`];
  await seed.seedVocabSuggestions(terms);
  const before = await stats(seed.api);
  expect(before.counts.suggested).toBeGreaterThanOrEqual(terms.length);
  const dueBaseline = before.due_today;

  await gotoRoute(page, "/vocab");
  await expect(page.getByRole("heading", { name: "Vocabulary" })).toBeVisible();

  // --- inbox: accept one word ----------------------------------------------
  await page.getByRole("tab", { name: "Inbox" }).click();
  await expect(page.getByText(terms[0]).first()).toBeVisible();
  const accepted = page.waitForResponse(
    (res) => res.url().includes("/suggestions/") && res.url().endsWith("/accept"),
  );
  await page.getByRole("button", { name: "Accept", exact: true }).first().click();
  expect((await accepted).ok()).toBe(true);

  // An accepted word becomes a NEW card that is due today (it has never been
  // reviewed, so `due_now` — which counts overdue reviews — stays at 0).
  await expect
    .poll(async () => (await stats(seed.api)).due_today, {
      message: "an accepted word is scheduled immediately (08 §4.1)",
      timeout: 20_000,
    })
    .toBeGreaterThan(dueBaseline);

  // Accept the rest so the session has something to work with.
  //
  // The confirmation's own button carries the SAME accessible name as the trigger, so a
  // page-wide `.last()` is a race: between the count assertion and the click the list can
  // re-resolve to the inbox button, which reopens the dialog instead of answering it and
  // leaves an overlay that swallows every later click. Scope each click to the element
  // that owns it — the panel for the trigger, the dialog for the confirmation.
  const inbox = page.getByRole("tabpanel", { name: /inbox/i });
  const dialog = page.getByRole("dialog");
  await inbox.getByRole("button", { name: "Accept all" }).click();
  await dialog.getByRole("button", { name: "Accept all" }).click();
  // Inbox emptied and the dialog closed.
  await expect(dialog).toHaveCount(0);
  await expect(inbox.getByRole("button", { name: "Accept all" })).toHaveCount(0);
  await expect
    .poll(async () => (await stats(seed.api)).due_today, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(dueBaseline + terms.length);

  // --- review: the tile reflects the queue ---------------------------------
  await page.getByRole("tab", { name: "Review" }).click();
  const dueBefore = (await stats(seed.api)).due_today;
  const startReview = page.getByRole("button", { name: /^Review \d+ cards?$/ });
  await expect(startReview).toBeEnabled();
  await startReview.click();
  await expect(page).toHaveURL(/#\/vocab\/review$/);

  // --- rate the first card with the mouse ----------------------------------
  const reveal = page.getByRole("button", { name: /Show answer|Check|Reveal/ }).first();
  if (await reveal.isVisible().catch(() => false)) await reveal.click();
  const good = page.getByRole("button", { name: /^Good — next in/ });
  await expect(good).toBeVisible();
  const firstReview = page.waitForResponse(
    (res) => res.url().endsWith("/api/v1/srs/review") && res.request().method() === "POST",
  );
  await good.click();
  expect((await firstReview).ok()).toBe(true);

  // --- and the second with the keyboard ------------------------------------
  const secondReview = page.waitForResponse(
    (res) => res.url().endsWith("/api/v1/srs/review") && res.request().method() === "POST",
  );
  await page.keyboard.press("Space"); // reveal
  await page.keyboard.press("3"); // Good
  expect((await secondReview).ok()).toBe(true);

  // --- the queue really moved ----------------------------------------------
  await expect
    .poll(async () => (await stats(seed.api)).reviews_today, {
      message: "both ratings are logged against today",
      timeout: 20_000,
    })
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(async () => (await stats(seed.api)).due_today, {
      message: "rated cards leave the due queue",
      timeout: 20_000,
    })
    .toBeLessThan(dueBefore);

  await expectNoErrorBoundary(page);
});
