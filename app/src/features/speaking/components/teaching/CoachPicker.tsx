/**
 * Topic picker for the coach — `/speaking/coach`.
 *
 * Lists every Part 2 card in the installed pack, because the set is identified by
 * its cue card and that is also how a learner remembers it ("the one about a friend
 * you've known longest"). Cards with no `card_set_id` are the built-in fallbacks the
 * engine uses when no pack is installed; they carry no teaching payload, so they are
 * filtered out rather than shown as dead links.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, GraduationCap, Search } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { cn } from "@/lib/cn";
import { useSpeakingStore, type SpeakingCard } from "../../store";
import { attemptedSetIds, useTeachingStore } from "./store";

function matches(card: SpeakingCard, query: string): boolean {
  if (query.trim() === "") return true;
  const needle = query.trim().toLowerCase();
  return (
    card.title.toLowerCase().includes(needle) ||
    card.tags.some((tag) => tag.toLowerCase().includes(needle))
  );
}

export function CoachPicker() {
  const navigate = useNavigate();

  const cards = useSpeakingStore((s) => s.cards);
  const loading = useSpeakingStore((s) => s.cardsLoading);
  const error = useSpeakingStore((s) => s.cardsError);
  const loadCards = useSpeakingStore((s) => s.loadCards);
  const history = useSpeakingStore((s) => s.history);
  const loadHistory = useSpeakingStore((s) => s.loadHistory);
  const rehearsed = useTeachingStore((s) => s.rehearsed);

  const [query, setQuery] = useState("");

  useEffect(() => {
    void loadCards(2);
  }, [loadCards]);

  useEffect(() => {
    if (history.length === 0) void loadHistory();
  }, [history.length, loadHistory]);

  const spoken = useMemo(() => attemptedSetIds(history), [history]);

  const shown = useMemo(
    () =>
      cards
        .filter((card) => card.part === 2 && card.card_set_id && !card.builtin)
        .filter((card) => matches(card, query)),
    [cards, query],
  );

  return (
    <PageShell
      title="Topic coach"
      description="Pick a card to study: the prep minute, the band ladder, the language bank and the vocabulary for that subject."
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate("/speaking")}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Speaking
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cue cards and tags"
            aria-label="Search cue cards"
            className="pl-9"
          />
        </div>

        {loading && (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        )}

        {!loading && error && (
          <Card>
            <CardContent className="pt-5">
              <ErrorState
                error={error}
                title="The cue-card bank could not be loaded"
                onRetry={() => void loadCards(2)}
              />
            </CardContent>
          </Card>
        )}

        {!loading && !error && shown.length === 0 && (
          <Card>
            <CardContent className="pt-5">
              <EmptyState
                icon={GraduationCap}
                title={
                  query.trim() === "" ? "No topic sets installed" : "Nothing matches that search"
                }
                description={
                  query.trim() === ""
                    ? "The coach reads its material from the installed content pack. Install one from Settings and every card gains a study screen."
                    : "Try a broader word — the search covers the cue card and its tags."
                }
                action={
                  query.trim() !== "" && (
                    <Button variant="outline" onClick={() => setQuery("")}>
                      Clear the search
                    </Button>
                  )
                }
              />
            </CardContent>
          </Card>
        )}

        {!loading && !error && shown.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {shown.map((card) => {
              const setId = card.card_set_id as string;
              const attempted = spoken.has(setId) || rehearsed.includes(setId);
              return (
                <li key={card.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/speaking/coach/${encodeURIComponent(setId)}`)}
                    className={cn(
                      "flex h-full w-full flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left",
                      "transition-colors hover:border-primary/50 hover:bg-accent",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      {/* The tier, not the row difficulty: `challenging` is a real third
                          rung and showing it as `stretch` hides sixteen sets' worth of
                          difficulty from the person choosing what to practise. */}
                      {(card.difficulty_tier ?? card.difficulty) && (
                        <Badge
                          tone={
                            (card.difficulty_tier ?? card.difficulty) === "challenging"
                              ? "warning"
                              : "outline"
                          }
                        >
                          {card.difficulty_tier ?? card.difficulty}
                        </Badge>
                      )}
                      {attempted && <Badge tone="success">Attempted</Badge>}
                    </span>
                    <span className="text-[14px] font-semibold leading-6 text-foreground">
                      {card.title}
                    </span>
                    {card.tags.length > 0 && (
                      <span className="text-[12px] text-muted-foreground">
                        {card.tags.slice(0, 4).join(" · ")}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageShell>
  );
}

export default CoachPicker;
