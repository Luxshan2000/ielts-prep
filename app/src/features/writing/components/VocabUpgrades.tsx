/**
 * Vocabulary upgrades (05 §10). Accepted items are POSTed to
 * `/api/v1/vocab/suggestions`, which lands them `status='suggested'` with no SRS
 * card until the learner accepts them in the vocab inbox (R2-5) — so nothing here
 * schedules a review behind the learner's back, and "Add" is per item.
 */

import { useState } from "react";
import { AlertTriangle, Check, Plus, Sparkles } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { cn } from "@/lib/cn";
import { message, sendVocabSuggestions, type VocabSuggestion } from "../store";

export interface VocabUpgradesProps {
  submissionId: string;
  suggestions: VocabSuggestion[];
}

export function VocabUpgrades({ submissionId, suggestions }: VocabUpgradesProps) {
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (suggestions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Vocabulary upgrades</CardTitle>
        </CardHeader>
        <CardContent className="text-[13px] text-muted-foreground">
          No upgrades were suggested for this answer.
        </CardContent>
      </Card>
    );
  }

  const pending = suggestions.filter((item) => !accepted.has(item.term));

  const add = async (items: VocabSuggestion[], key: string) => {
    if (items.length === 0) return;
    setBusy(key);
    setError(null);
    try {
      await sendVocabSuggestions(submissionId, items);
      setAccepted((prev) => {
        const next = new Set(prev);
        for (const item of items) next.add(item.term);
        return next;
      });
    } catch (err) {
      setError(message(err, "Couldn't add those words to your vocabulary inbox."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle>Vocabulary upgrades</CardTitle>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Added words wait in your vocabulary inbox — nothing is scheduled for review until you
            accept it there.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={pending.length === 0}
          loading={busy === "all"}
          onClick={() => void add(pending, "all")}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Add all ({pending.length})
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p role="alert" className="flex items-center gap-2 text-[13px] text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th scope="col" className="border-b border-border px-2 py-2 text-left font-medium text-foreground">
                  You used
                </th>
                <th scope="col" className="border-b border-border px-2 py-2 text-left font-medium text-foreground">
                  Stronger choice
                </th>
                <th scope="col" className="border-b border-border px-2 py-2 text-left font-medium text-foreground">
                  In your sentence
                </th>
                <th scope="col" className="border-b border-border px-2 py-2 text-right font-medium text-foreground">
                  <span className="sr-only">Add to vocabulary</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((item, index) => {
                const isAccepted = accepted.has(item.term);
                return (
                  <tr key={`${item.term}-${index}`} className="align-top">
                    <td className="border-b border-border/60 px-2 py-2.5 text-muted-foreground line-through decoration-muted-foreground/50">
                      {item.replaces || "—"}
                    </td>
                    <td className="border-b border-border/60 px-2 py-2.5 font-medium text-foreground">
                      {item.term}
                    </td>
                    <td className="border-b border-border/60 px-2 py-2.5 text-muted-foreground">
                      {item.sentence_context || "—"}
                    </td>
                    <td className="border-b border-border/60 px-2 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant={isAccepted ? "ghost" : "outline"}
                        disabled={isAccepted}
                        loading={busy === item.term}
                        onClick={() => void add([item], item.term)}
                        aria-label={
                          isAccepted ? `${item.term} added` : `Add ${item.term} to your vocabulary bank`
                        }
                      >
                        {isAccepted ? (
                          <>
                            <Check className={cn("h-3.5 w-3.5 text-success")} />
                            Added
                          </>
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
