import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type AnnotationSeverity = "error" | "improve" | "good";

export interface Annotation {
  /** UTF-16 offsets into `text`, half-open [start, end). */
  start: number;
  end: number;
  severity: AnnotationSeverity;
  note: string;
  /** Optional suggested replacement shown in the hover card. */
  suggestion?: string;
}

export interface AnnotatedTextProps {
  text: string;
  annotations: Annotation[];
  /** Fired when a span is clicked or focused — feeds the side-note pane. */
  onSelect?: (index: number, annotation: Annotation | null) => void;
  /** Enable n/p keyboard cycling (12 §8.1). Default true. */
  keyboardNav?: boolean;
  className?: string;
}

const severityClass: Record<AnnotationSeverity, string> = {
  error: "decoration-destructive text-foreground",
  improve: "decoration-warning text-foreground",
  good: "decoration-[hsl(var(--band-good))] text-foreground",
};

const severityBg: Record<AnnotationSeverity, string> = {
  error: "bg-destructive/10",
  improve: "bg-warning/12",
  good: "bg-[hsl(var(--band-good))]/10",
};

export interface TextSegment {
  text: string;
  /** Index into the annotations array, or null for plain text. */
  annotation: number | null;
}

/**
 * Split `text` into non-overlapping segments by annotation offsets. Overlapping
 * annotations are resolved first-wins (sorted by start, then by longest span) —
 * feedback payloads are expected non-overlapping but must never crash the view.
 */
export function buildSegments(text: string, ranges: { start: number; end: number }[]): TextSegment[] {
  const ordered = ranges
    .map((r, index) => ({ index, start: Math.max(0, r.start), end: Math.min(text.length, r.end) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const r of ordered) {
    if (r.start < cursor) continue; // overlap — skip
    if (r.start > cursor) segments.push({ text: text.slice(cursor, r.start), annotation: null });
    segments.push({ text: text.slice(r.start, r.end), annotation: r.index });
    cursor = r.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), annotation: null });
  return segments;
}

/**
 * Offset-based feedback overlay for essays and transcripts. Annotated spans get
 * a dashed underline plus a hover/focus card; `n`/`p` cycle through them.
 */
export function AnnotatedText({
  text,
  annotations,
  onSelect,
  keyboardNav = true,
  className,
}: AnnotatedTextProps) {
  const [active, setActive] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const segments = useMemo(() => buildSegments(text, annotations), [text, annotations]);

  const select = useCallback(
    (index: number | null) => {
      setActive(index);
      onSelect?.(index ?? -1, index === null ? null : annotations[index]);
    },
    [annotations, onSelect],
  );

  useEffect(() => {
    if (!keyboardNav || annotations.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key !== "n" && e.key !== "p") return;
      e.preventDefault();
      const current = active ?? -1;
      const next =
        e.key === "n"
          ? (current + 1) % annotations.length
          : (current - 1 + annotations.length) % annotations.length;
      select(next);
      containerRef.current
        ?.querySelector<HTMLElement>(`[data-annotation="${next}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, annotations.length, keyboardNav, select]);

  return (
    <div
      ref={containerRef}
      className={cn("whitespace-pre-wrap text-[15px] leading-7 text-foreground", className)}
    >
      {segments.map((seg, i) => {
        if (seg.annotation === null) return <span key={i}>{seg.text}</span>;
        const ann = annotations[seg.annotation];
        const isActive = active === seg.annotation;
        return (
          <span key={i} className="group/ann relative inline">
            <button
              type="button"
              data-annotation={seg.annotation}
              aria-label={`${ann.severity}: ${ann.note}`}
              onClick={() => select(isActive ? null : seg.annotation)}
              onFocus={() => select(seg.annotation)}
              className={cn(
                "cursor-pointer rounded-sm underline decoration-dashed decoration-2 underline-offset-4",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                severityClass[ann.severity],
                isActive && severityBg[ann.severity],
              )}
            >
              {seg.text}
            </button>
            <span
              role="tooltip"
              className={cn(
                "pointer-events-none absolute bottom-full left-0 z-40 mb-1 w-max max-w-xs rounded-md border border-border",
                "bg-card px-2.5 py-1.5 text-[11px] leading-snug text-foreground shadow-xl transition-opacity duration-100",
                isActive ? "opacity-100" : "opacity-0 group-hover/ann:opacity-100",
              )}
            >
              {ann.note}
              {ann.suggestion && (
                <span className="mt-1 block text-muted-foreground">→ {ann.suggestion}</span>
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}
