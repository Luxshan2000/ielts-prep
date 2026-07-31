/**
 * The sidecar contract this feature consumes.
 *
 * Everything the Grammar & Usage screens need comes through the nine calls
 * below. They extend the five endpoints named in the module design
 * (`content/core-en/staging-grammar/DESIGN.md` §5.4 and D5) with the four the
 * screens genuinely cannot do without — the path, the progress rollup, the
 * contrast boards, and the sentence-level vocabulary surface — and nothing else.
 *
 *   GET  /api/v1/grammar/path                     → PathResponse
 *   GET  /api/v1/grammar/points/{id}              → PointDetail
 *   POST /api/v1/grammar/session                  → SessionResponse
 *   POST /api/v1/grammar/answer                   → AnswerResult
 *   POST /api/v1/grammar/session/{id}/finish      → { ok: true }
 *   GET  /api/v1/grammar/progress                 → ProgressResponse
 *   GET  /api/v1/grammar/boards                   → { boards: BoardSummary[] }
 *   GET  /api/v1/grammar/boards/{id}              → BoardDetail
 *   GET  /api/v1/grammar/patterns                 → PatternsResponse
 *   POST /api/v1/grammar/rules                    → { ok: true }   (F14)
 *
 * TWO PROPERTIES THE UI DEPENDS ON, stated here so they cannot drift:
 *
 * 1. **Grading is server-authoritative.** `POST /answer` decides right and wrong.
 *    The client sends what the learner did and renders what comes back. That is
 *    what lets the answer keys stay out of the session payload, and it is what
 *    keeps one grading policy (DESIGN §2.9) instead of two.
 *
 * 2. **The reveal is withheld on the first attempt of a retryable item.** F3's
 *    three beats are signal → elicit → reveal, so a wrong first attempt returns
 *    `{correct: false, reveal: null}` and the learner answers again. The second
 *    attempt, or any attempt on a non-retryable kind, returns the full reveal and
 *    `committed: true`.
 *
 * If the module has not been installed the routes 404. `isModuleMissing` turns
 * that into a first-class screen state rather than an error card, because "the
 * grammar pack is not in this build yet" is not a failure the learner caused.
 */

import { ApiError, api } from "@/lib/api";
import type {
  AnswerResult,
  BoardDetail,
  BoardSummary,
  ItemKind,
  PathResponse,
  PatternsResponse,
  PointDetail,
  ProgressResponse,
  SessionResponse,
} from "./types";

const BASE = "/api/v1/grammar";

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * True when the sidecar has no grammar routes at all, or has them but no content.
 *
 * A 404 on `/grammar/path` means one of two things and both need the same screen:
 * the sidecar predates the module, or the content pack does not carry
 * `grammar.jsonl`. Either way there is nothing to study and nothing the learner
 * can fix by retrying.
 */
export function isModuleMissing(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

// ------------------------------------------------------------------ path ----

export function fetchPath(): Promise<PathResponse> {
  return api.get<PathResponse>(`${BASE}/path`);
}

export function fetchPoint(pointId: string): Promise<PointDetail> {
  return api.get<PointDetail>(`${BASE}/points/${encodeURIComponent(pointId)}`);
}

// --------------------------------------------------------------- session ----

/** Every way a session can be assembled. Exactly one selector is ever set. */
export interface SessionRequest {
  /** Study one point end to end, starting at whatever rung it is on. */
  point_id?: string;
  /** Drill one error code across every point that carries it (F4). */
  code?: string;
  /** Drill one contrast, from every member point's stage-3 bank (F6). */
  board_id?: string;
  /** The mixed daily queue: grammar and vocabulary interleaved (F9). */
  mode?: "point" | "daily" | "code" | "board" | "placement";
  limit?: number;
}

export function startSession(request: SessionRequest): Promise<SessionResponse> {
  return api.post<SessionResponse>(`${BASE}/session`, request);
}

export interface AnswerRequest {
  session_id: string;
  item_id: string;
  point_id: string;
  kind: ItemKind;
  /**
   * What the learner did, in the shape the kind produces:
   *   interpret / judge / choose_form / both_ok → the chosen index
   *   contrast_pair                             → one index per sentence
   *   order                                     → the token indices, in order
   *   gap_fill / transform / error_fix /
   *   dictation / produce / combine             → the text they typed
   *   both_ok follow-up                         → `follow_up` carries the index
   */
  answer: string | number | number[] | null;
  follow_up?: number | null;
  /** 1 on the first try, 2 after the elicit beat. */
  attempt: number;
  hint_used?: boolean;
  elapsed_ms?: number;
  /** Set on `dictation` when the learner replayed — logged, never punished. */
  replays?: number;
  /** S1 only: the learner's own rating, which is the one place we ask (§1.8). */
  self_rating?: number | null;
}

export function submitAnswer(request: AnswerRequest): Promise<AnswerResult> {
  return api.post<AnswerResult>(`${BASE}/answer`, request);
}

/**
 * The appeal (DESIGN §2.9). One text field, re-run with the learner's own gloss.
 * A module that cannot be told it is wrong stays wrong.
 */
export function appealAnswer(request: {
  session_id: string;
  item_id: string;
  meant: string;
}): Promise<AnswerResult> {
  return api.post<AnswerResult>(`${BASE}/appeal`, request);
}

export function finishSession(sessionId: string): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(`${BASE}/session/${encodeURIComponent(sessionId)}/finish`, {});
}

// -------------------------------------------------------------- progress ----

export function fetchProgress(): Promise<ProgressResponse> {
  return api.get<ProgressResponse>(`${BASE}/progress`);
}

// ---------------------------------------------------------------- boards ----

export function fetchBoards(): Promise<{ boards: BoardSummary[] }> {
  return api.get<{ boards: BoardSummary[] }>(`${BASE}/boards`);
}

export function fetchBoard(boardId: string): Promise<BoardDetail> {
  return api.get<BoardDetail>(`${BASE}/boards/${encodeURIComponent(boardId)}`);
}

// -------------------------------------------------------------- patterns ----

export interface PatternsQuery {
  q?: string;
  /** `chunk`, `frame`, `collocation`, or empty for everything with a v2 payload. */
  unit_type?: string;
  /** Only the entries linked to one grammar point. */
  point_id?: string;
  /** Only entries that carry a welded preposition — the collocation drill source. */
  with_preposition?: boolean;
  limit?: number;
}

export function fetchPatterns(params: PatternsQuery = {}): Promise<PatternsResponse> {
  return api.get<PatternsResponse>(`${BASE}/patterns${query({ ...params })}`);
}

// ----------------------------------------------------------- rule sheet ----

/** F14 — "Add to my rules", from a revealed rule line or a wrong sentence. */
export function addRule(request: {
  point_id: string;
  rule_line: string;
  learner_sentence?: string | null;
  correction?: string | null;
}): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(`${BASE}/rules`, request);
}
