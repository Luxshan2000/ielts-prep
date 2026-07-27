import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DrillItem } from "./types";

export interface ParaphraseAnswer {
  given: string;
  device: string;
}

/**
 * One question phrasing, four passage extracts, one of which actually says the same thing.
 *
 * This drill costs no authored content: the key is an item's own `paraphrase_link` and the
 * three wrong extracts are other items' text phrases, ranked by word overlap with the
 * stem. That ranking is the point — the wrong options are genuine keyword matches, so a
 * learner who is matching words rather than meanings fails the item, which is exactly what
 * happens to them in the paper.
 *
 * The second move, offered once the extract is picked, is worth as much as the first:
 * was the rewording meaning-**preserving** or meaning-**changing**? A rewording that
 * changes scope (`some` → `all`) or certainty (`may reduce` → `reduces`) is what makes a
 * statement FALSE rather than TRUE. Sorting a rewording into those two buckets is, more or
 * less, doing True/False/Not Given — which is why it is scored rather than shown.
 */
export function ParaphraseItem({
  item,
  value,
  onChange,
  disabled,
}: {
  item: DrillItem;
  value: ParaphraseAnswer;
  onChange: (next: ParaphraseAnswer) => void;
  disabled?: boolean;
}) {
  const options = item.options ?? [];
  const step = item.device_step;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          The question says
        </p>
        <p className="mt-1 text-[14px] font-medium leading-relaxed">
          &ldquo;{item.stem_phrase}&rdquo;
        </p>
        {item.source_prompt && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            From: {item.source_prompt}
          </p>
        )}
      </div>

      <div role="radiogroup" aria-label={`Question ${item.index}: ${item.prompt}`} className="space-y-1.5">
        {options.map((option) => {
          const active = value.given.toUpperCase() === option.key.toUpperCase();
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange({ ...value, given: active ? "" : option.key })}
              className={cn(
                "flex w-full gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-60",
                active
                  ? "border-primary bg-primary/8"
                  : "border-border hover:bg-accent",
              )}
            >
              <span className="w-4 shrink-0 text-[13px] font-semibold tabular text-primary">
                {option.key}
              </span>
              <span className="min-w-0 text-[13px] leading-relaxed">{option.text}</span>
            </button>
          );
        })}
      </div>

      {step && value.given && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-[13px] font-medium">{step.question}</p>
            <Badge tone="outline">Step 2</Badge>
          </div>
          <div
            role="radiogroup"
            aria-label="Did the rewording change the meaning?"
            className="mt-1.5 flex flex-wrap gap-1.5"
          >
            {step.options.map((option) => {
              const active = value.device === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={disabled}
                  onClick={() => onChange({ ...value, device: active ? "" : option })}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-[13px] font-medium capitalize transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    active
                      ? "border-primary bg-primary/12 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {option}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{step.why}</p>
        </div>
      )}
    </div>
  );
}
