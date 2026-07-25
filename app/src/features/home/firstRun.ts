/**
 * First-run detection (10 §2).
 *
 * `App.tsx` is auto-generated territory, so the redirect lives here: the
 * dashboard is the app's entry route, and it forwards a brand-new profile to
 * `/onboarding` itself.
 *
 * The signal is `plan_id`. Every path out of onboarding writes a plan —
 * `POST /placement/complete` and `POST /placement/skip` both call
 * `generate_plan()` and both stamp `profiles.onboarded_at` — so "no plan has
 * ever been generated" is exactly "this learner has not been through the
 * wizard". (`onboarded_at` itself is not on the wire: neither
 * `GET /progress/summary` nor `GET /settings` exposes it.)
 */

import type { ProgressSummary } from "./types";

const SKIP_KEY = "br-onboarding-skipped";

/** True when the learner chose "I'll set this up later" on the wizard. */
export function onboardingDeferred(): boolean {
  try {
    return window.localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remember that the wizard was deferred so the redirect stops firing. */
export function deferOnboarding(): void {
  try {
    window.localStorage.setItem(SKIP_KEY, "1");
  } catch {
    /* private mode — the learner will be offered the wizard again next launch */
  }
}

/** Forget the deferral (used when the wizard is completed or re-run). */
export function clearOnboardingDeferral(): void {
  try {
    window.localStorage.removeItem(SKIP_KEY);
  } catch {
    /* nothing to do — the flag is a convenience, not a source of truth */
  }
}

/** A profile that has never generated a study plan has never been onboarded. */
export function needsOnboarding(summary: ProgressSummary | null): boolean {
  if (summary === null) return false;
  return summary.plan_id === null && !onboardingDeferred();
}
