/**
 * Client for `/api/v1/reading/practice`.
 *
 * Three things about this surface are not obvious from the endpoint list:
 *
 * 1. **A set is a function of its seed, and the server stores nothing.** `buildSet`
 *    returns a `seed`; `gradeSet` must send it back along with the same filters, or the
 *    server rebuilds a different set and refuses the responses. `RunnerParams` exists so
 *    the two calls cannot drift.
 * 2. **The key is not in the set.** Nothing here can reveal an answer client-side,
 *    because nothing here ever received one. Reveals arrive from `gradeSet`.
 * 3. **409 is not an error to retry.** It means a reading mock is open, and the whole
 *    coaching surface is deliberately shut until the sitting ends.
 */

import { ApiError, api } from "@/lib/api";
import type {
  Catalogue,
  DrillKind,
  DrillKindInfo,
  DrillReport,
  DrillResponse,
  DrillSet,
  ExplainBack,
  TrapCatalogue,
} from "./types";

const BASE = "/api/v1/reading/practice";

/** Thrown when an exam-conditions reading attempt is open. Carries the server's words. */
export class MockInProgressError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "MockInProgressError";
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
    throw new MockInProgressError(err.detail || "A reading mock is in progress.");
  }
  if (err instanceof ApiError && err.status === 404) {
    throw new NoContentError(err.detail || "This pack cannot build that drill yet.");
  }
  throw err;
}

/**
 * Everything a set build and its grade must agree on. Keep this object intact for the
 * whole run: changing `size` between the two calls changes the set.
 */
export interface RunnerParams {
  kind: DrillKind;
  qtype?: string | null;
  trap?: string | null;
  passage_id?: string | null;
  format?: "academic" | "general_training" | null;
  size: number;
  bounded?: boolean;
  two_stage?: boolean;
}

function body(params: RunnerParams): Record<string, unknown> {
  return {
    kind: params.kind,
    qtype: params.qtype ?? null,
    trap: params.trap ?? null,
    passage_id: params.passage_id ?? null,
    format: params.format ?? null,
    size: params.size,
    bounded: Boolean(params.bounded),
    two_stage: Boolean(params.two_stage),
  };
}

/** The four kinds and what each one trains. Static — safe to fetch once. */
export async function fetchKinds(): Promise<DrillKindInfo[]> {
  const doc = await api.get<{ kinds?: DrillKindInfo[] }>(`${BASE}/kinds`);
  return doc.kinds ?? [];
}

/** What this pack can actually drill, counted rather than assumed. */
export async function fetchCatalogue(format?: string | null): Promise<Catalogue> {
  const query = format ? `?format=${encodeURIComponent(format)}` : "";
  try {
    return await api.get<Catalogue>(`${BASE}/catalogue${query}`);
  } catch (err) {
    rethrow(err);
  }
}

/** The taxonomy, the bank's coverage of it, and the learner's own losses. */
export async function fetchTraps(): Promise<TrapCatalogue> {
  try {
    return await api.get<TrapCatalogue>(`${BASE}/traps`);
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
 * `record: false` is what makes the answer-then-reveal loop possible: the runner probes
 * one item at a time to open its reveal immediately — which is the whole shape of a trap
 * drill — and only the final call, carrying every response, writes the drill row. The
 * server is stateless, the marking is deterministic and local, and one `drill_results`
 * row per set is what the progress screen expects.
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
 * Ask the model whether the learner's own sentence gives the same reason as the authored
 * decision rule. The only judgement call in the surface, and it runs *after* the
 * mechanical verdict — it can never change whether the answer was right.
 */
export async function explainBack(input: {
  questionId: string;
  sentence: string;
  selfTrap?: string | null;
}): Promise<ExplainBack> {
  try {
    return await api.post<ExplainBack>(`${BASE}/explain-back`, {
      question_id: input.questionId,
      sentence: input.sentence,
      self_trap: input.selfTrap ?? null,
    });
  } catch (err) {
    rethrow(err);
  }
}
