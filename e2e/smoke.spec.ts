/**
 * Whole-app smoke: every sidebar destination, in both themes, with a clean
 * console. This is the spec that catches "one screen throws and nobody noticed".
 */
import type { Page } from "@playwright/test";
import { expect, expectNoErrorBoundary, gotoRoute, test } from "./fixtures";

/** Every labelled route the sidebar exposes, plus the unlisted wizard. */
const DESTINATIONS = [
  { path: "/", label: "Home" },
  { path: "/speaking", label: "Speaking" },
  { path: "/writing", label: "Writing" },
  { path: "/reading", label: "Reading" },
  { path: "/listening", label: "Listening" },
  { path: "/vocab", label: "Vocabulary" },
  { path: "/progress", label: "Progress" },
  { path: "/settings", label: "Settings" },
];

async function setTheme(page: Page, theme: "dark" | "light"): Promise<void> {
  await page.evaluate((value) => {
    const root = document.documentElement;
    root.classList.toggle("dark", value === "dark");
    root.setAttribute("data-theme", value);
    try {
      window.localStorage.setItem("br-theme", value);
    } catch {
      /* private mode — the class above is what the styles read */
    }
  }, theme);
}

test.beforeEach(async ({ seed }) => {
  await seed.ensureOnboarded();
  await seed.selectMockProviders();
});

test("every sidebar destination renders without console errors", async ({
  page,
  errors,
}) => {
  await gotoRoute(page, "/");

  for (const destination of DESTINATIONS) {
    // Navigate the way a learner does — by clicking the sidebar link.
    // The Vocabulary link carries a due-count badge, so match on the leading label.
    await page.getByRole("link", { name: new RegExp(`^${destination.label}`) }).click();
    await expect(page.locator("main")).toBeVisible();
    // Something real must be on screen: every page owns an <h1>.
    await expect(page.locator("main h1").first()).toBeVisible({ timeout: 30_000 });
    await expectNoErrorBoundary(page);
    // No route may leave the app on the "page not found" fallback.
    await expect(page.getByText("The link you followed points at a screen")).toHaveCount(0);
  }

  // The unlisted wizard is reachable directly and must render too.
  await gotoRoute(page, "/onboarding");
  await expect(page.getByRole("list", { name: "Setup progress" })).toBeVisible();
  await expectNoErrorBoundary(page);

  expect(errors.uncaught, "no uncaught exceptions or unhandled rejections").toEqual([]);
  expect(errors.console, "no console errors").toEqual([]);
});

test("every destination is legible in both themes", async ({ page, errors }) => {
  for (const theme of ["dark", "light"] as const) {
    await gotoRoute(page, "/");
    await setTheme(page, theme);

    for (const destination of DESTINATIONS) {
      await gotoRoute(page, destination.path);
      await setTheme(page, theme);
      await expect(page.locator("main h1").first()).toBeVisible({ timeout: 30_000 });
      await expectNoErrorBoundary(page);

      // The theme really applied, and the page paints its own background rather
      // than falling through to the browser default.
      const applied = await page.evaluate(() => ({
        dark: document.documentElement.classList.contains("dark"),
        background: getComputedStyle(document.body).backgroundColor,
        color: getComputedStyle(document.body).color,
      }));
      expect(applied.dark).toBe(theme === "dark");
      expect(applied.background, `${destination.path} paints a background in ${theme}`).not.toBe(
        "rgba(0, 0, 0, 0)",
      );
      expect(applied.color).not.toBe(applied.background);
    }
  }

  expect(errors.uncaught, "no uncaught exceptions in either theme").toEqual([]);
  expect(errors.console, "no console errors in either theme").toEqual([]);
});
