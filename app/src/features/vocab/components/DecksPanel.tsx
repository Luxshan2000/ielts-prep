import { useEffect, useState } from "react";
import { AlertCircle, Check, Layers, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Skeleton,
  useConfirm,
} from "@/components/ui";
import { pluralize } from "@/lib/format";
import { DECK_KIND_META } from "../labels";
import { useVocabStore } from "../store";
import type { SeedDeck } from "../types";

/**
 * Seed decks (§6.2). Opting in copies the deck's words into the bank as active
 * cards — it is the one bulk path that schedules without going through the inbox,
 * because the learner is asking for it explicitly.
 */
export function DecksPanel() {
  const confirm = useConfirm();
  const decks = useVocabStore((s) => s.decks);
  const loading = useVocabStore((s) => s.decksLoading);
  const error = useVocabStore((s) => s.decksError);
  const busy = useVocabStore((s) => s.deckBusy);
  const load = useVocabStore((s) => s.loadDecks);
  const optIn = useVocabStore((s) => s.optInDeck);

  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (deck: SeedDeck) => {
    const adds = Math.max(0, deck.entries - deck.in_bank);
    const ok = await confirm({
      title: `Add “${deck.label}” to your bank?`,
      message: `${pluralize(adds, "new word")} will be scheduled for review straight away${
        deck.in_bank > 0 ? `; ${deck.in_bank} you already have will just gain a source note.` : "."
      }`,
      confirmLabel: "Add deck",
    });
    if (!ok) return;
    setResult(null);
    const res = await optIn(deck.deck_id);
    if (res) {
      setResult(
        `${deck.label}: ${pluralize(res.imported, "word")} added${
          res.merged > 0 ? `, ${res.merged} merged into words you already had` : ""
        }.`,
      );
    }
  };

  if (loading && decks.length === 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  if (error && decks.length === 0) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="The study decks could not be loaded"
        description={error}
        action={<Button onClick={() => void load()}>Try again</Button>}
      />
    );
  }

  if (decks.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No study decks are installed"
        description="Study decks ship inside a content pack. Install or import a pack from Settings → Data and the topic decks will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
        Each deck is a curated topic list. Adding one schedules its words immediately. Everything
        else in BandReady only ever <em>suggests</em>.
      </p>

      {result && (
        <p className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-[13px] text-success">
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {result}
        </p>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[13px] text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {decks.map((deck) => {
          const meta = DECK_KIND_META[deck.kind] ?? DECK_KIND_META.other;
          const Icon = meta.icon;
          const adds = Math.max(0, deck.entries - deck.in_bank);
          return (
            <Card key={deck.deck_id}>
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold">{deck.label}</p>
                    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {meta.label}
                    </p>
                  </div>
                  {deck.opted_in && <Badge tone="success">In your bank</Badge>}
                </div>

                <p className="text-[13px] text-muted-foreground">
                  {pluralize(deck.entries, "word")}
                  {deck.in_bank > 0 && !deck.opted_in && ` · ${deck.in_bank} already yours`}
                </p>

                <div className="mt-auto">
                  <Button
                    size="sm"
                    variant={deck.opted_in ? "outline" : "primary"}
                    disabled={deck.opted_in || busy !== null}
                    loading={busy === deck.deck_id}
                    onClick={() => void add(deck)}
                  >
                    {deck.opted_in ? (
                      <>
                        <Check className="h-4 w-4" />
                        Added
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        Add {pluralize(adds, "word")}
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
