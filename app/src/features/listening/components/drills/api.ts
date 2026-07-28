/**
 * Client for `/api/v1/listening/practice`.
 *
 * Three things about this surface are not obvious from the endpoint list:
 *
 * 1. **A set is a function of its seed, and the server stores nothing.** `buildSet` returns
 *    a `seed`; `gradeSet` must send it back with the same filters, or the server rebuilds a
 *    different set and refuses the responses. `RunnerParams` exists so the two calls cannot
 *    drift apart.
 * 2. **409 is not an error to retry, and it means two different things.** A listening mock
 *    is open (`MockInProgressError`) — the coaching surface is deliberately shut until the
 *    sitting ends; or the script has never been synthesized (`NeedsAudioError`) — which is
 *    a one-click fix on a screen the app already has, so it is a separate class the UI can
 *    offer the render button for.
 * 3. **The key is not in the set.** Nothing here can reveal an answer client-side because
 *    nothing here ever received one. Reveals arrive from `gradeSet`.
 */

import { ApiError, api } from "@/lib/api";
import type {
  BucketProfile,
  Catalogue,
  DrillKind,
  DrillReport,
  DrillResponse,
  DrillSet,
  KindsDoc,
  SynonymCheck,
} from "./types";

const BASE = "/api/v1/listening/practice";

/** Thrown when an exam-conditions listening attempt is open. Carries the server's words. */
export class MockInProgressError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "MockInProgressError";
  }
}

/** Thrown when the script exists but has never been rendered. Recoverable in one click. */
export class NeedsAudioError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "NeedsAudioError";
  }
}

/** Thrown when the pack cannot build the requested drill. The detail says why. */
export class NoContentError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "NoContentError";
  }
}

function rethrow(err: unknown): never {
  if (err instanceof ApiError && err.status === 409) {
    // The two 409s are told apart by the server's own wording rather than by a second
    // status code, because both are genuinely "the state is wrong, not the request".
    if (/rendered yet|Prepare the audio/i.test(err.detail || "")) {
      throw new NeedsAudioError(err.detail);
    }
    throw new MockInProgressError(err.detail || "A listening mock is in progress.");
  }
  if (err instanceof ApiError && err.status === 404) {
    throw new NoContentError(err.detail || "This pack cannot build that drill yet.");
  }
  throw err;
}

/**
 * Everything a set build and its grade must agree on. Keep this object intact for the whole
 * run: changing `size` between the two calls changes the set.
 */
export interface RunnerParams {
  kind: DrillKind;
  script_id?: string | null;
  part?: number | null;
  accent_set?: string | null;
  mode?: string | null;
  size: number;
}

function body(params: RunnerParams): Record<string, unknown> {
  return {
    kind: params.kind,
    script_id: params.script_id ?? null,
    part: params.part ?? null,
    accent_set: params.accent_set ?? null,
    mode: params.mode ?? null,
    size: params.size,
  };
}

/** The four kinds, the bucket taxonomy and the honesty note. Static — fetch once. */
export async function fetchKinds(): Promise<KindsDoc> {
  return api.get<KindsDoc>(`${BASE}/kinds`);
}

/** What this pack can actually drill, counted rather than assumed. */
export async function fetchCatalogue(filters: {
  part?: number | null;
  accentSet?: string | null;
} = {}): Promise<Catalogue> {
  const query = new URLSearchParams();
  if (filters.part) query.set("part", String(filters.part));
  if (filters.accentSet) query.set("accent_set", filters.accentSet);
  const suffix = query.toString() ? `?${query}` : "";
  try {
    return await api.get<Catalogue>(`${BASE}/catalogue${suffix}`);
  } catch (err) {
    rethrow(err);
  }
}

/** Which kind of word this learner keeps dropping, across recent sessions. */
export async function fetchProfile(): Promise<BucketProfile> {
  try {
    return await api.get<BucketProfile>(`${BASE}/profile`);
  } catch (err) {
    rethrow(err);
  }
}

/** Build one set. The returned `seed` is required to grade it. */
export async function buildSet(params: RunnerParams, seed?: string): Promise<DrillSet> {
  try {
    return await api.post<DrillSet>(`${BASE}/sets`, {
      ...body(params),
      ...(seed ? { seed } : {}),
    });
  } catch (err) {
    rethrow(err);
  }
}

/**
 * Mark the set, open every reveal, and (by default) record the result.
 *
 * `record: false` is what makes the answer-then-reveal loop possible: the runner re-posts
 * the responses so far to open one item's reveal immediately — which is the whole shape of
 * the exercise — and only the final call, carrying every response, writes the drill row. The
 * server is stateless and the marking is deterministic, so this costs nothing and one set
 * still produces exactly one `drill_results` row.
 */
export async function gradeSet(
  params: RunnerParams,
  seed: string,
  responses: DrillResponse[],
  options: { durationS?: number; record?: boolean } = {},
): Promise<DrillReport> {
  const { durationS, record = true } = options;
  try {
    return await api.post<DrillReport>(`${BASE}/grade`, {
      ...body(params),
      seed,
      responses,
      record,
      ...(durationS != null ? { duration_s: Math.max(0, Math.round(durationS)) } : {}),
    });
  } catch (err) {
    rethrow(err);
  }
}

/**
 * Ask the model whether the learner's guesses are plausible spoken forms of a printed
 * phrase. The only judgement call in the surface, and it runs after the mechanical slot
 * verdict — it can never change whether the prediction was right.
 */
export async function checkSynonyms(input: {
  scriptId: string;
  number: number;
  printed: string;
  guesses: string[];
}): Promise<SynonymCheck> {
  try {
    return await api.post<SynonymCheck>(`${BASE}/synonym`, {
      script_id: input.scriptId,
      number: input.number,
      printed: input.printed,
      guesses: input.guesses,
    });
  } catch (err) {
    rethrow(err);
  }
}
