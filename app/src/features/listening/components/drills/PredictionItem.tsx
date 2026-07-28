import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DrillItem } from "./types";

/**
 * The gap, the frame, five chips — and no audio anywhere.
 *
 * This is the drill a learner can do on a bus, and it trains the technique with the largest
 * measured gain for weak listeners: deciding what *kind* of word can fill a gap before any
 * sound exists. A candidate who has committed to "plural noun" cannot write a number into
 * that gap and cannot be talked out of it by a speaker who offers one.
 *
 * Two presentation decisions carry the teaching.
 *
 * **The printed question is shown whole, not cropped to the gap.** The constraint lives in
 * the frame — the determiner before the blank, the unit printed after it, the parallel -ing
 * forms in the column above. Cropping to the blank would remove the only evidence there is.
 *
 * **The lures are the neighbours.** The wrong options come from the key's own family first —
 * singular against plural against uncountable — so the item cannot be answered by ruling out
 * absurdities. That is also the discrimination the answer sheet punishes: a dropped `-s` is
 * a whole mark.
 */
export function PredictionItem({
  item,
  value,
  onChange,
  disabled,
}: {
  item: DrillItem;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="outline">Question {item.number}</Badge>
        <Badge tone="primary">No audio</Badge>
      </div>

      {item.group_strategy?.preview_focus && (
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
            In the real preview you would be doing this to all of them at once
          </p>
          <p className="mt-1 text-[13px]">{item.group_strategy.preview_focus}</p>
          {item.group_strategy.order_note && (
            <p className="mt-1 text-[13px] text-muted-foreground">
              {item.group_strategy.order_note}
            </p>
          )}
        </div>
      )}

      {item.prompt && (
        <pre className="whitespace-pre-wrap rounded-lg border border-border p-3 font-sans text-[14px] leading-relaxed">
          {item.prompt}
        </pre>
      )}

      {item.instruction && (
        <p className="text-[12px] text-muted-foreground">{item.instruction}</p>
      )}

      <div className="space-y-2">
        <p className="text-[13px] font-medium">What are you listening for?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(item.options ?? []).map((option) => (
            <button
              key={option.slug}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.slug)}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                value === option.slug
                  ? "border-primary bg-primary/8"
                  : "border-border hover:bg-muted/40",
                disabled && "opacity-60",
              )}
            >
              <span className="block text-[13px] font-medium">{option.label}</span>
              {option.what && (
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  {option.what}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
