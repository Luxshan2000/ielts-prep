/**
 * Phrases — the vocabulary surface this module owns.
 *
 * HOW THIS DIVIDES FROM `/vocab`, because two screens over one bank is how an app
 * gets confusing:
 *
 *   `/vocab` owns **the bank and the schedule**. Which words you have, what state
 *   each is in, which decks you opted into, what is due, what the inbox is
 *   holding, and the FSRS review player. It is a possession list.
 *
 *   This screen owns **the sentence**. It shows nothing that is only a word: it
 *   shows the multi-word chunks and frames, the preposition welded to a word, the
 *   slots a frame leaves open and what goes in them, the three real contexts the
 *   cloze rotates through, the near-synonym that has to be told apart, and the
 *   grammar point each phrase lives inside. It never adds, removes or schedules
 *   anything — every action here either starts a practice set or hands off to
 *   `/vocab`.
 *
 * That is the owner's ask made structural: phrases practised in real sentences,
 * under a rule, next to the grammar that governs them (DESIGN §3.2, §6 F11).
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Layers, Library, Link2, Quote, Search } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { REGISTER_LABEL, levelLabel, surfaceLabel } from "../labels";
import { useGrammarStore } from "../store";
import type { PatternEntry } from "../types";
import { Cue, Section } from "./primitives";

type Lens = "all" | "chunk" | "frame" | "preposition";

const LENS_LABEL: Record<Lens, string> = {
  all: "Everything",
  chunk: "Fixed phrases",
  frame: "Sentence frames",
  preposition: "Welded prepositions",
};

const LENS_HINT: Record<Lens, string> = {
  all: "Every entry that carries real sentences to practise in.",
  chunk: "Stored and retrieved whole. Roughly half of natural English is prefabricated like this.",
  frame: "A shape with a gap in it — the part you reuse, and the part you fill.",
  preposition: "The one part of “grammar” that is purely lexical, and belongs on the scheduler.",
};

function matchesLens(entry: PatternEntry, lens: Lens): boolean {
  switch (lens) {
    case "chunk":
      return entry.unit_type === "chunk" || entry.unit_type === "collocation";
    case "frame":
      return entry.unit_type === "frame" || entry.chunk?.is_frame === true;
    case "preposition":
      return !!entry.chunk?.dependent_preposition;
    default:
      return true;
  }
}

// ----------------------------------------------------------------- card ----

function PatternCard({ entry }: { entry: PatternEntry }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const contexts = entry.contexts ?? [];
  const linkedPoint = entry.grammar_links?.[0] ?? null;

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-foreground">
            {entry.chunk?.shape ?? entry.headword}
          </p>
          {entry.definition && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{entry.definition}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {entry.chunk?.dependent_preposition && (
            <Badge tone="primary">+ {entry.chunk.dependent_preposition}</Badge>
          )}
          {entry.register && (
            <Badge tone="outline">{REGISTER_LABEL[entry.register] ?? entry.register}</Badge>
          )}
          {entry.cefr_level && levelLabel(entry.cefr_level) && (
            <Badge tone="outline" title={`Common European Framework level ${entry.cefr_level}`}>
              {levelLabel(entry.cefr_level)}
            </Badge>
          )}
          {entry.in_bank && <Badge tone="success">In your bank</Badge>}
        </div>
      </div>

      {/* the slots — what stays put and what changes */}
      {entry.chunk?.open_slots && entry.chunk.open_slots.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {entry.chunk.fixed_part && (
            <span className="rounded-md bg-primary/12 px-2 py-1 font-mono text-[12px] text-primary">
              {entry.chunk.fixed_part}
            </span>
          )}
          {entry.chunk.open_slots.map((slot, i) => (
            <span key={i} className="rounded-md border border-dashed border-border px-2 py-1 text-[12px]">
              <span className="font-mono text-muted-foreground">{slot.slot}</span>
              {slot.fills && slot.fills.length > 0 && (
                <span className="ml-1.5 text-muted-foreground">— {slot.fills.slice(0, 3).join(" · ")}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* the sentences it is practised in — the whole point of this screen */}
      {contexts.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {(open ? contexts : contexts.slice(0, 1)).map((context, i) => (
            <p
              key={context.id ?? i}
              className="rounded-lg border-l-2 border-border bg-muted/50 px-3 py-2 text-[13px] leading-relaxed text-foreground"
            >
              <Cue text={context.text} cue={context.gap_span} />
              {(context.register || context.skill_hook) && (
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {[
                    context.register ? REGISTER_LABEL[context.register] ?? context.register : null,
                    // "speaking_p3" is a join key, not something to show a learner.
                    context.skill_hook ? surfaceLabel(context.skill_hook) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </p>
          ))}
          {contexts.length > 1 && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {open
                ? "Show fewer"
                : `${contexts.length - 1} more sentence${contexts.length > 2 ? "s" : ""} it is practised in`}
            </button>
          )}
        </div>
      )}

      {/* the near-synonym it gets confused with */}
      {open && entry.confusables && entry.confusables.length > 0 && (
        <div className="mt-3 space-y-2">
          {entry.confusables.map((confusable, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <p className="text-[13px] font-medium text-foreground">
                Not the same as “{confusable.term}”
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {confusable.difference}
              </p>
              {confusable.minimal_pair && confusable.minimal_pair.length >= 2 && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {confusable.minimal_pair.slice(0, 2).map((sentence, si) => (
                    <p key={si} className="rounded bg-muted px-2 py-1 text-[13px] text-foreground">
                      {sentence}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {open && entry.avoid && (
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Watch out: </span>
          {entry.avoid}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {linkedPoint && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/grammar/point/${encodeURIComponent(linkedPoint)}`)}
          >
            <Link2 className="h-4 w-4" />
            The grammar it lives in
          </Button>
        )}
        {linkedPoint && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(`/grammar/practice?point=${encodeURIComponent(linkedPoint)}`)}
          >
            Use it in a sentence
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        {!open && (entry.confusables?.length || entry.avoid) && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            More
          </Button>
        )}
      </div>
    </li>
  );
}

// --------------------------------------------------------------- screen ----

export function PhrasesScreen() {
  const navigate = useNavigate();
  const patterns = useGrammarStore((s) => s.patterns);
  const loading = useGrammarStore((s) => s.patternsLoading);
  const error = useGrammarStore((s) => s.patternsError);
  const loadPatterns = useGrammarStore((s) => s.loadPatterns);

  const [lens, setLens] = useState<Lens>("all");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    void loadPatterns({ limit: 200 });
  }, [loadPatterns]);

  const entries = useMemo(() => {
    const all = patterns?.entries ?? [];
    const needle = filter.trim().toLowerCase();
    return all.filter(
      (entry) =>
        matchesLens(entry, lens) &&
        (!needle ||
          entry.headword.toLowerCase().includes(needle) ||
          (entry.definition ?? "").toLowerCase().includes(needle) ||
          (entry.chunk?.shape ?? "").toLowerCase().includes(needle)),
    );
  }, [patterns, lens, filter]);

  if (loading && !patterns) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        error={error}
        title="The phrase bank could not be loaded"
        onRetry={() => void loadPatterns({ limit: 200 })}
      />
    );
  }

  if (patterns && patterns.v2_available === false) {
    return (
      <EmptyState
        icon={Quote}
        title="This build's word list has no sentences attached yet"
        description="Phrases show up here once the content pack carries the sentence-level payload — the contexts, the slots and the near-synonyms. Your word bank still works exactly as it did."
        action={<Button onClick={() => navigate("/vocab")}>Open your word bank</Button>}
      />
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <Section
        title="Phrases, practised in sentences"
        hint="Your word bank lives in Vocabulary. This is the other half: the phrases English stores whole, the sentences they live in, and the grammar that governs them."
        action={
          <Button variant="outline" size="sm" onClick={() => navigate("/vocab")}>
            <Library className="h-4 w-4" />
            Your word bank
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(LENS_LABEL) as Lens[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setLens(value)}
              aria-pressed={lens === value}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-[13px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                lens === value
                  ? "border-primary bg-primary/8 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:bg-accent",
              )}
            >
              {LENS_LABEL[value]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{LENS_HINT[lens]}</p>

        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a phrase"
            aria-label="Find a phrase"
            className="pl-8"
          />
        </div>
      </Section>

      {entries.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Nothing here under that filter"
          description="Try another lens, or clear the search box."
        />
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <PatternCard key={entry.entry_id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}
