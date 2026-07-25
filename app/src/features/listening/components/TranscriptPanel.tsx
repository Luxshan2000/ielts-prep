import { useEffect, useRef, type ReactNode } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTimestamp } from "@/lib/format";
import type { ScriptSpeaker } from "../types";

export interface TranscriptLineView {
  index: number;
  speaker?: string | null;
  text?: string | null;
  start_ms?: number | null;
}

export interface TranscriptPanelProps {
  lines: TranscriptLineView[];
  speakers?: ScriptSpeaker[];
  /** Line carrying the answer — scrolled to and tinted. */
  highlightIndex?: number | null;
  /** Accepted answer variants; the first one found is marked inside the line. */
  highlightTerms?: string[];
  /** Seek the (unlocked) player to a line's offset. */
  onJump?: (ms: number) => void;
  className?: string;
}

/** Escape a variant before it goes into a RegExp. */
function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Mark the answer phrase inside its line, case-insensitively. */
function markAnswer(text: string, terms: string[]): ReactNode {
  const usable = terms.map((t) => t.trim()).filter((t) => t.length > 1);
  if (usable.length === 0) return text;
  const pattern = new RegExp(`(${usable.map(escapeRe).join("|")})`, "ig");
  const pieces = text.split(pattern);
  if (pieces.length === 1) return text;
  return pieces.map((piece, index) =>
    index % 2 === 1 ? (
      <mark
        key={index}
        className="rounded bg-primary/25 px-0.5 text-foreground"
      >
        {piece}
      </mark>
    ) : (
      <span key={index}>{piece}</span>
    ),
  );
}

/**
 * The script transcript. Withheld by the server during a test (07 §4) — this
 * only ever renders content the sidecar has already unlocked.
 */
export function TranscriptPanel({
  lines,
  speakers = [],
  highlightIndex = null,
  highlightTerms = [],
  onJump,
  className,
}: TranscriptPanelProps) {
  const activeRef = useRef<HTMLDivElement | null>(null);
  const names = new Map(speakers.map((s) => [s.id, s.name || s.id]));

  useEffect(() => {
    if (highlightIndex === null) return;
    // Optional call: jsdom and some embedded webviews do not implement it.
    activeRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [highlightIndex]);

  if (lines.length === 0) {
    return (
      <p className={cn("text-[13px] text-muted-foreground", className)}>
        This part has no transcript lines.
      </p>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      {lines.map((line) => {
        const active = highlightIndex === line.index;
        const text = line.text ?? "";
        return (
          <div
            key={line.index}
            ref={active ? activeRef : undefined}
            className={cn(
              "flex gap-2 rounded-lg px-2 py-1.5 text-[13px] leading-relaxed",
              active ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-accent/60",
            )}
          >
            {onJump && typeof line.start_ms === "number" ? (
              <button
                type="button"
                onClick={() => onJump(line.start_ms as number)}
                className="mt-px flex h-5 shrink-0 items-center gap-1 rounded px-1 text-[11px] tabular-nums text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Play from ${formatTimestamp(line.start_ms)}`}
              >
                <Play className="h-3 w-3" aria-hidden="true" />
                {formatTimestamp(line.start_ms)}
              </button>
            ) : (
              <span className="mt-px w-10 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {typeof line.start_ms === "number" ? formatTimestamp(line.start_ms) : ""}
              </span>
            )}
            <p className="min-w-0 flex-1">
              {line.speaker && (
                <span className="mr-1.5 font-semibold text-muted-foreground">
                  {names.get(line.speaker) ?? line.speaker}:
                </span>
              )}
              {active ? markAnswer(text, highlightTerms) : text}
            </p>
          </div>
        );
      })}
    </div>
  );
}
