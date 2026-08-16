/**
 * The card itself, with everything a learner should read *before* they speak:
 * the cue card, the one instruction that matters most, the two errors this subject
 * will provoke, the pronunciation feature its vocabulary stresses, and the topic
 * vocabulary panel.
 *
 * No model answers here, ever. This screen is reachable before an attempt, and a
 * model on it would turn preparation into memorisation (DESIGN.md §7 F1).
 */

import { AlertTriangle, Ear, Quote, Target } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { Callout, Disclosure } from "./primitives";
import { criterionLabel, criterionStyle } from "./labels";
import { TopicVocabulary } from "./TopicVocabulary";
import type { CardSetTeaching, ErrorWatch, Part2Teaching, TeachingCard } from "./types";

function ErrorWatchlist({ items }: { items: ErrorWatch[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2.5">
      {items.map((item, i) => {
        const style = criterionStyle(item.criterion);
        return (
          <div key={i} className="space-y-1.5 rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              {i === 0 && <Badge tone="warning">Most likely</Badge>}
              <span className="text-[13px] font-semibold text-foreground">{item.pattern}</span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  style.chip,
                )}
              >
                {criterionLabel(item.criterion)}
              </span>
            </div>
            <p className="text-[13px] leading-6 text-muted-foreground line-through decoration-muted-foreground/50">
              {item.wrong}
            </p>
            <p className="text-[13px] leading-6 text-foreground">{item.right}</p>
            {item.why && <p className="text-[12px] text-muted-foreground">{item.why}</p>}
          </div>
        );
      })}
    </div>
  );
}

function PronunciationFocusPanel({ teaching }: { teaching: Part2Teaching }) {
  const focus = teaching.pronunciation_focus;
  if (!focus) return null;
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-6 text-muted-foreground">{focus.why_here}</p>

      {focus.target_words.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {focus.target_words.map((word) => (
            <li key={word.word} className="rounded-lg border border-border bg-card p-2.5">
              <p className="text-[13px] font-semibold text-foreground">{word.word}</p>
              <p className="font-mono text-[12px] text-primary">{word.stress}</p>
              {word.note && (
                <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{word.note}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {focus.chunking_drill && (
        <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Say it in thought groups, pausing where the bars are
          </p>
          <p className="text-[14px] leading-7 text-foreground">
            {focus.chunking_drill.chunks.length > 0
              ? focus.chunking_drill.chunks.map((chunk, i) => (
                  <span key={i}>
                    {i > 0 && <span className="mx-1.5 text-muted-foreground">|</span>}
                    {chunk}
                  </span>
                ))
              : focus.chunking_drill.sentence}
          </p>
        </div>
      )}

      {(focus.minimal_pairs ?? []).length > 0 && (
        <ul className="space-y-1.5">
          {(focus.minimal_pairs ?? []).map((pair, i) => (
            <li key={i} className="text-[13px] leading-6 text-foreground">
              <span className="font-semibold">{pair.a}</span>
              <span className="text-muted-foreground"> vs </span>
              <span className="font-semibold">{pair.b}</span>
              {pair.contrast && (
                <span className="text-muted-foreground">: {pair.contrast}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface CardBriefProps {
  set: CardSetTeaching;
  setTitle: string;
  part2: TeachingCard | null;
  className?: string;
}

export function CardBrief({ set, setTitle, part2, className }: CardBriefProps) {
  const cue = part2?.cue_card;
  const teaching = part2?.part2Teaching;
  const tags = set.tags ?? [];

  return (
    <div className={cn("space-y-5", className)}>
      {set.teaches && (
        <Callout tone="teach" title="What this set trains">
          {set.teaches}
        </Callout>
      )}

      {cue && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Part 2 task card
            </p>
            {part2?.difficulty && <Badge tone="outline">{part2.difficulty}</Badge>}
            {set.family && <Badge tone="outline">Family {set.family}</Badge>}
          </div>
          <p className="text-[16px] font-semibold leading-7 text-foreground">{cue.topic}</p>
          {cue.bullets.length > 0 && (
            <>
              <p className="text-[13px] text-muted-foreground">You should say:</p>
              <ul className="space-y-1 pl-4">
                {cue.bullets.map((bullet, i) => (
                  <li
                    key={i}
                    className={cn(
                      "list-disc text-[14px] leading-6",
                      i === cue.bullets.length - 1
                        ? "font-medium text-foreground"
                        : "text-foreground",
                    )}
                  >
                    {bullet}
                  </li>
                ))}
              </ul>
            </>
          )}
          {(cue.rounding_off ?? []).length > 0 && (
            <p className="text-[12px] leading-5 text-muted-foreground">
              Afterwards the examiner asks one or two short questions about what you just said.
            </p>
          )}
        </section>
      )}

      {teaching?.band_move && (
        <div className="flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/8 p-4">
          <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              The one thing on this card
            </p>
            <p className="mt-0.5 text-[14px] leading-6 text-foreground">{teaching.band_move}</p>
          </div>
        </div>
      )}

      {(set.exam_note || teaching?.examiner_note) && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
          <Quote className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              What actually happens in the room
            </p>
            {teaching?.examiner_note && (
              <p className="text-[13px] leading-6 text-foreground">{teaching.examiner_note}</p>
            )}
            {set.exam_note && (
              <p className="text-[13px] leading-6 text-muted-foreground">{set.exam_note}</p>
            )}
          </div>
        </div>
      )}

      <section className="space-y-2.5">
        <h3 className="text-[13px] font-semibold text-foreground">Topic vocabulary</h3>
        <TopicVocabulary items={set.vocabulary} topicTags={tags} setTitle={setTitle} />
      </section>

      {(teaching?.error_watchlist ?? []).length > 0 && (
        <Disclosure
          title="The two errors this topic provokes"
          subtitle="Named before you make them, not after"
          meta={<AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />}
        >
          <ErrorWatchlist items={teaching?.error_watchlist ?? []} />
        </Disclosure>
      )}

      {teaching?.pronunciation_focus && (
        <Disclosure
          title="What this topic does to your pronunciation"
          subtitle={teaching.pronunciation_focus.priority.replace(/_/g, " ")}
          meta={<Ear className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
        >
          <PronunciationFocusPanel teaching={teaching} />
        </Disclosure>
      )}
    </div>
  );
}
