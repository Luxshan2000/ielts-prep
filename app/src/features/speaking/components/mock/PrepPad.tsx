/**
 * The Part 2 desk: the task card, and the paper you are allowed to write on.
 *
 * In the real test the card and your notes stay in front of you for the whole long
 * turn, so they stay here too — the notes area is not cleared or locked when the
 * preparation minute ends. Notes are local to this screen: never sent to the model,
 * never persisted, never scored (02 §3.4). That is stated on screen, because a
 * candidate who suspects their notes are being read will not write freely.
 *
 * There is nothing here that helps you answer. No structure prompts, no sentence
 * starters, no vocabulary — the whole point of the sitting is to find out what you
 * can do without them.
 */

import { useEffect, useRef } from "react";
import { Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { CueCard } from "@/stores";

export interface PrepPadProps {
  card: CueCard;
  /** True during P2_INTRO / P2_PREP — the minute before the long turn. */
  preparing: boolean;
  notes: string;
  onNotesChange: (notes: string) => void;
  className?: string;
}

export function PrepPad({ card, preparing, notes, onNotesChange, className }: PrepPadProps) {
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const focused = useRef(false);

  // The minute is short and the keyboard should already be in the notes when it
  // starts — but only once, so a re-render mid-long-turn never steals focus back.
  useEffect(() => {
    if (!preparing || focused.current) return;
    focused.current = true;
    notesRef.current?.focus();
  }, [preparing]);

  return (
    <div className={cn("grid gap-4 lg:grid-cols-2", className)}>
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Task card
        </p>
        <p className="mt-2 text-[17px] font-semibold leading-7 text-foreground">{card.topic}</p>
        {card.bullets.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-[13px] text-muted-foreground">You should say:</p>
            <ul className="space-y-1.5 pl-5">
              {card.bullets.map((bullet, i) => (
                <li key={i} className="list-disc text-[15px] leading-7 text-foreground">
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-baseline justify-between gap-3">
          <label
            htmlFor="br-mock-notes"
            className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Your notes
          </label>
          <span className="text-[11px] text-muted-foreground">
            {preparing ? "One minute to prepare" : "Keep them in view while you talk"}
          </span>
        </div>
        <Textarea
          id="br-mock-notes"
          ref={notesRef}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={7}
          spellCheck={false}
          placeholder="Keywords only. You will not have time to read sentences back."
          className="mt-2 flex-1 text-[15px] leading-7"
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Nobody reads these but you. They are not sent anywhere, not saved, and not marked.
        </p>
      </div>
    </div>
  );
}
