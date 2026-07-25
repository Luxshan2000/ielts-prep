/**
 * Speaking — the pre-call check under a fake microphone, the live screen's
 * honest connecting/error handling, and a scored session's report
 * (04-speaking-module.md §3, §7).
 *
 * Real WebRTC media is deliberately out of scope here: headless Chromium with a
 * fake device can open a peer connection, but nothing guarantees the sidecar's
 * pipeline gets far enough to produce turns. What this spec DOES guarantee is
 * that the UI never parks on a white screen or an unexplained spinner.
 */
import { expect, expectNoErrorBoundary, gotoRoute, test } from "./fixtures";

test.beforeEach(async ({ seed }) => {
  await seed.ensureOnboarded();
  await seed.selectMockProviders();
});

test("the speaking hub runs its pre-call check and starts a topic drill", async ({
  page,
  seed,
}) => {
  await gotoRoute(page, "/speaking");
  await expect(page.getByRole("heading", { name: "Speaking", exact: true })).toBeVisible();

  // --- mode picker ----------------------------------------------------------
  await page.getByRole("radio", { name: /^Topic drill/ }).click({ force: true });
  await expect(page.getByRole("radio", { name: /^Topic drill/ })).toBeChecked();

  // --- pre-call check -------------------------------------------------------
  await expect(page.getByRole("heading", { name: "Check your microphone" })).toBeVisible();
  const micTest = page.getByRole("button", { name: "Test microphone" });
  await expect(micTest).toBeEnabled();
  await micTest.click();
  // The fake device grants immediately, so the meter must report a live input
  // rather than staying on the "allow access" prompt.
  await expect(page.getByRole("status").first()).not.toContainText(
    "Allow microphone access to see your input level.",
    { timeout: 20_000 },
  );

  const start = page.getByRole("button", { name: /^Start topic drill/ });
  await expect(start).toBeEnabled();

  // --- live screen ----------------------------------------------------------
  await start.click();
  await expect(page).toHaveURL(/#\/speaking\/session\//, { timeout: 30_000 });

  // Whatever WebRTC does in headless Chromium, the screen must say where it is:
  // a phase label (Connecting / Drill — your turn / …) or a stated failure.
  const phaseOrError = page.getByText(
    /Connecting|Drill — your turn|Drill — coaching|Quick chat|Part 1|Session error|couldn't|could not|not available/i,
  );
  await expect(phaseOrError.first()).toBeVisible({ timeout: 45_000 });

  // If the call could not be established the screen must SAY so and offer a way
  // forward — never a bare spinner (12 §9). In this environment the sidecar has
  // no speech engine installed, so this is the branch that runs.
  const failure = page.getByRole("alert");
  if (await failure.first().isVisible().catch(() => false)) {
    await expect(failure.first()).toContainText(/\S/);
    await expect(
      page.getByRole("button", { name: /Try connecting again|Connect to the examiner/ }).first(),
    ).toBeVisible();
  } else {
    // A live call shows the examiner/you stage tiles and a way to end the call.
    await expect(page.getByText(/Examiner/).first()).toBeVisible();
  }
  await expectNoErrorBoundary(page);

  // Leave cleanly — the sidecar runs one session at a time.
  await seed.api.post(`/api/v1/speaking/sessions/${page.url().split("/").pop()}/end`, {
    data: { score: false },
  });
});

test("a scored session's report shows bands, criteria, transcript and vocabulary", async ({
  page,
  seed,
}) => {
  const { sessionId, reportId } = await seed.seedSpeakingReport();
  expect(reportId, "the mock scorer produced a report").toBeTruthy();

  await gotoRoute(page, `/speaking/report/${reportId}`);

  // Band scores — overall plus the four spoken criteria.
  await expect(page.getByRole("img", { name: /Band \d(\.\d)? — Overall/ })).toBeVisible({
    timeout: 30_000,
  });
  for (const criterion of ["Fluency", "Lexical", "Grammar", "Pronunciation"]) {
    await expect(page.getByText(new RegExp(criterion, "i")).first()).toBeVisible();
  }

  // The criteria accordion opens to evidence and improvements.
  const criterion = page.getByRole("button", { name: /Fluency/i }).first();
  await criterion.click();
  await expect(page.getByText(/Practise linking contrast|self-correction/i).first()).toBeVisible();

  // Transcript — the seeded turns, served by GET /sessions/{id}/transcript.
  await page.getByRole("tab", { name: "Transcript" }).click();
  await expect(page.getByText("My name is Sam Perera.").first()).toBeVisible();

  // Vocabulary suggestions — filed to the inbox, never auto-scheduled (R2-5).
  await page.getByRole("tab", { name: /Vocabulary/ }).click();
  await expect(page.getByText("commute").first()).toBeVisible();

  const suggestions = (await (
    await seed.api.get("/api/v1/vocab/suggestions")
  ).json()) as { items: { headword: string }[] };
  expect(
    suggestions.items.some((item) => item.headword.includes("commute")),
    "scoring files its vocabulary into the suggestion inbox",
  ).toBe(true);

  // The session record agrees with the screen.
  const record = (await (
    await seed.api.get(`/api/v1/speaking/sessions/${sessionId}`)
  ).json()) as { overall_band: number | null; status: string };
  expect(record.status).toBe("complete");
  expect(record.overall_band).not.toBeNull();
  await expectNoErrorBoundary(page);
});
