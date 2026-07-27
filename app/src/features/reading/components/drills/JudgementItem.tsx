import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DrillItem } from "./types";

export interface JudgementAnswer {
  /** The final verdict: TRUE / FALSE / NOT GIVEN (or YES / NO / NOT GIVEN). */
  given: string;
  /** Two-stage runs only: the GIVEN / NOT GIVEN call that came first. */
  stageOne: string;
}

/**
 * One TRUE/FALSE/NOT GIVEN statement, in one of two shapes.
 *
 * **Plain**: the three verdicts as one segmented control.
 *
 * **Two-stage** (`item.two_stage`): the three-way decision split into two binaries —
 * first *does the passage settle this at all?*, then, only if it does, *which way?* This
 * is not a training-wheels version of the type. Nearly every lost TFNG mark is really a
 * lost GIVEN/NOT GIVEN mark wearing a TRUE/FALSE costume, and separating the two makes
 * the learner's own error visible to them before the reveal names it. Cambridge's own
 * teaching materials stage it exactly this way.
 *
 * Note that stage two is offered on **every** item, including the ones whose answer is
 * NOT GIVEN. It has to be: hiding it on those items would announce which they are. The
 * server decides whether stage two counted; the client just asks.
 */
export function JudgementItem({
  item,
  value,
  onChange,
  disabled,
}: {
  item: DrillItem;
  value: JudgementAnswer;
  onChange: (next: JudgementAnswer) => void;
  disabled?: boolean;
}) {
  const plan = item.two_stage;
  const choices = item.choices ?? ["TRUE", "FALSE", "NOT GIVEN"];

  if (!plan) {
    return (
      <VerdictRow
        name={`drill-${item.item_id}`}
        ariaLabel={`Question ${item.index}: ${item.prompt}`}
        options={choices}
        value={value.given}
        disabled={disabled}
        onChange={(next) => onChange({ ...value, given: next })}
      />
    );
  }

  const settled = value.stageOne === plan.two.when;
  return (
    <div className="space-y-3">
      <div>
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="text-[13px] font-medium">{plan.one.question}</p>
          <Badge tone="outline">Step 1</Badge>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{plan.one.hint}</p>
        <VerdictRow
          className="mt-1.5"
          name={`drill-${item.item_id}-stage1`}
          ariaLabel={`Question ${item.index}, step one: does the passage settle it?`}
          options={plan.one.options}
          value={value.stageOne}
          disabled={disabled}
          onChange={(next) =>
            onChange(
              // Backing out of "it is settled" must clear the direction too, or a stale
              // TRUE would be submitted alongside a NOT GIVEN call.
              next === plan.two.when
                ? { ...value, stageOne: next }
                : { stageOne: next, given: plan.not_given_label },
            )
          }
        />
      </div>

      {settled && (
        <div>
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-[13px] font-medium">{plan.two.question}</p>
            <Badge tone="outline">Step 2</Badge>
          </div>
          <VerdictRow
            className="mt-1.5"
            name={`drill-${item.item_id}-stage2`}
            ariaLabel={`Question ${item.index}, step two: which way?`}
            options={plan.two.options}
            value={value.given}
            disabled={disabled}
            onChange={(next) => onChange({ ...value, given: next })}
          />
        </div>
      )}
    </div>
  );
}

function VerdictRow({
  name,
  ariaLabel,
  options,
  value,
  onChange,
  disabled,
  className,
}: {
  name: string;
  ariaLabel: string;
  options: string[];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((option) => {
        const active = value.toUpperCase() === option.toUpperCase();
        return (
          <button
            key={option}
            type="button"
            role="radio"
            name={name}
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(active ? "" : option)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors",
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
  );
}
