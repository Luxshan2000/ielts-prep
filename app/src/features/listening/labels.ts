/**
 * Learner-facing names for the codes the sidecar stores.
 *
 * The database keeps `uk` / `us` / `au` and `exam` / `practice` / `accent_drill` because
 * they are stable keys. None of those is a word anyone preparing for IELTS would use, and
 * a badge reading "AU" tells a learner nothing about what they are about to hear.
 */

import type { AttemptMode } from "./types";

const ACCENTS: Record<string, string> = {
  uk: "British",
  us: "American",
  au: "Australian",
};

/** "uk" → "British". Unknown or missing accents fall back to the pack's default voice. */
export function accentLabel(accentSet: string | null | undefined): string {
  return ACCENTS[String(accentSet ?? "").toLowerCase()] ?? "British";
}

const MODES: Record<AttemptMode, string> = {
  exam: "Exam conditions",
  practice: "Practice",
  dictation: "Dictation drill",
  accent_drill: "Accent training",
};

/** How an attempt was taken, said the way the two tabs on the library say it. */
export function modeLabel(mode: AttemptMode | string | null | undefined): string {
  return MODES[mode as AttemptMode] ?? "Practice";
}
