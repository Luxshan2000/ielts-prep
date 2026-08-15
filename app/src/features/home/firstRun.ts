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
 * `GET /progress/summary` nor `GET /settings` exposes it. Until it is, the
 * deferral below is the browser's opinion, not the profile's — a learner who
 * clears site data, or moves to a second machine, is offered setup again.)
 *
 * The deferral is deliberately *soft* in two ways. It only stops the automatic
 * redirect — the wizard stays reachable at `/onboarding`, and
 * `resumeOnboarding()` clears it for any screen that wants to offer setup again.
 * And it *expires*: a learner who pressed "Not now" once and still has no plan a
 * week later is offered setup again rather than left on a dashboard of dashes
 * for good, which is the state a permanent flag used to strand them in.
 */

import type { ProgressSummary } from "./types";

const SKIP_KEY = "br-onboarding-skipped";
const SKIP_AT_KEY = "br-onboarding-skipped-at";

/** How long "Not now" holds before the app offers setup again. */
export const DEFERRAL_DAYS = 7;

const DEFERRAL_MS = DEFERRAL_DAYS * 24 * 60 * 60 * 1000;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode — the learner will be offered the wizard again next launch */
  }
}

/**
 * True when the learner chose "Not now" on the wizard and that choice is still
 * inside its window.
 *
 * A flag written by an older build carries no timestamp. Rather than honour it
 * forever, we stamp it on first read so it starts ageing from now — the learner
 * keeps the deferral they asked for and still gets offered setup again later.
 */
export function onboardingDeferred(): boolean {
  if (read(SKIP_KEY) !== "1") return false;
  const at = read(SKIP_AT_KEY);
  if (at === null) {
    write(SKIP_AT_KEY, new Date().toISOString());
    return true;
  }
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) return true;
  return Date.now() - ms < DEFERRAL_MS;
}

/** When the wizard was deferred, ISO-8601, or `null` if it never was. */
export function onboardingDeferredAt(): string | null {
  return onboardingDeferred() ? read(SKIP_AT_KEY) : null;
}

/** Remember that the wizard was deferred so the redirect stops firing. */
export function deferOnboarding(): void {
  write(SKIP_KEY, "1");
  write(SKIP_AT_KEY, new Date().toISOString());
}

/** Forget the deferral (used when the wizard is completed or re-run). */
export function clearOnboardingDeferral(): void {
  try {
    window.localStorage.removeItem(SKIP_KEY);
    window.localStorage.removeItem(SKIP_AT_KEY);
  } catch {
    /* nothing to do — the flag is a convenience, not a source of truth */
  }
}

/**
 * Undo a deferral so the app offers setup again. Any screen with a "Run setup
 * again" action should call this before navigating to `/onboarding`, otherwise
 * leaving the wizard half-way drops the learner back on a dashboard of dashes
 * with nothing telling them setup is unfinished.
 */
export function resumeOnboarding(): void {
  clearOnboardingDeferral();
}

/** A profile that has never generated a study plan has never been onboarded. */
export function needsOnboarding(summary: ProgressSummary | null): boolean {
  if (summary === null) return false;
  return summary.plan_id === null && !onboardingDeferred();
}

/**
 * Setup is unfinished — no plan exists — whether or not the learner deferred.
 * Unlike `needsOnboarding` this stays true after a deferral, so a screen can
 * keep offering the way back in without hijacking navigation.
 */
export function onboardingUnfinished(summary: ProgressSummary | null): boolean {
  return summary !== null && summary.plan_id === null;
}
