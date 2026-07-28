/**
 * Learner-facing labels and the colour vocabulary of the diff.
 *
 * The buckets, slots and signpost kinds all have authored copy on the server, so nothing
 * here re-states what a bucket *means* — that would be two sources for one sentence. What
 * lives here is presentation: which tone a bucket is drawn in, and the short-form headings
 * a chip has room for.
 */

import type { DrillKind, DrillMode } from "./types";

export const KIND_LABEL: Record<DrillKind, string> = {
  dictation: "Dictation",
  numbers: "Numbers & spelling",
  signpost: "Signposts",
  prediction: "Prediction",
};

export const MODE_LABEL: Record<string, string> = {
  transcribe: "From the audio",
  form: "From what was said",
  recognise: "What is coming",
  cue: "When it is coming",
};

/**
 * Diff tones. The one decision that matters: **`spelling` is not drawn as an error.**
 * A misspelled word was heard, and colouring it the same red as a word that never reached
 * the learner would teach exactly the wrong lesson — it is drawn as a warning, the way an
 * exam zero that is not a listening failure deserves.
 */
export type DiffTone = "ok" | "warn" | "miss" | "extra";

export const BUCKET_TONE: Record<string, DiffTone> = {
  function_word: "miss",
  segmentation: "miss",
  spelling: "warn",
  dropout: "miss",
  content_word: "miss",
  substitution: "miss",
  inserted: "extra",
};

export const TONE_CLASS: Record<DiffTone, string> = {
  ok: "text-foreground",
  warn: "rounded bg-warning/12 px-1 text-warning underline decoration-dotted underline-offset-2",
  miss: "rounded bg-destructive/12 px-1 text-destructive line-through",
  extra: "rounded bg-muted px-1 text-muted-foreground line-through",
};

/** Short chip captions — the full sentence is on the bucket card underneath. */
export const BUCKET_SHORT: Record<string, string> = {
  function_word: "weak forms",
  segmentation: "word boundaries",
  spelling: "spelling only",
  dropout: "dropped out",
  content_word: "vocabulary",
  substitution: "guesses",
  inserted: "added words",
};

export const VERDICT_LABEL: Record<string, string> = {
  on_time: "On time",
  early: "Early",
  late: "Late",
  no_press: "No press",
};

export function modeLabel(mode: DrillMode): string | null {
  return mode ? (MODE_LABEL[mode] ?? mode) : null;
}

/** `12345` → `0:12.3`, for the millisecond offsets on a cue result. */
export function formatMs(ms: number): string {
  const sign = ms < 0 ? "−" : "+";
  const abs = Math.abs(ms);
  return `${sign}${(abs / 1000).toFixed(1)}s`;
}

export function clockMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
