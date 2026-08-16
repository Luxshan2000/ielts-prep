import { useEffect, useState } from "react";
import { BookmarkPlus, Check, WifiOff } from "lucide-react";
import { Button, Spinner } from "@/components/ui";
import { errorText } from "../store";
import { posFromSense, suggestVocab, type LookupState } from "../useDictionary";

export interface DictionaryCardProps {
  state: LookupState;
  /** The sentence the word was double-clicked in — stored with the entry. */
  sentenceContext: string;
  passageId: string | null;
  /** Called once a word has been queued, so the player can track it. */
  onAdded?: (word: string) => void;
  /** Disabled in exam-conditions mode: the word is queued for after the test. */
  addDisabledReason?: string | null;
}

type AddState = "idle" | "saving" | "added" | "error";

/**
 * The double-click popover body: WordNet senses plus "Add to vocabulary".
 * `available: false` (lexicon still installing, or absent) is a first-class
 * state — the learner is told what will happen, not shown an error.
 */
export function DictionaryCard({
  state,
  sentenceContext,
  passageId,
  onAdded,
  addDisabledReason,
}: DictionaryCardProps) {
  const [add, setAdd] = useState<AddState>("idle");
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    setAdd("idle");
    setAddError(null);
  }, [state.word]);

  const senses = state.entry?.senses ?? [];
  const primary = senses[0];

  async function onAdd() {
    setAdd("saving");
    setAddError(null);
    try {
      await suggestVocab({
        term: state.entry?.lemma || state.word,
        sentenceContext,
        definition: primary?.definition ?? null,
        pos: posFromSense(primary?.pos_code),
        itemId: passageId,
        detail: "Looked up while reading",
      });
      setAdd("added");
      onAdded?.(state.word);
    } catch (err) {
      setAdd("error");
      setAddError(errorText(err));
    }
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{state.entry?.lemma || state.word}</p>
        {primary && <span className="text-[11px] text-muted-foreground">{primary.pos}</span>}
      </div>

      {state.status === "loading" && <Spinner label="Looking it up…" />}

      {state.status === "error" && (
        <p className="text-[13px] text-destructive">{state.error}</p>
      )}

      {state.status === "ready" && state.entry && !state.entry.available && (
        <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-2.5">
          <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-[13px] text-muted-foreground">
            The offline dictionary isn&apos;t ready yet
            {state.entry.detail ? ` (${state.entry.detail})` : ""}. BandReady is fetching the
            WordNet lexicon in the background; you can still add the word to your vocabulary and
            fill in the definition later.
          </p>
        </div>
      )}

      {state.status === "ready" && state.entry?.available && senses.length === 0 && (
        <p className="text-[13px] text-muted-foreground">
          No dictionary entry for this word. It may be a proper noun or an inflected form.
        </p>
      )}

      {senses.length > 0 && (
        <ol className="space-y-2">
          {senses.slice(0, 4).map((sense, index) => (
            <li key={index} className="text-[13px] leading-snug">
              <span className="mr-1.5 text-[11px] font-semibold tabular text-muted-foreground">
                {index + 1}.
              </span>
              <span className="text-foreground">{sense.definition}</span>
              {sense.synonyms.length > 0 && (
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  Also: {sense.synonyms.join(", ")}
                </span>
              )}
              {sense.examples.length > 0 && (
                <span className="mt-0.5 block text-[11px] italic text-muted-foreground">
                  "{sense.examples[0]}"
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {addDisabledReason ? (
        <p className="text-[11px] text-muted-foreground">{addDisabledReason}</p>
      ) : (
        <div className="space-y-1.5">
          <Button
            size="sm"
            variant={add === "added" ? "secondary" : "primary"}
            className="w-full"
            loading={add === "saving"}
            disabled={add === "added" || state.status === "loading"}
            onClick={() => void onAdd()}
          >
            {add === "added" ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Added to your vocabulary inbox
              </>
            ) : (
              <>
                <BookmarkPlus className="h-3.5 w-3.5" />
                Add to vocabulary
              </>
            )}
          </Button>
          {add === "error" && addError && (
            <p className="text-[11px] text-destructive">{addError}</p>
          )}
          {add === "added" && (
            <p className="text-[11px] text-muted-foreground">
              It is waiting in Vocabulary → Suggestions; accepting it starts the review schedule.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
