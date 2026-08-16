/**
 * "Vocabulary" tab — mining, under a constraint.
 *
 * The constraint is the feature. A word you did not know and did not need is not
 * worth a card, so every mineable item the pack ships names the question it could
 * have cost you, and the ones that actually cost you a mark are the ones this screen
 * puts first. Everything else stays a lookup.
 *
 * Beside it sits the small closed set that decides most True/False/Not Given items:
 * the quantifiers, frequency adverbs, modals, hedging verbs and connectives a reader
 * skips because they are short and grammatical. They are worth more marks than two
 * thousand topic nouns, which is why they get their own list rather than being mixed
 * into it.
 */

import { useMemo } from "react";
import { BookMarked, Highlighter } from "lucide-react";
import { Badge, Card, CardContent, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { sentenceAround } from "../../model";
import type { PassageAttemptRecord } from "./attempted";
import { AddToBank, Callout, LocateButton, SectionHead } from "./primitives";
import type { CoachPassage, MineableItem, PassageTeaching } from "./types";
import { paragraphTextMap } from "./types";

export interface VocabPanelProps {
  passage: CoachPassage;
  teaching: PassageTeaching | null;
  record: PassageAttemptRecord | null;
  onLocate: (paragraphId: string, quote?: string | null) => void;
}

/** The sentence in the passage the item came from — the back of the card. */
function sentenceFor(text: string, item: string): string {
  if (!text) return "";
  const at = text.toLowerCase().indexOf(item.toLowerCase());
  if (at < 0) return sentenceAround(text, 0);
  return sentenceAround(text, at);
}

export function VocabPanel({ passage, teaching, record, onLocate }: VocabPanelProps) {
  const paragraphs = useMemo(() => paragraphTextMap(passage), [passage]);
  const passageId = passage.passage_id ?? passage.id;
  const wrong = record?.wrong ?? [];

  const mineable = teaching?.mineable ?? [];
  const hinges = teaching?.hinge_words ?? [];

  /** Items whose question you actually lost first, then the rest. */
  const ordered = useMemo(() => {
    const cost = (item: MineableItem) =>
      item.blocks_q !== null && item.blocks_q !== undefined && wrong.includes(Number(item.blocks_q));
    return [...mineable].sort((a, b) => Number(cost(b)) - Number(cost(a)));
  }, [mineable, wrong]);

  if (mineable.length === 0 && hinges.length === 0) {
    return (
      <EmptyState
        icon={BookMarked}
        title="No mining list on this passage"
        description="Mineable chunks and hinge words are authored per passage. You can still double-click any word in the passage to look it up."
      />
    );
  }

  return (
    <div className="space-y-5">
      <Callout tone="info" title="Five to eight items, not fifty">
        Every entry below names a question it could have cost you. Take the ones that did; leave the
        rest as a lookup. A deck built from everything you did not recognise is a deck you will stop
        reviewing in a fortnight.
      </Callout>

      {ordered.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title="Worth a card"
            hint="Chunks with their partners and prepositions. Item writers paraphrase chunks, not headwords."
          />
          <div className="grid gap-3 lg:grid-cols-2">
            {ordered.map((item, index) => {
              const paragraphId = item.paragraph ? String(item.paragraph) : null;
              const text = paragraphId ? (paragraphs.get(paragraphId) ?? "") : "";
              const sentence = sentenceFor(text, String(item.item ?? ""));
              const costly =
                item.blocks_q !== null &&
                item.blocks_q !== undefined &&
                wrong.includes(Number(item.blocks_q));
              return (
                <Card
                  key={`${item.item}-${index}`}
                  className={cn(costly && "border-warning/50 bg-warning/5")}
                >
                  <CardContent className="space-y-2 pt-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-foreground">{item.item}</span>
                      {item.cefr && <Badge tone="outline">{item.cefr}</Badge>}
                      {item.blocks_q ? (
                        <Badge tone={costly ? "warning" : "default"}>
                          {costly ? `cost you Q${item.blocks_q}` : `decides Q${item.blocks_q}`}
                        </Badge>
                      ) : null}
                      {paragraphId && (
                        <LocateButton
                          label="In paragraph"
                          paragraph={paragraphId}
                          onLocate={() => onLocate(paragraphId, String(item.item ?? ""))}
                        />
                      )}
                    </div>
                    <p className="text-[13px] leading-6 text-muted-foreground">{item.meaning}</p>
                    {sentence && (
                      <p className="rounded-lg border-l-2 border-primary/50 bg-muted/40 px-2.5 py-1.5 text-[12px] leading-6 text-foreground">
                        {sentence}
                      </p>
                    )}
                    <AddToBank
                      item={{
                        term: String(item.item ?? ""),
                        definition: item.meaning ?? null,
                        sentence,
                        passageId,
                        detail: `Reading coach: ${passage.title ?? passageId}`,
                      }}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {hinges.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title="The words that decide the judgement questions"
            hint="Short, unstressed, easy to read past, and each one settles a question on this passage."
          />
          <ul className="space-y-2">
            {hinges.map((hinge, index) => (
              <li
                key={`${hinge.word}-${index}`}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3"
              >
                <Highlighter className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-[13px] font-semibold text-foreground">{hinge.word}</span>
                {hinge.kind && <Badge tone="outline">{String(hinge.kind).replace(/_/g, " ")}</Badge>}
                <span className="min-w-0 flex-1 text-[13px] leading-6 text-muted-foreground">
                  {hinge.why_here}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
