/**
 * The three small readouts along the editor's top bar (05 §3): live word count
 * against the minimum, the autosave indicator, and the timer.
 */

import { AlertTriangle, Check, CloudOff, Loader2 } from "lucide-react";
import { CircularTimer, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";

// -------------------------------------------------------------- word count ---

export interface WordCountProps {
  words: number;
  minWords: number;
}

/**
 * Warning tone below the minimum, normal at/above (05 §3). The numbers are always
 * spelled out, so color is never the only signal.
 */
export function WordCount({ words, minWords }: WordCountProps) {
  const under = words < minWords;
  const shortfall = minWords - words;
  const over = words - minWords;

  return (
    <Tooltip
      content={
        under
          ? `${shortfall} more ${shortfall === 1 ? "word" : "words"} to reach the ${minWords}-word minimum. Examiners penalise under-length answers.`
          : `${over} ${over === 1 ? "word" : "words"} above the ${minWords}-word minimum. There is no upper limit, but padding costs you Coherence.`
      }
    >
      <span
        className={cn(
          "inline-flex items-baseline gap-1.5 rounded-md px-2 py-1 text-[13px] tabular",
          under ? "bg-warning/15 text-warning" : "bg-muted text-foreground",
        )}
        aria-live="off"
      >
        <span className="font-semibold">{words}</span>
        <span className="opacity-70">/ {minWords} words</span>
      </span>
    </Tooltip>
  );
}

// ----------------------------------------------------------------- autosave ---

export interface SaveIndicatorProps {
  saving: boolean;
  dirty: boolean;
  savedAt: number | null;
  error: string | null;
}

function agoLabel(savedAt: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

/** Autosave runs every 10 s while dirty; this is the visible proof (05 §3). */
export function SaveIndicator({ saving, dirty, savedAt, error }: SaveIndicatorProps) {
  if (error) {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 rounded-md bg-destructive/15 px-2 py-1 text-[12px] text-destructive"
      >
        <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
        Not saved — retrying
      </span>
    );
  }
  if (saving) {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 px-2 py-1 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Saving…
      </span>
    );
  }
  if (dirty) {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 px-2 py-1 text-[12px] text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden="true" />
        Unsaved changes
      </span>
    );
  }
  return (
    <span role="status" className="inline-flex items-center gap-1.5 px-2 py-1 text-[12px] text-muted-foreground">
      <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
      {savedAt ? `Saved ${agoLabel(savedAt)}` : "Draft saved on the engine"}
    </span>
  );
}

// -------------------------------------------------------------------- timer ---

export interface AttemptTimerProps {
  mode: "practice" | "exam";
  elapsed: number;
  limitSec: number;
}

/**
 * Exam mode counts DOWN and, at zero, keeps counting overtime in destructive tone
 * — it never auto-submits (05 §3). Practice mode counts up with the exam limit
 * shown as a soft reference.
 */
export function AttemptTimer({ mode, elapsed, limitSec }: AttemptTimerProps) {
  if (mode === "practice") {
    return (
      <Tooltip content={`Untimed practice. The real exam allows ${Math.round(limitSec / 60)} minutes for this task.`}>
        <span className="inline-flex items-baseline gap-1.5 rounded-md bg-muted px-2 py-1 text-[13px] tabular text-foreground">
          <span className="font-semibold">{formatDuration(elapsed)}</span>
          <span className="opacity-70">elapsed</span>
        </span>
      </Tooltip>
    );
  }

  const remaining = limitSec - elapsed;
  if (remaining > 0) {
    return (
      <CircularTimer
        totalSec={limitSec}
        remainingSec={remaining}
        warnAtSec={120}
        size={52}
        label="Exam time"
      />
    );
  }

  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 rounded-md bg-destructive/15 px-2 py-1 text-[13px] tabular text-destructive"
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="font-semibold">+{formatDuration(-remaining)}</span>
      <span className="opacity-80">over the limit</span>
    </span>
  );
}
