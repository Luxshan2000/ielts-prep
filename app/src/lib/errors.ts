/**
 * One vocabulary for failure across the whole app.
 *
 * Every feature store used to flatten a thrown value into a bare string, which
 * meant a first-run learner with no model running saw the raw upstream text
 * ("could not reach the language model at http://127.0.0.1:11434/v1") and no idea
 * that the fix lives in Settings. These helpers keep the server's own words — they
 * are the most accurate thing we have — and add the one clause that says what to
 * do next.
 */

import { ApiError } from "@/lib/api";

export type FailureKind = "offline" | "provider" | "notFound" | "generic";

const PROVIDER_CODES = new Set([
  "provider_error",
  "provider_not_configured",
  "model_unavailable",
  "engine_unavailable",
]);

/** Classify any thrown value. Anything that is not an `ApiError` is `generic`. */
export function failureKind(error: unknown): FailureKind {
  if (!(error instanceof ApiError)) return "generic";
  if (error.isOffline) return "offline";
  if (PROVIDER_CODES.has(error.code)) return "provider";
  // In a local-first app a 502/503 means the engine behind the route is absent or
  // asleep — a model server that is not running, or a missing local engine.
  if (error.status === 502 || error.status === 503) return "provider";
  if (error.status === 404) return "notFound";
  return "generic";
}

/** True when the failure is "no usable model provider", so a screen can offer Settings. */
export function isProviderFailure(error: unknown): boolean {
  return failureKind(error) === "provider";
}

/** True when the sidecar process itself could not be reached. */
export function isOfflineFailure(error: unknown): boolean {
  return failureKind(error) === "offline";
}

/** The action clause appended to a message, per kind. Empty when there is nothing to add. */
const ACTION: Record<FailureKind, string> = {
  offline:
    "BandReady's local service isn't responding. Nothing is lost — it reconnects on its own, or press retry in a moment.",
  provider: "Check your model provider in Settings, then try again.",
  notFound: "",
  generic: "",
};

/**
 * Human-readable text for a thrown value.
 *
 * `fallback` is only used when the error carries no detail of its own — never
 * instead of one. Provider and offline failures gain a sentence naming the fix,
 * because those are the two a learner can actually resolve.
 */
export function friendlyMessage(
  error: unknown,
  fallback: string,
  /** Overrides the generic offline sentence when a feature has a truer one. */
  offlineText?: string,
): string {
  const kind = failureKind(error);
  if (kind === "offline") return offlineText ?? ACTION.offline;

  let detail = fallback;
  if (error instanceof ApiError) detail = error.detail || error.code || fallback;
  else if (error instanceof Error) detail = error.message || fallback;
  else if (typeof error === "string" && error.trim()) detail = error;

  const action = ACTION[kind];
  if (!action) return detail;
  // Don't repeat ourselves if the sidecar already told the learner to open Settings.
  if (/settings/i.test(detail)) return detail;
  return `${detail.replace(/\s*[.]?\s*$/, "")}. ${action}`;
}
