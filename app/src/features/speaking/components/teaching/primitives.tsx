/**
 * The three primitives the teaching screens need: a disclosure (accordion) row, a
 * tinted callout, and the "add to bank" action.
 *
 * All three now live in the shared layer — the disclosure and the callout in
 * `components/ui`, the bank button in `components/practice` — because every one of
 * them existed four times over, byte for byte, in the reading, listening, writing
 * and speaking coach layers. This module stays as the feature's front door for
 * them so nothing downstream had to change.
 *
 * All three are keyboard-operable with no custom key handling: they are real
 * `<button>`s with real ARIA relationships, so Tab and Enter/Space work by default
 * and nothing needs a roving tabindex.
 */

import {
  AddToBank as SharedAddToBank,
  type AddToBankProps as SharedAddToBankProps,
} from "@/components/practice/AddToBank";
import type { VocabSource } from "@/components/practice/vocabInbox";

// ------------------------------------------- disclosure and callout ---

export { Disclosure, Callout, type DisclosureProps, type CalloutTone } from "@/components/ui";

// ----------------------------------------------------------------- add to bank ---

export type AddToBankProps = Omit<SharedAddToBankProps, "source">;

const SPEAKING_SOURCE: VocabSource = { kind: "speaking", defaultDetail: "Speaking topic coach" };

/**
 * Sends one item to the vocabulary suggestion inbox. Stays in the "Saved" state for
 * the life of the screen — re-sending the same chunk twice is harmless server-side
 * (the ingest dedupes by lemma) but the button repeating its offer reads as if the
 * first press did nothing.
 *
 * The source is bound here so the emitted request body is exactly what this room
 * sent before.
 */
export function AddToBank(props: AddToBankProps) {
  return <SharedAddToBank {...props} source={SPEAKING_SOURCE} />;
}
