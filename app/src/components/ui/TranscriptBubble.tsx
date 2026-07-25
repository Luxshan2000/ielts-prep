import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { formatTimestamp } from "@/lib/format";
import { buildSegments } from "./AnnotatedText";

export type TranscriptErrorKind = "grammar" | "lexical" | "pron";

export interface TranscriptError {
  /** UTF-16 offsets into `text`. */
  start: number;
  end: number;
  kind: TranscriptErrorKind;
  note: string;
}

export interface TranscriptBubbleProps {
  role: "examiner" | "candidate";
  text: string;
  /** Turn start offset from session start, in milliseconds. */
  tMs: number;
  errors?: TranscriptError[];
  /** Renders a live "…" tail while the turn is still being transcribed. */
  pending?: boolean;
  className?: string;
}

const kindClass: Record<TranscriptErrorKind, string> = {
  grammar: "decoration-destructive",
  lexical: "decoration-warning",
  pron: "decoration-[hsl(var(--band-good))]",
};

const kindLabel: Record<TranscriptErrorKind, string> = {
  grammar: "Grammar",
  lexical: "Vocabulary",
  pron: "Pronunciation",
};

export function TranscriptBubble({
  role,
  text,
  tMs,
  errors = [],
  pending = false,
  className,
}: TranscriptBubbleProps) {
  const segments = useMemo(() => buildSegments(text, errors), [text, errors]);
  const candidate = role === "candidate";

  return (
    <div
      className={cn(
        "flex w-full animate-fade-in flex-col gap-1",
        candidate ? "items-end" : "items-start",
        className,
      )}
    >
      <div className="flex items-baseline gap-2 px-1 text-[11px] text-muted-foreground">
        <span className="font-medium">{candidate ? "You" : "Examiner"}</span>
        <span className="tabular">{formatTimestamp(tMs)}</span>
      </div>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3.5 py-2 text-sm leading-6",
          candidate ? "bg-muted text-foreground" : "border border-border bg-card text-foreground",
        )}
      >
        {segments.map((seg, i) => {
          if (seg.annotation === null) return <span key={i}>{seg.text}</span>;
          const err = errors[seg.annotation];
          return (
            <span key={i} className="group/err relative inline">
              <span
                tabIndex={0}
                role="mark"
                aria-label={`${kindLabel[err.kind]}: ${err.note}`}
                className={cn(
                  "rounded-sm underline decoration-dashed decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  kindClass[err.kind],
                )}
              >
                {seg.text}
              </span>
              <span
                role="tooltip"
                className={cn(
                  "pointer-events-none absolute bottom-full left-0 z-40 mb-1 w-max max-w-xs rounded-md border border-border",
                  "bg-card px-2.5 py-1.5 text-[11px] leading-snug text-foreground shadow-xl",
                  "opacity-0 transition-opacity duration-100 group-hover/err:opacity-100 group-focus-within/err:opacity-100",
                )}
              >
                <span className="font-medium">{kindLabel[err.kind]}</span> — {err.note}
              </span>
            </span>
          );
        })}
        {pending && (
          <span className="ml-1 inline-block animate-pulse text-muted-foreground">…</span>
        )}
      </div>
    </div>
  );
}
