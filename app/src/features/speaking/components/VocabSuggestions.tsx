/**
 * "Vocabulary to bank" section of the report (04 §8, R2-5).
 *
 * NOTHING here is added automatically. The scorer already created `vocab_entries` rows
 * with `status='suggested'` and no SRS card; the learner turns one into a real card by
 * pressing Add (`POST …/accept`) or removes it with Dismiss (`POST …/dismiss`). Items
 * whose inbox row can't be resolved show as read-only, because guessing an entry id
 * could accept the wrong word.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookmarkPlus, Check, Sparkles, X } from "lucide-react";
import { Badge, Button, EmptyState, SkeletonRow } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  acceptSuggestion,
  dismissSuggestion,
  fetchSuggestions,
  type VocabSuggestionEntry,
  type VocabToBank,
} from "../store";

type RowState = "idle" | "busy" | "accepted" | "dismissed" | "error";

export interface VocabSuggestionsProps {
  sessionId: string;
  items: VocabToBank[];
  className?: string;
}

const TYPE_LABEL: Record<string, string> = {
  word: "Word",
  collocation: "Collocation",
  phrase: "Phrase",
  phrasal_verb: "Phrasal verb",
  idiom: "Idiom",
};

export function VocabSuggestions({ sessionId, items, className }: VocabSuggestionsProps) {
  const [entries, setEntries] = useState<VocabSuggestionEntry[] | null>(null);
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const terms = useMemo(() => items.map((item) => item.term), [items]);

  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) {
      setEntries([]);
      return;
    }
    setEntries(null);
    void fetchSuggestions(sessionId, terms).then((rows) => {
      if (!cancelled) setEntries(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [items.length, sessionId, terms]);

  /** Match a report item to its inbox row by lemma — the scorer lower-cases the term. */
  const entryFor = useCallback(
    (term: string): VocabSuggestionEntry | null => {
      const wanted = term.trim().toLowerCase();
      return (
        entries?.find(
          (entry) =>
            (entry.lemma ?? "").toLowerCase() === wanted ||
            (entry.headword ?? "").toLowerCase() === wanted,
        ) ?? null
      );
    },
    [entries],
  );

  const act = useCallback(
    async (entryId: string, action: "accept" | "dismiss") => {
      setStates((s) => ({ ...s, [entryId]: "busy" }));
      setErrors((e) => {
        const next = { ...e };
        delete next[entryId];
        return next;
      });
      try {
        if (action === "accept") await acceptSuggestion(entryId);
        else await dismissSuggestion(entryId);
        setStates((s) => ({ ...s, [entryId]: action === "accept" ? "accepted" : "dismissed" }));
      } catch (err) {
        setStates((s) => ({ ...s, [entryId]: "error" }));
        setErrors((e) => ({
          ...e,
          [entryId]:
            err instanceof Error ? err.message : "That word couldn't be saved. Try again.",
        }));
      }
    },
    [],
  );

  const acceptAll = useCallback(async () => {
    const ids = items
      .map((item) => entryFor(item.term)?.id)
      .filter((id): id is string => Boolean(id) && states[id as string] === undefined);
    for (const id of ids) await act(id, "accept");
  }, [act, entryFor, items, states]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={BookmarkPlus}
        title="No vocabulary suggestions"
        description="The examiner didn't flag any words worth banking from this session."
        className={className}
      />
    );
  }

  if (entries === null) {
    return (
      <div className={cn("space-y-3", className)}>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  const pending = items.filter((item) => {
    const entry = entryFor(item.term);
    return entry !== null && states[entry.id] === undefined;
  }).length;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Nothing is added to your revision deck until you choose it.
        </p>
        {pending > 1 && (
          <Button size="sm" variant="outline" onClick={() => void acceptAll()}>
            Add all {pending}
          </Button>
        )}
      </div>

      <ul className="space-y-2">
        {items.map((item, i) => {
          const entry = entryFor(item.term);
          const state: RowState = entry ? (states[entry.id] ?? "idle") : "idle";
          const settled = state === "accepted" || state === "dismissed";

          return (
            <li
              key={`${item.term}-${i}`}
              className={cn(
                "rounded-xl border border-border bg-card p-3.5 transition-opacity",
                state === "dismissed" && "opacity-60",
              )}
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{item.term}</span>
                    <Badge tone="outline">{TYPE_LABEL[item.type] ?? item.type}</Badge>
                    {entry?.pos && entry.pos !== item.type && (
                      <span className="text-[11px] text-muted-foreground">{entry.pos}</span>
                    )}
                  </p>
                  {item.reason && (
                    <p className="text-[13px] leading-5 text-muted-foreground">{item.reason}</p>
                  )}
                  {item.context_quote && (
                    <p className="text-[12px] italic leading-5 text-muted-foreground">
                      You said: “{item.context_quote}”
                    </p>
                  )}
                  {entry?.definition && (
                    <p className="text-[12px] leading-5 text-muted-foreground">
                      {entry.definition}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {!entry ? (
                    <span className="max-w-[9rem] text-right text-[11px] text-muted-foreground">
                      Already in your bank, or dismissed earlier
                    </span>
                  ) : settled ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-[12px]",
                        state === "accepted" ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      {state === "accepted" ? (
                        <>
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          Added
                        </>
                      ) : (
                        <>
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                          Dismissed
                        </>
                      )}
                    </span>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        loading={state === "busy"}
                        onClick={() => void act(entry.id, "accept")}
                      >
                        <BookmarkPlus className="h-3.5 w-3.5" />
                        Add
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={state === "busy"}
                        onClick={() => void act(entry.id, "dismiss")}
                      >
                        Dismiss
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {entry && errors[entry.id] && (
                <p role="alert" className="mt-2 text-[12px] text-destructive">
                  {errors[entry.id]}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
