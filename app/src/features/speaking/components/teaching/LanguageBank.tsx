/**
 * The language bank (DESIGN.md §7 F4): functional language grouped by what it is
 * *for*, never by topic and never as a list of "band 9 expressions".
 *
 * Three deliberate choices:
 *  - every frame has a gap, and the gap is a real input. A frame you cannot type
 *    into is a sentence, and a sentence is a script (§1.1);
 *  - the `avoid` line sits beneath a divider labelled **Sounds canned**. It is not
 *    decoration. The contrast between the good version and the phrase-bank version
 *    is what inoculates learners against the sites that cause band-6 plateaus;
 *  - the bank is never attempt-gated. This is preparation material, not a model
 *    answer, so hiding it would only stop people preparing.
 */

import { useMemo, useState } from "react";
import { MessageSquareOff, Sparkles } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { AddToBank, Callout, Disclosure } from "./primitives";
import { functionLabel } from "./labels";
import type { Frame, LanguageBank as LanguageBankData } from "./types";

/** `"We go back to ___, when ___"` → the literal chunks around each gap. */
function frameParts(frame: string): string[] {
  return frame.split("___");
}

function fillFrame(frame: string, values: string[]): string {
  const parts = frameParts(frame);
  return parts
    .map((part, i) => (i === parts.length - 1 ? part : part + (values[i]?.trim() ?? "")))
    .join("")
    .trim();
}

/** A stable, bankable form of the pattern with the gaps shown as ellipses. */
function frameStem(frame: string): string {
  return frameParts(frame).join("…").replace(/\s+/g, " ").trim();
}

function FrameRow({
  frame,
  functionName,
  topicTags,
  setTitle,
}: {
  frame: Frame;
  functionName: string;
  topicTags: string[];
  setTitle: string;
}) {
  const parts = useMemo(() => frameParts(frame.frame), [frame.frame]);
  const [values, setValues] = useState<string[]>(() => parts.slice(0, -1).map(() => ""));

  const filled = fillFrame(frame.frame, values);
  const complete = values.every((v) => v.trim() !== "") && values.length > 0;

  return (
    <li className="space-y-2 rounded-lg border border-border bg-card p-3">
      <p className="flex flex-wrap items-baseline gap-x-1 gap-y-2 text-[14px] leading-7 text-foreground">
        {parts.map((part, i) => (
          <span key={i} className="contents">
            <span>{part}</span>
            {i < parts.length - 1 && (
              <input
                type="text"
                value={values[i] ?? ""}
                onChange={(e) =>
                  setValues((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                }
                aria-label={`Fill the gap: ${frame.slot_hint || "your own words"}`}
                placeholder={frame.slot_hint || "your own words"}
                className={cn(
                  "min-w-[8rem] max-w-full flex-1 rounded-md border border-input bg-background",
                  "px-2 py-0.5 text-[13px] text-foreground placeholder:text-muted-foreground/70",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              />
            )}
          </span>
        ))}
      </p>
      {frame.slot_hint && (
        <p className="text-[12px] text-muted-foreground">Gap: {frame.slot_hint}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <AddToBank
          item={{
            term: frameStem(frame.frame),
            definition: `${functionLabel(functionName)}: ${frame.slot_hint}`,
            example: complete ? filled : undefined,
            ownSentence: complete ? filled : undefined,
            topicTags,
            isPhrase: true,
            sourceDetail: `Speaking language bank: ${setTitle}`,
          }}
          label={complete ? "Bank your version" : "Add the frame"}
        />
        {!complete && (
          <span className="text-[11px] text-muted-foreground">
            Fill the gap first and your own sentence goes in with it.
          </span>
        )}
      </div>
    </li>
  );
}

export interface LanguageBankPanelProps {
  bank?: LanguageBankData;
  /** Functions the Part 2 card and the Part 3 themes ask for, most-used first. */
  targetFunctions?: string[];
  topicTags?: string[];
  setTitle: string;
  className?: string;
}

export function LanguageBankPanel({
  bank,
  targetFunctions = [],
  topicTags = [],
  setTitle,
  className,
}: LanguageBankPanelProps) {
  const groups = useMemo(() => {
    if (!bank) return [];
    const weight = new Map<string, number>();
    for (const fn of targetFunctions) weight.set(fn, (weight.get(fn) ?? 0) + 1);
    return bank.functions
      .map((group, index) => ({ group, index, uses: weight.get(group.function) ?? 0 }))
      .sort((a, b) => b.uses - a.uses || a.index - b.index);
  }, [bank, targetFunctions]);

  if (!bank || groups.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No language bank on this set"
        description="Topic sets authored with the teaching payload carry frames grouped by what they do: opinion, hedging, conceding and the rest."
        className={className}
      />
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {bank.warning && (
        <Callout tone="warn" title="Read this before you use any of them">
          {bank.warning}
        </Callout>
      )}

      <div className="space-y-2.5">
        {groups.map(({ group, index, uses }) => (
          <Disclosure
            key={group.function + index}
            defaultOpen={index === 0}
            title={functionLabel(group.function)}
            subtitle={group.why_here}
            meta={
              <span className="flex items-center gap-1.5">
                {uses > 0 && <Badge tone="primary">This set needs it</Badge>}
                {group.grammar && <Badge tone="outline">{group.grammar}</Badge>}
              </span>
            }
          >
            <div className="space-y-3">
              <ul className="space-y-2.5">
                {group.frames.map((frame, i) => (
                  <FrameRow
                    key={frame.frame + i}
                    frame={frame}
                    functionName={group.function}
                    topicTags={topicTags}
                    setTitle={setTitle}
                  />
                ))}
              </ul>

              {group.avoid && (
                <div className="space-y-1.5 border-t border-border pt-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <MessageSquareOff className="h-3.5 w-3.5" aria-hidden="true" />
                    Sounds canned
                  </p>
                  <p className="text-[13px] leading-6 text-muted-foreground line-through decoration-muted-foreground/50">
                    {group.avoid}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    Nothing is wrong with that sentence. It just tells the examiner you learned
                    it, not that you can build one.
                  </p>
                </div>
              )}
            </div>
          </Disclosure>
        ))}
      </div>
    </div>
  );
}
