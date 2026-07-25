import { Flag } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { CHOICE_TYPES, LETTER_TYPES, choiceValues, qtypeLabel } from "../qtypes";
import { questionDomId } from "../model";
import type { DrillItem } from "../types";
import { AnswerInput } from "./AnswerInput";
import { LetterSelect, RadioChoices, SegmentedChoices } from "./Options";

export interface DrillPaneProps {
  qtype: string;
  items: DrillItem[];
  answers: Record<string, string>;
  flags: number[];
  current: number | null;
  onAnswer: (key: string, value: string) => void;
  onToggleFlag: (number: number) => void;
  onFocusQuestion: (number: number) => void;
  disabled?: boolean;
}

/**
 * Question-type drill: N questions of one type from across the bank, each shown
 * with its anchor paragraphs only (06 §6.2) — the point is the skill, not the
 * whole passage.
 */
export function DrillPane({
  qtype,
  items,
  answers,
  flags,
  current,
  onAnswer,
  onToggleFlag,
  onFocusQuestion,
  disabled,
}: DrillPaneProps) {
  const flagged = new Set(flags);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{qtypeLabel(qtype)}</Badge>
          <span className="text-[11px] text-muted-foreground tabular">
            {items.length} questions
          </span>
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Each question shows only the paragraphs it is about. Answer them all, then submit for
          marking and explanations.
        </p>
      </div>

      {items.map((item) => {
        const key = String(item.index);
        const value = answers[key] ?? "";
        const label = `Question ${item.index}: ${item.prompt}`;
        const options = item.options ?? [];
        const isFlagged = flagged.has(item.index);

        let control = (
          <AnswerInput
            ariaLabel={label}
            value={value}
            wordLimit={item.word_limit}
            disabled={disabled}
            onFocus={() => onFocusQuestion(item.index)}
            onChange={(next) => onAnswer(key, next)}
          />
        );
        if (CHOICE_TYPES.has(item.qtype)) {
          control = (
            <SegmentedChoices
              name={`drill-${item.index}`}
              ariaLabel={label}
              values={choiceValues(item.qtype)}
              value={value}
              onFocus={() => onFocusQuestion(item.index)}
              onChange={(next) => onAnswer(key, next === value ? "" : next)}
            />
          );
        } else if (item.qtype === "multiple_choice" && options.length > 0) {
          control = (
            <RadioChoices
              name={`drill-${item.index}`}
              ariaLabel={label}
              options={options}
              value={value}
              onFocus={() => onFocusQuestion(item.index)}
              onChange={(next) => onAnswer(key, next)}
            />
          );
        } else if (LETTER_TYPES.has(item.qtype) && options.length > 0) {
          control = (
            <LetterSelect
              ariaLabel={label}
              options={options}
              value={value}
              onChange={(next) => {
                onFocusQuestion(item.index);
                onAnswer(key, next);
              }}
            />
          );
        }

        return (
          <section
            key={item.question_id}
            id={questionDomId(item.index)}
            className={cn(
              "scroll-mt-4 space-y-3 rounded-xl border bg-card p-4 transition-colors",
              current === item.index ? "border-primary/60" : "border-border",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">
                  Question {item.index} · from “{item.passage_title ?? item.passage_id}”
                </p>
                {item.instructions && (
                  <p className="mt-1 text-[13px] font-medium text-foreground">
                    {item.instructions}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onToggleFlag(item.index)}
                aria-pressed={isFlagged}
                aria-label={`${isFlagged ? "Unflag" : "Flag"} question ${item.index}`}
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isFlagged
                    ? "bg-warning/15 text-warning"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Flag className={cn("h-3.5 w-3.5", isFlagged && "fill-current")} aria-hidden="true" />
              </button>
            </div>

            {(item.anchor_texts ?? []).length > 0 ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                {(item.anchor_texts ?? []).map((para) => (
                  <div key={para.id} className="flex gap-2.5">
                    <span className="w-5 shrink-0 text-[13px] font-bold tabular text-primary">
                      {para.id}
                    </span>
                    <p className="min-w-0 text-[13px] leading-relaxed">{para.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
                This question ships no anchor paragraphs, so answer it from the prompt alone.
              </p>
            )}

            <p className="text-[13px] font-medium leading-relaxed">{item.prompt}</p>
            {control}
          </section>
        );
      })}
    </div>
  );
}
