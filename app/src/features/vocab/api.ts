import { api } from "@/lib/api";

/**
 * Vocabulary calls that are not part of the review store's state machine.
 *
 * The store owns the session — the queue, the card, the rating, the FSRS round trip. This
 * holds the calls a single exercise makes on its own behalf, where threading a request
 * through the store would only add a hop.
 */

export interface SpokenSentence {
  transcript: string;
  heard: string;
  gradeable: boolean;
  refusal: string | null;
  /** Whatever `check_sentence` returned, or null when the recording was refused. */
  graded: unknown;
}

/**
 * Send a spoken use-in-sentence answer.
 *
 * The sidecar transcribes it and then runs the ordinary `check_sentence` path with the
 * transcript, so the reply carries both what was heard and the same graded shape a typed
 * answer produces. A refused recording — silence, room tone, one of Whisper's stock
 * hallucinations — comes back `gradeable: false` with `graded: null`. That is not a wrong
 * answer and must not commit the card.
 */
export async function speakVocabSentence(audio: Blob, entryId: string): Promise<SpokenSentence> {
  const form = new FormData();
  form.append("wav", audio, "answer.webm");
  form.append("entry_id", entryId);
  return api.post<SpokenSentence>("/api/v1/vocab/speak", form);
}
