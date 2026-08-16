/** Shared formatting + band-semantics helpers (12-design-system.md §8.2). */

export type BandBucket = "low" | "mid" | "good" | "strong";

/**
 * Absolute band buckets from 12 §8.2 (the shipped default; the target-relative
 * variant is open question 2 and is deliberately not implemented).
 */
export function bandBucket(band: number): BandBucket {
  if (band < 5) return "low";
  if (band < 6) return "mid";
  if (band < 7) return "good";
  return "strong";
}

/** CSS custom property holding the bucket's HSL triple. */
export function bandVar(band: number): string {
  return `--band-${bandBucket(band)}`;
}

/** `hsl(var(--band-*))`, optionally with an alpha, for inline styles. */
export function bandColor(band: number, alpha?: number): string {
  const v = `var(${bandVar(band)})`;
  return alpha === undefined ? `hsl(${v})` : `hsl(${v} / ${alpha})`;
}

/** `correct` out of `total` as a percentage. Zero questions is 0, never NaN. */
export function scorePct(correct: number, total: number): number {
  return total > 0 ? (correct / total) * 100 : 0;
}


/** One decimal, always — "6.5", "7.0". Never rounds; scores arrive pre-rounded. */
export function formatBand(band: number | null | undefined): string {
  if (band === null || band === undefined || Number.isNaN(band)) return "—";
  return band.toFixed(1);
}

/** Seconds → "m:ss" (or "h:mm:ss" past an hour). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Milliseconds → "m:ss" transcript timestamp. */
export function formatTimestamp(ms: number): string {
  return formatDuration(ms / 1000);
}

/** "12 minutes" / "1 minute" / "45 seconds". */
export function formatMinutes(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)} seconds`;
  const m = Math.round(minutes);
  return `${m} ${m === 1 ? "minute" : "minutes"}`;
}

const DAY_MS = 86_400_000;

/** Whole days from today to an ISO date; negative when already past. */
export function daysUntil(isoDate: string): number {
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return 0;
  const startOfDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfDay(target) - startOfDay(new Date())) / DAY_MS);
}

/** "Mon 4 Aug" — locale-aware short date used in tooltips and headers. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** "Good morning" / "Good afternoon" / "Good evening" — dashboard greeting. */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** IELTS-style word count: whitespace-separated tokens containing a letter/digit. */
export function countWords(text: string): number {
  const matches = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return matches ? matches.length : 0;
}

export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
