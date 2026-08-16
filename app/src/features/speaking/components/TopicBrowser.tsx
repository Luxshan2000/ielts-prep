import { useMemo, useState, type ReactNode } from "react";
import { GraduationCap } from "lucide-react";
import { Badge, Button, EmptyState, Select, Skeleton } from "@/components/ui";
import { SearchInput } from "@/components/ui/SearchInput";
import { cn } from "@/lib/cn";
import type { SpeakingCard } from "../store";

/**
 * The 108 topic sets, browsable.
 *
 * The pack ships 496 cue cards across 108 sets, and until now the only way to reach one was a
 * dropdown holding every card title for the chosen part: 280 options for Part 1. Nobody picks a
 * topic that way. They scroll, give up, and take whatever the picker had selected.
 *
 * A set is identified by its Part 2 cue card, because that is also how a learner remembers it
 * ("the one about a friend you've known longest"), and choosing the set chooses all three parts.
 *
 * One component, two rooms. The coach browses to study a topic and the hub browses to practise
 * one, which is the same list with a different verb, so `onPick` is the only thing that differs.
 * Two browsers would have drifted in a fortnight.
 */

export type SortKey = "az" | "za" | "unseen";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "az", label: "A to Z" },
  { value: "za", label: "Z to A" },
  { value: "unseen", label: "Not started first" },
];

/** The tier is the real third rung; `difficulty` alone hides sixteen sets' worth of it. */
function tierOf(card: SpeakingCard): string {
  return String(card.difficulty_tier ?? card.difficulty ?? "");
}

function matches(card: SpeakingCard, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  // Every word must appear somewhere, in any order, so "work stretch" narrows rather than
  // returning nothing because no single field holds both.
  const hay = `${card.title} ${card.tags.join(" ")} ${tierOf(card)}`.toLowerCase();
  return needle.split(/\s+/).every((word) => hay.includes(word));
}

export interface TopicBrowserProps {
  /** Part 2 cards, one per set. Built-ins carry no payload and are the caller's to exclude. */
  cards: SpeakingCard[];
  /** Sets the learner has already spoken or rehearsed. */
  attempted: Set<string>;
  loading?: boolean;
  onPick: (setId: string, card: SpeakingCard) => void;
  /** Verb for the tile's action, e.g. "Study" or "Practise". Shown on hover and to readers. */
  actionLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  /** Extra control rendered beside the filters, e.g. the hub's part picker. */
  filters?: ReactNode;
}

export function TopicBrowser({
  cards,
  attempted,
  loading = false,
  onPick,
  actionLabel,
  emptyTitle,
  emptyDescription,
  filters,
}: TopicBrowserProps) {
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<SortKey>("az");

  // Built from the cards rather than hard-coded: a pack with no `challenging` sets should not
  // offer a filter that can only ever return nothing, and a pack whose sets are all one tier
  // should not offer the filter at all. "Any difficulty / core" is not a choice.
  const tiers = useMemo(() => {
    const present = [...new Set(cards.map(tierOf).filter(Boolean))].sort();
    return [{ value: "all", label: "Any difficulty" }, ...present.map((t) => ({ value: t, label: t }))];
  }, [cards]);

  const shown = useMemo(() => {
    const filtered = cards.filter((card) => {
      if (!matches(card, query)) return false;
      if (tier !== "all" && tierOf(card) !== tier) return false;
      const seen = attempted.has(String(card.card_set_id));
      if (status === "unseen" && seen) return false;
      if (status === "attempted" && !seen) return false;
      return true;
    });
    const byTitle = (a: SpeakingCard, b: SpeakingCard) => a.title.localeCompare(b.title);
    if (sort === "az") return [...filtered].sort(byTitle);
    if (sort === "za") return [...filtered].sort((a, b) => byTitle(b, a));
    return [...filtered].sort((a, b) => {
      const sa = attempted.has(String(a.card_set_id)) ? 1 : 0;
      const sb = attempted.has(String(b.card_set_id)) ? 1 : 0;
      return sa - sb || byTitle(a, b);
    });
  }, [cards, query, tier, status, sort, attempted]);

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const filtering = query.trim() !== "" || tier !== "all" || status !== "all";
  const clear = () => {
    setQuery("");
    setTier("all");
    setStatus("all");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          className="min-w-[14rem] flex-1"
          value={query}
          onChange={setQuery}
          placeholder="Search topics and tags…"
          aria-label="Search topics"
        />
        {filters}
        {tiers.length > 2 && (
          <Select aria-label="Difficulty" size="sm" value={tier} onChange={setTier} options={tiers} />
        )}
        <Select
          aria-label="Status"
          size="sm"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Any status" },
            { value: "unseen", label: "Not started" },
            { value: "attempted", label: "Attempted" },
          ]}
        />
        <Select
          aria-label="Sort"
          size="sm"
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={SORTS}
        />
      </div>

      <p className="text-[13px] text-muted-foreground">
        {shown.length === cards.length
          ? `${cards.length} topics`
          : `${shown.length} of ${cards.length} topics`}
      </p>

      {shown.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={filtering ? "Nothing matches that" : emptyTitle}
          description={
            filtering
              ? "No topic matches the search and filters together. Try a broader word, or clear them."
              : emptyDescription
          }
          action={
            filtering ? (
              <Button variant="outline" onClick={clear}>
                Clear search and filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((card) => {
            const setId = String(card.card_set_id);
            const seen = attempted.has(setId);
            return (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => onPick(setId, card)}
                  aria-label={`${actionLabel}: ${card.title}`}
                  className={cn(
                    "flex h-full w-full flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left",
                    "transition-colors hover:border-primary/50 hover:bg-accent",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    {tierOf(card) && (
                      <Badge tone={tierOf(card) === "challenging" ? "warning" : "outline"}>
                        {tierOf(card)}
                      </Badge>
                    )}
                    {seen && <Badge tone="success">Attempted</Badge>}
                  </span>
                  <span className="text-[14px] font-semibold leading-6 text-foreground">
                    {card.title}
                  </span>
                  {card.tags.length > 0 && (
                    <span className="mt-auto pt-1 text-[12px] text-muted-foreground">
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
  );
}
