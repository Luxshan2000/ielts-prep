import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { TrapInfo } from "./types";

/**
 * "What went wrong?" — asked **before** the reveal opens, never after.
 *
 * This is the cheapest high-impact control in the module. Learners who can explain their
 * own corrections improve; learners who read explanations passively do not. Making the
 * learner commit to a diagnosis first turns the reveal from something they skim into
 * something they check themselves against — and the disagreement between what they picked
 * and what the item was built as is a genuine metacognition signal in its own right.
 *
 * The list is filtered by the server to the five to nine slugs plausible for this
 * question type. Showing all twenty-seven would produce a menu nobody reads.
 *
 * **"I'm not sure" is always present and is itself informative.** Removing it does not
 * produce better data, it produces guesses.
 */
export function SelfDiagnose({
  options,
  value,
  onChange,
  disabled,
  className,
}: {
  options: TrapInfo[];
  value: string | null;
  onChange: (slug: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  if (options.length === 0) return null;

  return (
    <fieldset className={cn("rounded-xl border border-border bg-muted/20 p-3", className)}>
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Before the answer: what do you think went wrong?
      </legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = value === option.slug;
          return (
            <button
              key={option.slug}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              title={option.what}
              onClick={() => onChange(active ? null : option.slug)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[12px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? "border-primary bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {option.name}
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          aria-pressed={value === "unsure"}
          onClick={() => onChange(value === "unsure" ? null : "unsure")}
          className={cn(
            "rounded-md border border-dashed px-2.5 py-1 text-[12px] transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            value === "unsure"
              ? "border-foreground/40 bg-muted text-foreground"
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          I'm not sure
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Optional, and worth more than it looks: naming the error yourself is what turns a
        reveal you read into a habit you change.
      </p>
    </fieldset>
  );
}

/** Compact summary of one item's diagnosis agreement, for the report list. */
export function DiagnosisChip({ agreed }: { agreed: boolean }) {
  return (
    <Badge tone={agreed ? "success" : "warning"}>
      {agreed ? "You named it" : "Different trap"}
    </Badge>
  );
}
