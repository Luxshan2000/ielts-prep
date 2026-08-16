/**
 * The app's write path into the vocabulary suggestion inbox
 * (`POST /api/v1/vocab/suggestions`).
 *
 * Items land as `suggested`, not scheduled — the learner still has to accept
 * them, which is the point: a bank the learner did not choose is a bank they will
 * not review.
 *
 * ## Why this is one function rather than one per room
 *
 * It is one endpoint with one payload contract. The writing coach and the
 * speaking topic coach each had a private copy of this mapper, and the two bodies
 * were the same code apart from the `kind` literal and the default `detail`
 * string. That is a difference in *data*, not in behaviour — so it is a parameter
 * (`source`), not a switch. Keeping the mapper in one place is what stops a change
 * to the suggestion body landing in one room and not the other, which would be a
 * silent data bug in a bank the learner is asked to trust.
 *
 * ## What is deliberately NOT here
 *
 * Reading's `suggestVocab` (features/reading/useDictionary) and the two listening
 * sites send genuinely different bodies — reading sends `sentence_context` sliced
 * to 2000 characters with explicit nulls and no `example_sentences`, and listening
 * sends a `card_type` field nobody else sends. Folding those in would change the
 * wire, which is a reconciliation with a real decision in it, not a refactor.
 */

import { api } from "@/lib/api";

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
 * Which room the suggestion came from. Carried into `source` on the wire so the
 * inbox can group and explain what it is showing.
 */
export interface VocabSource {
  kind: "writing" | "speaking";
  /** Used when the item itself does not name a more specific origin. */
  defaultDetail: string;
}

export async function sendToVocabInbox(items: BankItem[], source: VocabSource): Promise<number> {
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
        kind: source.kind,
        item_id: item.sourceItemId,
        detail: item.sourceDetail ?? source.defaultDetail,
      },
    })),
  });
  return res?.count ?? items.length;
}
