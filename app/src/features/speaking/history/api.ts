/**
 * What the Speaking room's history screen reads.
 *
 * Two lists, because the room records in two places. `/speaking/sessions` is the
 * envelope every session gets — chats, drills, single parts and mock sittings alike.
 * `/speaking/mock/sessions` is the sitting document, and it is the only place the topic
 * that was actually set is written down, which is the difference between a row called
 * "Full mock test" and one called "Describe a place you like to visit".
 *
 * The mock list is best-effort. It is served off a table created on first use, so a
 * profile that has never sat a mock can legitimately fail to read it, and losing it
 * costs the mock rows their topic and nothing else.
 */

import { api } from "@/lib/api";
import type { SessionRecord } from "../store";

/** One row of `GET /api/v1/speaking/mock/sessions` (`speaking/mock.py::history`). */
export interface MockSitting {
  session_id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_s: number | null;
  overall_band: number | null;
  card_set_id: string | null;
  card_set_title: string | null;
  /** The Part 2 cue card's subject — what a learner calls the sitting. */
  part2_topic: string | null;
  difficulty: string | null;
  stages_done: number;
  stages_total: number;
}

/**
 * One coaching drill attempt, from `GET /api/v1/speaking/drills/history`.
 *
 * Drills add no table of their own — they are read back out of `practice_sessions` with
 * `module='drill'` — which is why they are invisible to `/speaking/sessions` and why
 * they need their own call here.
 */
export interface DrillAttempt {
  id: string;
  /** `shadowing` | `minimal_pair` | `error_repair` | `extend`. */
  kind: string;
  at: string | null;
  duration_s: number | null;
  card_id: string | null;
  card_set_id: string | null;
  item_id: string | null;
  passed: boolean | null;
  /** 0–100 where the kind produces one. Not a band, and never shown as one. */
  score: number | null;
  /** The first line of the coach's feedback. */
  headline: string | null;
}

export interface SpeakingHistoryDoc {
  sessions: SessionRecord[];
  mocks: MockSitting[];
  drills: DrillAttempt[];
  /** Cue-card id → its title, so a drill row can be named after the card it drilled. */
  cardTitles: Record<string, string>;
}

/** Everything recorded in this room, gathered in parallel. */
export async function fetchSpeakingHistory(): Promise<SpeakingHistoryDoc> {
  // Only the session list is required. The other three enrich or extend the list, and
  // each fails for a reason that is not an error: no mock has ever been sat, a mock is
  // open right now (the drill routes answer 409 under exam conditions), or the sidecar
  // is older than one of the routes. Losing any of them must not cost the learner the
  // history they do have.
  const [sessions, mocks, drills, cardTitles] = await Promise.all([
    api.get<{ items: SessionRecord[] }>("/api/v1/speaking/sessions?limit=200"),
    optional<MockSitting>("/api/v1/speaking/mock/sessions?limit=100", "mock sittings"),
    optional<DrillAttempt>("/api/v1/speaking/drills/history?limit=200", "coaching drills"),
    cardTitleIndex(),
  ]);
  return { sessions: sessions.items ?? [], mocks, drills, cardTitles };
}

async function optional<T>(url: string, what: string): Promise<T[]> {
  try {
    const doc = await api.get<{ items?: T[] }>(url);
    return doc?.items ?? [];
  } catch (err) {
    console.debug(`[BandReady] speaking history: no ${what} available`, err);
    return [];
  }
}

async function cardTitleIndex(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const doc = await api.get<{ items?: { id: string; title: string }[] }>(
      "/api/v1/speaking/cards?limit=200",
    );
    for (const card of doc?.items ?? []) {
      if (card?.id && card.title) out[card.id] = card.title;
    }
  } catch (err) {
    // Without it a drill row is named after its kind alone, which is duller but true.
    console.debug("[BandReady] speaking history: could not read the cue-card titles", err);
  }
  return out;
}
