/**
 * The button that pushes one item into the vocabulary suggestion inbox, and the
 * three states it can be in: offering, saving, and saved.
 *
 * It stays in the saved state for the life of the screen. Re-sending the same
 * chunk twice is harmless server-side (the ingest dedupes by lemma), but a button
 * that goes back to offering reads as if the first press did nothing.
 *
 * ## Why this is one component rather than two
 *
 * It lives beside `vocabInbox.ts` because it is the only thing that drives it, and
 * it exists once for the same reason that does: the writing coach's copy and the
 * speaking teaching layer's copy were the same component down to the failure copy,
 * differing only in whether the props were hoisted into an interface and whether a
 * `size` prop was exposed. The `source` prop carries data (which room asked), it
 * does not flip behaviour — so the two really were one component.
 *
 * Reading's `AddToBank` is deliberately not merged in: it posts a different body
 * through `features/reading/useDictionary`, and unifying that is a wire change
 * rather than a refactor.
 */

import { useCallback, useState } from "react";
import { BookmarkPlus, Check } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { friendlyMessage } from "@/lib/errors";
import { sendToVocabInbox, type BankItem, type VocabSource } from "./vocabInbox";

export interface AddToBankProps {
  item: BankItem;
  source: VocabSource;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

export function AddToBank({
  item,
  source,
  label = "Add to bank",
  size = "sm",
  className,
}: AddToBankProps) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async () => {
    setState("saving");
    setError(null);
    try {
      await sendToVocabInbox([item], source);
      setState("saved");
    } catch (err) {
      setState("failed");
      setError(
        friendlyMessage(
          err,
          "Couldn't add that to your bank.",
          "BandReady's local service isn't answering. Try again in a moment.",
        ),
      );
    }
  }, [item, source]);

  if (state === "saved") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[12px] font-medium text-success",
          className,
        )}
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        In your vocabulary inbox
      </span>
    );
  }

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size={size}
        loading={state === "saving"}
        disabled={state === "saving"}
        onClick={() => void send()}
      >
        <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
        {state === "failed" ? "Try again" : label}
      </Button>
      {error && (
        <span role="alert" className="text-[12px] text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
