/**
 * Data access for the teaching screens.
 *
 * ## Where the teaching payload comes from
 *
 * `card_sets.jsonl` and `speaking_cards.jsonl` carry the whole `schema_version: 2`
 * teaching payload inside `payload_json` (DESIGN.md §1–§4), but the shipped
 * `GET /api/v1/speaking/cards` projection deliberately drops it — that endpoint
 * exists to fill a drill topic picker, and shipping three model answers per row
 * would make it enormous.
 *
 * So the coach reads one set at a time. `fetchTeachingPack` tries the set-detail
 * routes in order and takes the first that answers; a 404 from all of them is not
 * an error, it means "this build serves no teaching payload yet" and the screens
 * say exactly that. Everything below tolerates both `payload_json` and `payload`,
 * and both `{set, cards}` and a flat row with a `cards` array, because the row
 * shape is fixed by the pack format but the envelope is the server's choice.
 *
 * ### The route this needs (not yet in `routes/speaking.py`)
 *
 * ```
 * GET /api/v1/speaking/card-sets/{set_id}  ->  200
 * {
 *   "id": "set_oldest_friend_101",
 *   "title": "Friendship over time",
 *   "topic_id": "topic_family",
 *   "payload_json": { ...card_sets.jsonl payload verbatim... },
 *   "cards": [
 *     { "id": "...", "part": 1, "title": "...", "difficulty": "core",
 *       "tags_json": [...], "payload_json": { ...speaking_cards.jsonl payload... } },
 *     ...four rows, parts 1,1,2,3...
 *   ]
 * }
 * ```
 *
 * `payload_json` must be passed through **verbatim** — the renderer narrows it in
 * `types.ts` and needs the whole `teaching` object, not a projection. 404 when the
 * set id is unknown. Until that route exists the coach renders its "no teaching
 * material" state, which is correct behaviour, just empty.
 */

import {
  sendToVocabInbox as sendToInbox,
  type BankItem,
  type VocabSource,
} from "@/components/practice/vocabInbox";
import { api, ApiError } from "@/lib/api";
import { readPack, isDict, type TeachingPack } from "./types";

/** Tried in order. The first non-404 answer wins. */
const SET_ENDPOINTS = [
  (id: string) => `/api/v1/speaking/card-sets/${encodeURIComponent(id)}`,
  (id: string) => `/api/v1/speaking/sets/${encodeURIComponent(id)}`,
] as const;

/** Thrown when every candidate route 404s — a missing feature, not a failure. */
export class TeachingUnavailableError extends Error {
  constructor() {
    super("This build does not serve teaching material for speaking cards yet.");
    this.name = "TeachingUnavailableError";
  }
}

function cardsOf(doc: Record<string, unknown>): unknown[] {
  const candidates = [doc.cards, doc.speaking_cards, doc.items];
  for (const c of candidates) if (Array.isArray(c)) return c;
  return [];
}

/**
 * One set with its four cards, normalised. Rejects with `TeachingUnavailableError`
 * when no route serves set details, and with the raw `ApiError` for anything else
 * so `ErrorState` can classify offline/provider failures properly.
 */
export async function fetchTeachingPack(setId: string): Promise<TeachingPack> {
  let lastNotFound: unknown = null;

  for (const build of SET_ENDPOINTS) {
    try {
      const doc = await api.get<unknown>(build(setId));
      if (!isDict(doc)) continue;
      const pack = readPack(doc, cardsOf(doc));
      if (pack) return pack;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        lastNotFound = err;
        continue;
      }
      throw err;
    }
  }

  if (lastNotFound !== null) throw new TeachingUnavailableError();
  throw new TeachingUnavailableError();
}

// ------------------------------------------------------------- vocabulary inbox ---

/**
 * The item shape and the POST both moved to `components/practice/vocabInbox` —
 * the writing coach had the same two, byte-for-byte apart from the `kind` literal
 * and the default detail string, and one endpoint with one payload contract should
 * have one mapper.
 *
 * The source is bound here, so this module's exported signature is unchanged and
 * the emitted request body is exactly what this room sent before.
 */
export type { BankItem };

const SPEAKING_SOURCE: VocabSource = { kind: "speaking", defaultDetail: "Speaking topic coach" };

export function sendToVocabInbox(items: BankItem[]): Promise<number> {
  return sendToInbox(items, SPEAKING_SOURCE);
}
