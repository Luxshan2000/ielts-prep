/**
 * What to say when the marking model fails — the writing sibling of
 * `speaking/components/phases.ts` `describeError()`.
 *
 * Every scored thing on this screen is one LLM call. When that call fails the
 * sidecar hands back its own words, and its own words are written for whoever is
 * holding the logs: "could not reach the language model at http://127.0.0.1:11434/v1
 * — is it running?", or a JSON-repair failure with the model's raw output quoted in
 * it. A learner cannot act on either, and both put a URL and a provider slug on a
 * screen that promised neither.
 *
 * So the upstream detail is classified and replaced. The four cases a learner can
 * actually resolve are named separately, because the action differs: nothing is set
 * up yet, the engine is not running, the key is wrong, the model is too slow. Only
 * the last two are worth a retry — retrying a model that was never started is the
 * same dead end the speaking room removed.
 */

import { ApiError } from "@/lib/api";
import { friendlyMessage, isOfflineFailure, isProviderFailure } from "@/lib/errors";

/** Which model problem this is, or `null` when the model is not the cause. */
export type ModelFailure = "unconfigured" | "unreachable" | "bad_key" | "slow" | "unusable";

const TEXT: Record<ModelFailure, string> = {
  unconfigured:
    "No language model is set up yet, so nothing can be marked. Open Settings → Providers, choose a provider and press Verify.",
  unreachable:
    "The language model that marks your writing could not be reached. Check Settings → Providers: a local engine has to be running, and a cloud model needs a valid key.",
  bad_key:
    "Your model provider rejected its key, so the marking request never ran. Open Settings → Providers, paste a working key and press Verify.",
  slow: "The language model took too long to answer. Try again — if it keeps timing out, a smaller model in Settings → Providers will be quicker on this machine.",
  unusable:
    "The language model answered, but not in a form BandReady could mark with. Try again — if it keeps happening, choose a stronger model in Settings → Providers.",
};

const OFFLINE =
  "Couldn't reach the BandReady engine. It may still be starting — wait a few seconds and retry.";

/**
 * Classify a thrown value as a model problem, or `null` if it is anything else
 * (a missing attempt, a bad request, the sidecar being down).
 */
export function modelFailure(err: unknown): ModelFailure | null {
  if (!(err instanceof ApiError)) return null;
  if (!isProviderFailure(err)) return null;
  const detail = err.detail || "";
  if (err.status === 400 || /no (language )?model|not configured|pick a provider/i.test(detail)) {
    return "unconfigured";
  }
  if (/api key|rejected the key/i.test(detail)) return "bad_key";
  if (err.status === 504 || /timed? out|did not answer within/i.test(detail)) return "slow";
  if (/could not reach|unreachable|is it running|refus|connect/i.test(detail)) return "unreachable";
  // A 502 that reached the model and disliked the answer is not an outage, and
  // saying "could not be reached" about it would claim more than we know.
  return "unusable";
}

/** True when the failure is the model itself — the screen should offer Settings. */
export function isModelFailure(err: unknown): boolean {
  return modelFailure(err) !== null;
}

/**
 * True when trying the same call again could plausibly work. A model that is not
 * configured, not running, or refusing its key will fail identically every time,
 * so the button that promises otherwise is removed rather than greyed out.
 */
export function isRetryable(failure: ModelFailure | null): boolean {
  return failure === null || failure === "slow" || failure === "unusable";
}

/** The learner-facing sentence for a classified model problem. */
export function modelFailureText(failure: ModelFailure): string {
  return TEXT[failure];
}

/**
 * Human copy for anything the writing desk throws. `fallback` is used only when the
 * failure has no diagnosis of its own — never instead of one.
 */
export function describeWritingFailure(err: unknown, fallback: string): string {
  if (isOfflineFailure(err)) return OFFLINE;
  const failure = modelFailure(err);
  if (failure) return TEXT[failure];
  return friendlyMessage(err, fallback, OFFLINE);
}
