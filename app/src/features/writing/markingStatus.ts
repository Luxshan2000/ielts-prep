/**
 * Is there anything on this machine that can mark an essay?
 *
 * Every band this feature shows is one call to the configured LLM, and the shipped
 * default points at a local Ollama that most people have never installed. Until this
 * check existed the writing desk found that out *after* the answer: the learner chose
 * a prompt, wrote for forty minutes under a countdown, pressed Submit and only then
 * met "could not reach the language model". The mock paper was worse — a full hour and
 * two essays before the same sentence.
 *
 * So the two screens that ask for that time — the start-an-attempt modal and the mock
 * pre-flight — ask here first. The answer is `POST /api/v1/providers/verify`, which is
 * the only thing in the app that actually knows (03 §9): it opens the provider's
 * `/models`, on a four-second budget, and never throws for an endpoint that is simply
 * not there.
 *
 * Three rules this file exists to keep:
 *
 * 1. **Never invent a band.** Nothing here produces a score, a placeholder or a
 *    "sample" report. If marking cannot run, the screen says so in words.
 * 2. **Never hide the feature.** Writing practice without marking is still practice,
 *    and someone on a metered connection may be setting the model up later. The notice
 *    warns and points at Settings; it does not disable the button.
 * 3. **Never claim more than the probe knows.** A provider that answers but does not
 *    have the selected model installed is reported as exactly that, not as "ready".
 */

import { create } from "zustand";
import { api } from "@/lib/api";
import { isOfflineFailure } from "@/lib/errors";

/** `POST /providers/verify` — the subset of the result this feature reads. */
interface VerifyResult {
  ok?: boolean;
  state?: string;
  detail?: string;
  models?: string[];
  warnings?: string[];
}

export type MarkingState =
  /** Not checked yet, or the sidecar itself is down — the screen already says that. */
  | "unknown"
  | "checking"
  | "ready"
  | "unavailable";

/** What to do about it, in one sentence, appended to every `unavailable` reason. */
export const MARKING_FIX =
  "Open Settings → Providers, choose a model and press Verify. Anything you write is saved either way, so you can have it marked once a model is working.";

/**
 * Why marking cannot run, keyed by the `state` the verify route reports.
 *
 * Written for somebody whose English is the thing being tested: no URLs, no provider
 * slugs, no "HTTP", and the consequence stated before the cause.
 */
const REASON: Record<string, string> = {
  unconfigured: "No marking model has been set up yet, so nothing you write here can be scored.",
  no_key: "BandReady could not read the key for your marking model, so nothing you write here can be scored.",
  unreachable:
    "The marking model is not answering. It has to be running on this machine before an answer can be scored.",
  timeout: "The marking model is answering too slowly to finish a marking run right now.",
  unauthorized: "Your model provider rejected its key, so nothing you write here can be scored.",
  needs_download: "The marking model has not been downloaded yet, so nothing you write here can be scored.",
  error: "The marking model reported a problem, so nothing you write here can be scored.",
};

const FALLBACK_REASON =
  "BandReady could not find a working marking model, so nothing you write here can be scored.";

/** The provider answered, but the model BandReady is set to use is not installed on it. */
const MODEL_MISSING =
  "Your model provider is running, but the model BandReady is set to use is not installed on it, so marking would fail.";

/**
 * A verify result that says `ok` but carries a "not in server list" warning is the
 * single most common half-configured state: Ollama installed, the default `qwen3:14b`
 * never pulled. Calling that "ready" is the lie this whole module exists to avoid.
 */
function modelMissing(result: VerifyResult): boolean {
  return (result.warnings ?? []).some((w) => /not in server list/i.test(w));
}

export function describeVerify(result: VerifyResult): { state: MarkingState; reason: string | null } {
  if (result.ok && !modelMissing(result)) return { state: "ready", reason: null };
  if (result.ok) return { state: "unavailable", reason: MODEL_MISSING };
  return {
    state: "unavailable",
    reason: REASON[result.state ?? ""] ?? FALLBACK_REASON,
  };
}

/** How long a result is trusted before the next screen re-probes. */
const FRESH_MS = 60_000;

interface MarkingStatusState {
  state: MarkingState;
  /** Plain-English reason marking cannot run. `null` unless `state` is `unavailable`. */
  reason: string | null;
  checkedAt: number;
  /** Probe unless a recent answer is already in hand. */
  check: (force?: boolean) => Promise<void>;
}

let inFlight: Promise<void> | null = null;

export const useMarkingStatus = create<MarkingStatusState>((set, get) => ({
  state: "unknown",
  reason: null,
  checkedAt: 0,

  check: async (force = false) => {
    const { state, checkedAt } = get();
    if (!force && state !== "unknown" && Date.now() - checkedAt < FRESH_MS) return;
    if (inFlight) return inFlight;

    set({ state: "checking" });
    inFlight = (async () => {
      try {
        const result = await api.post<VerifyResult>("/api/v1/providers/verify", {
          modality: "llm",
        });
        set({ ...describeVerify(result ?? {}), checkedAt: Date.now() });
      } catch (err) {
        // The sidecar being down is a different problem with its own banner on every
        // screen that calls this. Claiming "marking is unavailable" on top of it would
        // send the learner to Settings to fix something that is not broken.
        if (isOfflineFailure(err)) {
          set({ state: "unknown", reason: null, checkedAt: 0 });
          return;
        }
        set({
          state: "unavailable",
          reason: FALLBACK_REASON,
          checkedAt: Date.now(),
        });
      } finally {
        inFlight = null;
      }
    })();

    await inFlight;
  },
}));
