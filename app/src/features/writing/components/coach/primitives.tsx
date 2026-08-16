/**
 * The four small pieces the writing coach screens need: a disclosure row, a tinted
 * callout, a copy-to-clipboard action, and the "add to bank" button. Only the copy
 * action is still defined here — the other three were needed by every coach layer
 * and now live in `components/ui` and `components/practice`, re-exported from this
 * module so nothing downstream had to move.
 *
 * All four are real `<button>`s with real ARIA relationships, so Tab and
 * Enter/Space work without a single custom key handler and nothing needs a roving
 * tabindex.
 *
 * **Copy, never insert.** Nothing in the coach writes into the learner's editor.
 * The pedagogy is internalisation, and a phrase that arrives in the answer by
 * button press was never learned (DESIGN.md §9 F5).
 */

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  AddToBank as SharedAddToBank,
  type AddToBankProps as SharedAddToBankProps,
} from "@/components/practice/AddToBank";
import {
  sendToVocabInbox as sendToInbox,
  type BankItem,
  type VocabSource,
} from "@/components/practice/vocabInbox";
import { cn } from "@/lib/cn";

// ------------------------------------ disclosure, callout and section head ---

/**
 * These three now live in the shared kit — all four coach layers carried
 * byte-identical copies, and `Disclosure` in particular is an ARIA primitive that
 * must not be fixed in one room and not the others. Re-exported from here so the
 * consumer files in this feature keep importing them from `./primitives`.
 */
export {
  Disclosure,
  Callout,
  SectionHead,
  type DisclosureProps,
  type CalloutTone,
} from "@/components/ui";

// ------------------------------------------------------------------- copy chunk ---

/**
 * Copies one authored string to the clipboard. Never touches the editor: the
 * learner has to retype it somewhere, which is the whole difference between a
 * phrase they can use and a phrase they pasted.
 */
export function CopyChunk({
  text,
  label = "Copy",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard permission can be refused; say so rather than pretending.
      setFailed(true);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground",
        "transition-colors hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {failed ? "Select and copy it" : copied ? "Copied" : label}
    </button>
  );
}

// ----------------------------------------------------------------- add to bank ---

/**
 * The item shape, the POST and the button all moved to
 * `components/practice/{vocabInbox,AddToBank}` — the speaking topic coach had the
 * same three, byte-for-byte apart from the `kind` literal and the default detail
 * string, and one endpoint with one payload contract should have one mapper.
 *
 * The `source` is bound here so nothing downstream changes and the emitted request
 * body is exactly what this room sent before.
 */

export type { BankItem };

const WRITING_SOURCE: VocabSource = { kind: "writing", defaultDetail: "Writing coach" };

export function sendToVocabInbox(items: BankItem[]): Promise<number> {
  return sendToInbox(items, WRITING_SOURCE);
}

export function AddToBank(props: Omit<SharedAddToBankProps, "source">) {
  return <SharedAddToBank {...props} source={WRITING_SOURCE} />;
}
