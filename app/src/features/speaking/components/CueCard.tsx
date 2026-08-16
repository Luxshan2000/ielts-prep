/**
 * Part 2 cue card (04 §1). Notes are LOCAL ONLY — they are never sent to the LLM
 * and never persisted (02 §3.4); they stay visible during the long turn because
 * that is what the paper card does in the real test.
 */

import { Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { CueCard as CueCardData } from "@/stores";

export interface CueCardProps {
  card: CueCardData;
  /** Show the "one minute to prepare" instruction (P2_INTRO / P2_PREP only). */
  prepping: boolean;
  notes: string;
  onNotesChange: (notes: string) => void;
  className?: string;
}

export function CueCard({ card, prepping, notes, onNotesChange, className }: CueCardProps) {
  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm animate-fade-in",
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Part 2 task card
      </p>
      <p className="text-[15px] font-semibold leading-6 text-foreground">{card.topic}</p>
      {card.bullets.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[13px] text-muted-foreground">You should say:</p>
          <ul className="space-y-1 pl-4">
            {card.bullets.map((bullet, i) => (
              <li key={i} className="list-disc text-[14px] leading-6 text-foreground">
                {bullet}
              </li>
            ))}
          </ul>
        </div>
      )}
      {prepping && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-foreground">
          You have one minute to prepare. You can make notes if you wish.
        </p>
      )}
      <div className="space-y-1.5">
        <label
          htmlFor="br-part2-notes"
          className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          Your notes
        </label>
        <Textarea
          id="br-part2-notes"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder="Jot down keywords. Nobody reads these but you."
          className="text-[14px] leading-6"
        />
      </div>
    </div>
  );
}
