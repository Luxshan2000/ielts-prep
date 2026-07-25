/**
 * Offline dictionary lookups for the passage popover (R2-20 — WordNet in the
 * sidecar, never an LLM) plus the "add to vocabulary" hand-off.
 *
 * `GET /api/v1/dictionary/{word}` answers `{available:false}` while the lexicon
 * is still installing; that is a normal state the popover renders, not an error.
 */

import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api";
import { errorText } from "./store";
import type { DictionaryEntry } from "./types";

const cache = new Map<string, DictionaryEntry>();

export type LookupStatus = "idle" | "loading" | "ready" | "error";

export interface LookupState {
  word: string;
  status: LookupStatus;
  entry: DictionaryEntry | null;
  error: string | null;
}

const IDLE: LookupState = { word: "", status: "idle", entry: null, error: null };

export function useDictionary() {
  const [state, setState] = useState<LookupState>(IDLE);
  const inflight = useRef(0);

  const lookup = useCallback(async (rawWord: string) => {
    const word = rawWord.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!word) {
      setState(IDLE);
      return;
    }
    const key = word.toLowerCase();
    const cached = cache.get(key);
    if (cached) {
      setState({ word, status: "ready", entry: cached, error: null });
      return;
    }
    const ticket = inflight.current + 1;
    inflight.current = ticket;
    setState({ word, status: "loading", entry: null, error: null });
    try {
      const entry = await api.get<DictionaryEntry>(
        `/api/v1/dictionary/${encodeURIComponent(word)}`,
      );
      if (entry.available) cache.set(key, entry);
      if (inflight.current !== ticket) return;
      setState({ word, status: "ready", entry, error: null });
    } catch (err) {
      if (inflight.current !== ticket) return;
      setState({ word, status: "error", entry: null, error: errorText(err) });
    }
  }, []);

  const reset = useCallback(() => {
    inflight.current += 1;
    setState(IDLE);
  }, []);

  return { state, lookup, reset };
}

export interface VocabSuggestion {
  term: string;
  sentenceContext: string;
  definition?: string | null;
  pos?: string | null;
  /** The passage the word came from — kept as the vocab entry's source. */
  itemId?: string | null;
  detail?: string | null;
}

/**
 * Send a looked-up word to the suggestion inbox (R2-5: modules suggest, they
 * never schedule). Returns nothing on success and throws `ApiError` otherwise.
 */
export async function suggestVocab(item: VocabSuggestion): Promise<void> {
  await api.post("/api/v1/vocab/suggestions", {
    items: [
      {
        term: item.term,
        sentence_context: item.sentenceContext.slice(0, 2000) || null,
        definition: item.definition || null,
        pos: item.pos || null,
        source: {
          kind: "reading",
          item_id: item.itemId ?? null,
          detail: item.detail ?? null,
        },
      },
    ],
  });
}

/** WordNet part-of-speech label → the vocab module's `pos` enum. */
export function posFromSense(posCode: string | undefined): string | null {
  switch ((posCode ?? "").toLowerCase()) {
    case "n":
      return "noun";
    case "v":
      return "verb";
    case "a":
    case "s":
      return "adj";
    case "r":
      return "adv";
    default:
      return null;
  }
}
