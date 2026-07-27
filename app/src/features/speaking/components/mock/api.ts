/**
 * Network access for the mock exam, kept separate from the practice store so the
 * sitting can never accidentally reach a coaching endpoint.
 *
 * A mock sitting IS a `full_mock` speaking session (04 §2) — it streams and ends
 * through exactly the WebRTC routes the practice room already uses. But it is *opened*
 * and *marked* through `/api/v1/speaking/mock/*`, and that is not a detail:
 *
 *   - opening there is what assembles a coherent sitting (Part 3 descending from the
 *     Part 2 card that was set, an obligatory personal Part 1 frame, real timings);
 *   - opening there is also what registers the sitting in `speaking_mocks`, and that
 *     row is the *only* thing that puts the server under exam conditions. While it is
 *     `in_progress` the coach refuses model answers, plans, the language bank and the
 *     drills — for every client, not just this screen. Start a mock through the plain
 *     `/sessions` route and the learner sits a "mock" with the whole teaching layer one
 *     sidebar click away, which is the one thing this mode exists to prevent;
 *   - marking there is what closes that row again and reopens the coach, as well as
 *     producing the whole-test framing the report screen shows.
 */

import { api, ApiError } from "@/lib/api";
import type { SessionRecord, StartedSession } from "../../store";

/** One card in the set the mock was built from — enough to name it and link to it. */
export interface SetCard {
  id: string;
  part: number;
  title: string;
}

export interface SetOutline {
  id: string;
  title: string;
  cards: SetCard[];
}

/** The half of `POST /mock/sessions` this screen needs. The rest is the plan. */
interface StartedMock {
  session_id: string;
  state?: string;
  offer_url?: string;
  events_url?: string;
  sitting?: { card_set_id?: string | null; card_set_title?: string | null };
}

/**
 * `POST /api/v1/speaking/mock/sessions` — assemble the sitting and open it live.
 *
 * `live: true` asks the server to register the WebRTC session too, so the returned
 * `offer_url` / `events_url` are the same ones the practice room signals through and
 * `MockSitting` needs no second signalling path. The response is a mock *plan*, so it
 * is adapted here to the `StartedSession` shape the session store speaks.
 */
export async function startMockSession(
  cardSetId: string | null,
  opts: { difficulty?: string | null; frames?: number } = {},
): Promise<StartedSession> {
  const payload: Record<string, unknown> = { live: true };
  if (cardSetId) payload.card_set_id = cardSetId;
  if (opts.difficulty) payload.difficulty = opts.difficulty;
  if (opts.frames) payload.frames = opts.frames;

  const doc = await api.post<StartedMock>("/api/v1/speaking/mock/sessions", payload);
  const id = doc.session_id;
  return {
    session_id: id,
    mode: "mock",
    activity: "full_mock",
    part: null,
    card_set_id: doc.sitting?.card_set_id ?? null,
    card_set_title: doc.sitting?.card_set_title ?? null,
    state: (doc.state ?? "CONNECTING") as StartedSession["state"],
    offer_url: doc.offer_url ?? `/api/v1/speaking/sessions/${encodeURIComponent(id)}/offer`,
    events_url: doc.events_url ?? `/api/v1/speaking/sessions/${encodeURIComponent(id)}/events`,
  };
}

/**
 * Walk out without marking. This has to run even when the hang-up failed: the
 * `speaking_mocks` row is what holds the coach shut, so an abandoned sitting that is
 * never closed locks the teaching layer for good.
 */
export async function abandonMock(sessionId: string): Promise<void> {
  try {
    await api.post(`/api/v1/speaking/mock/sessions/${encodeURIComponent(sessionId)}/abandon`);
  } catch {
    // Already closed, already marked, or never registered — nothing to reopen.
  }
}

/**
 * Hang up. Scoring is a separate call so a failure to score never loses the
 * transcript — the wrap-up screen can retry it on its own.
 */
export async function hangUp(sessionId: string): Promise<number> {
  const res = await api.post<{ turns?: number }>(
    `/api/v1/speaking/sessions/${encodeURIComponent(sessionId)}/hangup`,
    { score: false },
  );
  return res?.turns ?? 0;
}

/**
 * `POST /mock/sessions/{id}/score`. Idempotent server-side, so this doubles as the
 * retry. Marking through the mock route is what finalises the sitting — one band for
 * the whole test, evidence attributed to the part it was spoken in — and what closes
 * the `speaking_mocks` row, which is what reopens the coach afterwards.
 */
export async function scoreSession(
  sessionId: string,
  opts: { force?: boolean } = {},
): Promise<string | null> {
  const query = opts.force ? "?force=true" : "";
  const report = await api.post<{ report_id?: string }>(
    `/api/v1/speaking/mock/sessions/${encodeURIComponent(sessionId)}/score${query}`,
  );
  return report?.report_id ?? null;
}

export async function fetchSessionRecord(sessionId: string): Promise<SessionRecord> {
  return api.get<SessionRecord>(`/api/v1/speaking/sessions/${encodeURIComponent(sessionId)}`);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * The topic set behind a sitting, reduced to ids and titles.
 *
 * A missing set is not an error: single-part fallbacks and the built-in bundle have
 * no `card_sets` row at all, in which case the report simply shows no card links.
 * Anything the shape does not match is dropped rather than guessed at.
 */
export async function fetchSetOutline(setId: string): Promise<SetOutline | null> {
  try {
    const doc = await api.get<Record<string, unknown>>(
      `/api/v1/speaking/card-sets/${encodeURIComponent(setId)}`,
    );
    const rawCards = Array.isArray(doc.cards) ? doc.cards : [];
    const cards: SetCard[] = [];
    for (const raw of rawCards) {
      if (typeof raw !== "object" || raw === null) continue;
      const row = raw as Record<string, unknown>;
      const id = asString(row.id);
      const part = typeof row.part === "number" ? row.part : Number(row.part);
      if (!id || !Number.isFinite(part)) continue;
      cards.push({ id, part, title: asString(row.title) ?? `Part ${part} card` });
    }
    return {
      id: asString(doc.id) ?? setId,
      title: asString(doc.title) ?? "Topic set",
      cards,
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    // A set we cannot read costs the report its "study these cards" links and
    // nothing else, so this is logged and swallowed rather than shown.
    console.debug("[BandReady] mock: could not read the sitting's card set", err);
    return null;
  }
}
