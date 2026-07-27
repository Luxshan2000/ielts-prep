/**
 * The language bank: frames, chunks, upgrades, structures and the error watchlist.
 *
 * **Never attempt-gated.** This is preparation material, not a model answer — a
 * learner who studies the language of comparison before writing a comparison is
 * doing the right thing. What makes it teaching rather than a phrase list is the
 * shape:
 *
 *  - every frame has a gap, and the gap is a real input. A frame with no gap is a
 *    sentence, and a sentence is a script;
 *  - every move ships a *plausible* canned sentence beside the good version, under
 *    the heading "sounds canned". The negative exemplar is what inoculates against
 *    the phrase-bank sites that cause band-6 plateaus;
 *  - collocations carry their partners and their prepositions, because Lexical
 *    Resource is lost to wrong partners far more often than to missing words;
 *  - nothing is ever auto-inserted into the editor. Copy, retype, or bank it.
 */

import { useState } from "react";
import { AlertTriangle, ArrowRight, Quote } from "lucide-react";
import { Badge, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { criterionCode, criterionName, criterionStyle, moveLabel } from "./labels";
import { AddToBank, Callout, CopyChunk, Disclosure, SectionHead } from "./primitives";
import type { WritingTeaching } from "./types";
import type { TaskType } from "../../store";

export interface LanguageBankPanelProps {
  teaching: WritingTeaching;
  taskType: TaskType;
  promptId: string;
  promptTitle: string;
  topicTags?: string[];
}

/** One slotted frame, with the `___` rendered as somewhere to type. */
function Frame({ frame, hint }: { frame: string; hint: string }) {
  const parts = frame.split("___");
  const [values, setValues] = useState<string[]>(() => parts.slice(1).map(() => ""));
  const filled = parts
    .map((part, i) => part + (i < parts.length - 1 ? (values[i] ?? "") : ""))
    .join("");
  const complete = values.every((v) => v.trim() !== "") && values.length > 0;

  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
      <p className="flex flex-wrap items-baseline gap-x-1 gap-y-2 text-[14px] leading-8 text-foreground">
        {parts.map((part, i) => (
          <span key={i} className="contents">
            <span>{part}</span>
            {i < parts.length - 1 && (
              <>
                <label className="sr-only" htmlFor={`frame-${frame}-${i}`}>
                  Fill the gap: {hint}
                </label>
                <Input
                  id={`frame-${frame}-${i}`}
                  value={values[i] ?? ""}
                  onChange={(event) =>
                    setValues((prev) => {
                      const next = [...prev];
                      next[i] = event.target.value;
                      return next;
                    })
                  }
                  className="inline-block h-7 w-40 px-2 py-0 text-[13px]"
                />
              </>
            )}
          </span>
        ))}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[12px] leading-5 text-muted-foreground">{hint}</p>
        {complete && <CopyChunk text={filled} label="Copy your version" />}
      </div>
    </div>
  );
}

export function LanguageBankPanel({
  teaching,
  taskType,
  promptId,
  promptTitle,
  topicTags = [],
}: LanguageBankPanelProps) {
  const bank = teaching.language_bank;
  const moves = bank?.moves ?? [];
  const collocations = teaching.collocations ?? [];
  const upgrades = teaching.upgrade_pairs ?? [];
  const structures = teaching.target_structures ?? [];
  const watchlist = teaching.error_watchlist ?? [];

  return (
    <div className="space-y-6">
      {bank?.warning && (
        <Callout tone="warn" title="Read this before you use any of it">
          {bank.warning}
        </Callout>
      )}

      {/* ------------------------------------------------------------- moves --- */}
      {moves.length > 0 && (
        <section className="space-y-2">
          <SectionHead
            title="Frames, by what they do"
            hint="Fill the gaps with what this prompt actually shows and it is language. Deliver one whole and it is a recital."
          />
          {moves.map((move, i) => (
            <Disclosure
              key={i}
              title={moveLabel(move.move)}
              subtitle={move.why_here}
              meta={<Badge tone="outline">{move.grammar}</Badge>}
              defaultOpen={i === 0}
            >
              <div className="space-y-3">
                {(move.frames ?? []).map((frame, fi) => (
                  <Frame key={fi} frame={frame.frame} hint={frame.slot_hint} />
                ))}
                {move.avoid && (
                  <div className="border-t border-border pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Sounds canned
                    </p>
                    <p className="mt-1 flex items-start gap-2 text-[13px] leading-6 text-muted-foreground">
                      <Quote className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="italic">{move.avoid}</span>
                    </p>
                  </div>
                )}
              </div>
            </Disclosure>
          ))}
        </section>
      )}

      {/* ------------------------------------------------------ collocations --- */}
      {collocations.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title="Chunks, with their partners attached"
            hint="Each of these carries its preposition. Prepositions are a collocation problem wearing a grammar costume — banking the bare word teaches nothing."
          />
          <ul className="grid gap-2 lg:grid-cols-2">
            {collocations.map((item, i) => (
              <li key={i} className="space-y-2 rounded-xl border border-border bg-card p-3.5">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-foreground">{item.chunk}</span>
                  <Badge tone={item.cefr === "C1" ? "primary" : "outline"}>{item.cefr}</Badge>
                </p>
                <p className="text-[13px] leading-6 text-muted-foreground">{item.example}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <AddToBank
                    item={{
                      term: item.chunk,
                      example: item.example,
                      cefr: item.cefr,
                      topicTags,
                      isPhrase: true,
                      sourceDetail: `Writing coach — ${promptTitle}`,
                      sourceItemId: promptId,
                    }}
                  />
                  <CopyChunk text={item.chunk} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --------------------------------------------------------- upgrades --- */}
      {upgrades.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title="Same idea, said precisely"
            hint="None of these is a rarer word. A misused rare word costs you twice — precision is the upgrade, not vocabulary size."
          />
          <ul className="space-y-2">
            {upgrades.map((pair, i) => (
              <li key={i} className="rounded-xl border border-border bg-card p-3.5">
                <p className="flex flex-wrap items-center gap-2 text-[14px]">
                  <span className="text-muted-foreground line-through decoration-muted-foreground/60">
                    {pair.vague}
                  </span>
                  <ArrowRight
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="font-semibold text-foreground">{pair.precise}</span>
                </p>
                <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{pair.why}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------------- structures --- */}
      {structures.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title="The structures this prompt pulls"
            hint="Band 6 already attempts complexity. Landing it is the upgrade, so each one ships with the accuracy failure it carries."
          />
          <ul className="space-y-2">
            {structures.map((structure, i) => (
              <li key={i} className="rounded-xl border border-border bg-card p-3.5">
                <p className="text-[14px] font-semibold text-foreground">{structure.name}</p>
                <p className="mt-1 text-[13px] leading-6 text-foreground">“{structure.model}”</p>
                <p className="mt-1.5 flex items-start gap-2 text-[12px] leading-5 text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {structure.trap}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* -------------------------------------------------------- watchlist --- */}
      {watchlist.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title="The errors this prompt provokes"
            hint="In order of what they cost. The first one is the one your report will lead with if you make it."
          />
          <ul className="space-y-2">
            {watchlist.map((item, i) => (
              <li key={i} className="space-y-2 rounded-xl border border-border bg-card p-3.5">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-foreground">{item.pattern}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      criterionStyle(item.criterion).chip,
                    )}
                    title={criterionName(item.criterion, taskType)}
                  >
                    {criterionCode(item.criterion)}
                  </span>
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <p className="rounded-lg border border-border bg-muted/40 p-2.5 text-[13px] leading-6 text-muted-foreground">
                    {item.wrong}
                  </p>
                  <p className="rounded-lg border border-primary/40 bg-primary/8 p-2.5 text-[13px] leading-6 text-foreground">
                    {item.right}
                  </p>
                </div>
                <p className="text-[12px] leading-5 text-muted-foreground">{item.why}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
