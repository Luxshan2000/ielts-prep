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

export interface BankItem {
  /** The headword, chunk or frame the learner wants to keep. */
  term: string;
  definition?: string;
  /** One natural sentence using it — the SRS shows this on the back. */
  example?: string;
  /** The learner's own sentence, when they wrote one into a frame slot. */
  ownSentence?: string;
  cefr?: string;
  topicTags?: string[];
  /** Multi-word items must not graduate into flip cards (DESIGN.md §7 F4). */
  isPhrase?: boolean;
  /** Free text stored on the suggestion so the inbox can say where it came from. */
  sourceDetail?: string;
  sourceItemId?: string;
}

/**
 * Push items into the vocabulary suggestion inbox (`POST /api/v1/vocab/suggestions`).
 * They land as `suggested`, not scheduled — the learner still has to accept them,
 * which is the point: a bank the learner did not choose is a bank they will not review.
 */
export async function sendToVocabInbox(items: BankItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const res = await api.post<{ count?: number }>("/api/v1/vocab/suggestions", {
    items: items.map((item) => ({
      term: item.term,
      definition: item.definition,
      sentence_context: item.ownSentence ?? item.example,
      example_sentences: item.example ? [item.example] : [],
      cefr_level: item.cefr,
      topic_tags: item.topicTags ?? [],
      is_phrase: item.isPhrase ?? item.term.trim().includes(" "),
      source: {
        kind: "speaking",
        item_id: item.sourceItemId,
        detail: item.sourceDetail ?? "Speaking topic coach",
      },
    })),
  });
  return res?.count ?? items.length;
}
