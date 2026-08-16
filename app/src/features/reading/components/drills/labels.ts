/**
 * Pure presentation rules for the drill surface.
 *
 * Everything here is a decision the UI has to make repeatedly and must make the same way
 * every time: how a verdict row is toned, what a two-stage diagnosis is *called* in
 * learner-facing words, and which order the solution card's five parts appear in. Keeping
 * them out of the components is what lets them be tested without a renderer, and the
 * two-stage naming in particular is worth testing — "you did not locate it" and "you
 * located it and read it backwards" are two different lessons and the app must never
 * swap them.
 */

import type { BadgeTone } from "@/components/ui";
import type { ItemResult, TrapFamily, TwoStageResult, VerdictRow } from "./types";

/** Family headings, ordered as the profile lists them: judgement first, form last. */
export const FAMILY_ORDER: TrapFamily[] = ["judgement", "proposition", "locating", "form"];

export const FAMILY_LABEL: Record<TrapFamily, string> = {
  judgement: "Judgement",
  proposition: "Proposition matching",
  locating: "Locating and choosing",
  form: "Form and pacing",
};

/**
 * Form traps are shown apart from the rest and never averaged in with them: an over-limit
 * answer and a missed contradiction need completely different fixes, and a single
 * "accuracy" number that mixes them hides both.
 */
export function isFormTrap(family: TrapFamily): boolean {
  return family === "form";
}

export function familyTone(family: TrapFamily): BadgeTone {
  return family === "form" ? "outline" : family === "judgement" ? "destructive" : "warning";
}

/** The five parts of the solution card, in the fixed order they are always rendered. */
export const SOLUTION_ORDER = [
  "Location",
  "Paraphrase link",
  "Decision rule",
  "Distractor autopsy",
  "Rule to reuse",
] as const;

export function verdictTone(row: VerdictRow, chosen: string | null): BadgeTone {
  if (row.role === "key") return "success";
  return chosen && row.verdict.toUpperCase() === chosen.toUpperCase() ? "destructive" : "outline";
}

/**
 * What a two-stage result actually taught, in the learner's words.
 *
 * The whole point of splitting the item is that these four outcomes are four different
 * problems. `did_not_locate` and `located_wrong_direction` look identical on a score
 * sheet and want opposite remedies — one is a searching failure, one is a reading one.
 */
export const TWO_STAGE_VERDICT: Record<
  NonNullable<TwoStageResult["diagnosis"]>,
  { title: string; note: string; tone: BadgeTone }
> = {
  located_and_read: {
    title: "Found it, read it right",
    note: "You settled whether the passage deals with it, then read which way. That is the whole procedure.",
    tone: "success",
  },
  located_wrong_direction: {
    title: "Found it, read it backwards",
    note: "You knew the passage settles this and you took the wrong side. That is a close-reading fix, not a searching one: slow down on the two sentences you already located.",
    tone: "warning",
  },
  did_not_locate: {
    title: "Never found it",
    note: "You called it NOT GIVEN and the passage does settle it. That is a searching failure. Widen the band you searched before you widen the reading.",
    tone: "destructive",
  },
  read_something_that_was_not_there: {
    title: "Found something that is not there",
    note: "You decided the passage settles this and it does not. Ask what sentence you would quote. If you cannot name one, the answer is NOT GIVEN.",
    tone: "destructive",
  },
};

/** Human name for a form/pacing failure, which is never a comprehension failure. */
export const FORM_TRAP_LABEL: Record<string, string> = {
  over_limit: "Over the word limit: right content, wrong length. Articles count.",
  spelling: "A spelling slip, not a reading error. The answer was on the screen.",
  ran_out_of_time: "Left blank. That is a pacing problem and it needs a pacing fix.",
};

/**
 * The single sentence to lead a summary with, chosen by what actually went wrong.
 *
 * One recommendation, never a list: a results screen that offers five next actions gets
 * none of them done.
 */
export function headlineFor(report: {
  n_items: number;
  n_correct: number;
  per_trap: { name: string; lost: number }[];
  results: ItemResult[];
}): string {
  const wrong = report.n_items - report.n_correct;
  if (report.n_items === 0) return "Nothing to mark yet.";
  if (wrong === 0) {
    return "Every one right. Take the same drill with bounded search off, or move to a harder trap.";
  }
  const blanks = report.results.filter((r) => r.marking.form_trap === "ran_out_of_time").length;
  if (blanks >= Math.ceil(wrong / 2)) {
    return `${blanks} of your ${wrong} losses were blanks. That is pacing, not reading. Guess, flag, and move on.`;
  }
  const worst = [...report.per_trap].sort((a, b) => b.lost - a.lost)[0];
  if (worst && worst.lost > 0) {
    return `${worst.lost} of your ${wrong} losses were the same trap: ${worst.name.toLowerCase()}. Drill that one next.`;
  }
  return `${wrong} lost, with no single trap behind them. Read each reveal before you start another set.`;
}

/** `matching_headings` → `Matching headings`. Kept local so the drill has no odd deps. */
export function humanise(slug: string): string {
  const spaced = slug.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
