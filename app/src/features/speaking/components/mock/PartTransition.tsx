/**
 * The moment between parts.
 *
 * A real test does not stop and offer you a menu here — the examiner says one scripted
 * line and moves on, and the candidate's job is to keep up. So this is a statement
 * that appears, holds for a beat and leaves on its own. It has no buttons, it cannot
 * be dismissed early by accident, and it never pauses the session underneath: the
 * examiner is already talking while it is on screen.
 *
 * It is announced politely to screen readers, since the part change is real
 * information a blind candidate needs and the visual card is not available to them.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { TRANSITIONS } from "./script";
import type { PartNumber } from "./analysis";

/** Long enough to read one line without stealing time from the part it introduces. */
const HOLD_MS = 3_200;

export interface PartTransitionProps {
  /** The part being entered, or null for no transition. */
  part: PartNumber | null;
  onDone: () => void;
  className?: string;
}

export function PartTransition({ part, onDone, className }: PartTransitionProps) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (part === null) return;
    setShown(true);
    const handle = window.setTimeout(() => {
      setShown(false);
      onDone();
    }, HOLD_MS);
    return () => window.clearTimeout(handle);
  }, [onDone, part]);

  if (part === null || !shown) return null;
  const copy = TRANSITIONS[part];

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-8 py-12 text-center",
        reduced ? undefined : "animate-fade-in",
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {copy.heading}
      </p>
      <p className="max-w-xl text-[15px] leading-7 text-foreground">{copy.line}</p>
    </div>
  );
}
