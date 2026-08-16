/**
 * Topic vocabulary for one set (DESIGN.md §1.2 and §7 F4).
 *
 * Collocations and chunks first, single words last, because Lexical Resource is lost
 * to wrong partners far more often than to missing words — a candidate who knows
 * "opportunity" and says "make an opportunity" is not short of vocabulary. So the
 * panel leads with the partner, shows the meaning in learner English rather than
 * dictionary English, and keeps the spoken example one tap away.
 *
 * Multi-word items go to the SRS as phrases: a chunk is not learned until it has
 * been *spoken* about the learner's own life, so it must never become a flip card.
 */

import { useMemo, useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { AddToBank } from "./primitives";
import { USED_IN_LABEL, VOCAB_TYPE_LABEL } from "./labels";
import type { VocabularyItem } from "./types";

type Filter = "all" | "part1" | "part2" | "part3";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "part1", label: "Part 1" },
  { value: "part2", label: "Part 2" },
  { value: "part3", label: "Part 3" },
];

/** Partners before single words — the ordering is the teaching (§1.2). */
const TYPE_RANK: Record<string, number> = {
  collocation: 0,
  chunk: 1,
  phrasal_verb: 2,
  idiom: 3,
  word: 4,
};

function cefrTone(cefr: string): "primary" | "outline" {
  return cefr.toUpperCase() === "C1" ? "primary" : "outline";
}

function VocabRow({
  entry,
  topicTags,
  setTitle,
}: {
  entry: VocabularyItem;
  topicTags: string[];
  setTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const isPhrase = entry.item.trim().includes(" ") || entry.type !== "word";

  return (
    <li className="rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-colors",
          "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        )}
      >
        <ChevronDown
          className={cn(
            "mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-foreground">{entry.item}</span>
            {entry.cefr && <Badge tone={cefrTone(entry.cefr)}>{entry.cefr}</Badge>}
            <Badge tone="default">{VOCAB_TYPE_LABEL[entry.type] ?? entry.type}</Badge>
          </span>
          <span className="mt-1 block text-[13px] leading-6 text-muted-foreground">
            {entry.meaning}
          </span>
        </span>
        <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
          {USED_IN_LABEL[entry.used_in] ?? entry.used_in}
        </span>
      </button>

      {open && (
        <div className="space-y-2.5 border-t border-border px-3.5 py-3">
          {entry.example && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-[13px] leading-6 text-foreground">
              “{entry.example}”
            </p>
          )}
          <AddToBank
            item={{
              term: entry.item,
              definition: entry.meaning,
              example: entry.example,
              cefr: entry.cefr,
              topicTags,
              isPhrase,
              sourceDetail: `Speaking topic vocabulary: ${setTitle}`,
            }}
          />
        </div>
      )}
    </li>
  );
}

export interface TopicVocabularyProps {
  items?: VocabularyItem[];
  topicTags?: string[];
  setTitle: string;
  className?: string;
}

export function TopicVocabulary({
  items = [],
  topicTags = [],
  setTitle,
  className,
}: TopicVocabularyProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const ordered = useMemo(
    () =>
      items
        .slice()
        .sort(
          (a, b) => (TYPE_RANK[a.type] ?? 9) - (TYPE_RANK[b.type] ?? 9) || a.item.localeCompare(b.item),
        ),
    [items],
  );

  const shown = useMemo(
    () =>
      filter === "all"
        ? ordered
        : ordered.filter((i) => i.used_in === filter || i.used_in === "any"),
    [filter, ordered],
  );

  if (items.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No topic vocabulary yet"
        description="Sets authored with the teaching payload carry eight to twelve collocations and chunks for this subject, each with a spoken example."
        className={className}
      />
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-[13px] leading-6 text-muted-foreground">
        Partners before words. Tap an item for the sentence somebody would actually say, then
        send the ones you'll use to your vocabulary inbox.
      </p>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by part">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filter === f.value
                ? "border-primary bg-primary/12 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-border bg-muted/40 p-4 text-[13px] text-muted-foreground">
          Nothing in this set is tagged for that part. Switch back to “Everything”.
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((entry) => (
            <VocabRow
              key={entry.item}
              entry={entry}
              topicTags={topicTags}
              setTitle={setTitle}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
