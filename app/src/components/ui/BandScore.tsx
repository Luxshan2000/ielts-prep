import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { bandBucket, bandVar, formatBand } from "@/lib/format";

export interface BandScoreProps {
  /** IELTS band, 0–9 in 0.5 steps. */
  band: number;
  size?: "sm" | "md" | "lg";
  /** Criterion name shown under/next to the numeral, e.g. "Fluency". */
  label?: string;
  /**
   * Play the 12 §4 band-reveal: badge scales in and the numeral counts up over
   * 900 ms. Automatically renders at the final value under reduced motion.
   */
  reveal?: boolean;
  className?: string;
}

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** rAF count-up, easeOutCubic, one decimal (12 §4 band-reveal composite). */
function useCountUp(target: number, enabled: boolean, durationMs = 900): number {
  const [value, setValue] = useState(enabled ? 0 : target);
  const frame = useRef<number>();

  useEffect(() => {
    if (!enabled || prefersReducedMotion()) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [target, enabled, durationMs]);

  return value;
}

/**
 * Announce a revealed band once, shortly after mount.
 *
 * `role="img"` + `aria-label` names the badge for anyone who navigates to it, but a
 * score that *arrives* — the moment a report finishes scoring — is exactly the kind
 * of change a screen reader should volunteer. A live region only fires for content
 * that changes *after* it exists, so the region is rendered empty first and filled
 * on the next tick. Returns "" when there is nothing to announce.
 */
function useRevealAnnouncement(text: string, enabled: boolean): string {
  const [announced, setAnnounced] = useState("");

  useEffect(() => {
    if (!enabled) {
      setAnnounced("");
      return;
    }
    const id = setTimeout(() => setAnnounced(text), 60);
    return () => clearTimeout(id);
  }, [text, enabled]);

  return announced;
}

/**
 * The band badge. Color encodes the 12 §8.2 bucket, but the numeral is ALWAYS
 * rendered — color is never the only encoding (the light amber bucket sits at
 * 2.7:1 and the numeral is its required relief).
 */
export function BandScore({ band, size = "md", label, reveal = false, className }: BandScoreProps) {
  const shown = useCountUp(band, reveal);
  const bucket = bandBucket(band);
  const color = `hsl(var(${bandVar(band)}))`;
  const tint = `hsl(var(${bandVar(band)}) / 0.12)`;
  const text = formatBand(shown);

  const a11y = `Band ${formatBand(band)}${label ? `, ${label}` : ""}`;
  const announcement = useRevealAnnouncement(a11y, reveal);

  /* Rendered alongside every variant; empty unless this badge is a reveal. */
  const liveRegion = reveal ? (
    <span className="sr-only" aria-live="polite" aria-atomic="true">
      {announcement}
    </span>
  ) : null;

  if (size === "sm") {
    return (
      <>
      <span
        role="img"
        aria-label={a11y}
        data-band-bucket={bucket}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[13px] font-semibold tabular",
          reveal && "animate-band-reveal",
          className,
        )}
        style={{ backgroundColor: tint, color }}
      >
        {label && <span className="font-medium opacity-80">{label}</span>}
        <span>{text}</span>
      </span>
      {liveRegion}
      </>
    );
  }

  if (size === "md") {
    return (
      <>
      <span
        role="img"
        aria-label={a11y}
        data-band-bucket={bucket}
        className={cn("inline-flex flex-col items-center gap-1", className)}
      >
        <span
          className={cn(
            "flex h-12 min-w-[3rem] items-center justify-center rounded-xl px-3 text-[24px] font-semibold leading-none tabular text-background",
            reveal && "animate-band-reveal",
          )}
          style={{ backgroundColor: color }}
        >
          {text}
        </span>
        {label && <span className="text-[11px] text-muted-foreground">{label}</span>}
      </span>
      {liveRegion}
      </>
    );
  }

  return (
    <>
    <span
      role="img"
      aria-label={a11y}
      data-band-bucket={bucket}
      className={cn("inline-flex flex-col items-center gap-2", className)}
    >
      <span
        className={cn(
          "flex h-[104px] w-[104px] items-center justify-center rounded-full text-[40px] font-semibold leading-none tabular text-background",
          reveal && "animate-band-reveal",
        )}
        style={{ backgroundColor: color, boxShadow: `0 0 0 6px ${tint}` }}
      >
        {text}
      </span>
      {label && <span className="text-[13px] text-muted-foreground">{label}</span>}
    </span>
    {liveRegion}
    </>
  );
}
