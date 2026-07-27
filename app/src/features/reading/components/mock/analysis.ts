/**
 * What the mock report says, derived from data the attempt already stores.
 *
 * Pure functions, no React, no network — the arithmetic of a reading paper is worth
 * testing on its own, and the report screen should contain layout and nothing else.
 *
 * The ordering is the argument. Pacing comes before the raw score and the raw score
 * before the band, because the expensive mistake in this paper is almost never a
 * comprehension failure: it is four minutes spent on one True/False item and six
 * questions left blank at the end. A band figure hides that completely, and the
 * remedies for "I could not decide" and "I ran out of time" have nothing in common.
 */

import { pacingFor } from "../coach/labels";
import { qtypeLabel } from "../../qtypes";
import type { MarkedQuestion, ReadingFormat, ReviewRecord } from "../../types";

/** Above this, a single question has stopped being worth its own time. */
export const SLOW_QUESTION_MS = 120_000;

export interface PassagePacing {
  passageId: string;
  title: string;
  position: number;
  correct: number;
  total: number;
  /** Measured from per-question focus time; 0 when the attempt recorded none. */
  spentSeconds: number;
  targetSeconds: number;
}

function secondsByPassage(
  questions: MarkedQuestion[],
  timeMs: Record<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const question of questions) {
    const ms = timeMs[String(question.number)] ?? 0;
    if (ms <= 0) continue;
    out.set(question.passage_id, (out.get(question.passage_id) ?? 0) + ms / 1000);
  }
  return out;
}

export function pacingRows(
  review: ReviewRecord,
  timeMs: Record<string, number>,
): PassagePacing[] {
  const format = (review.format as ReadingFormat) ?? "academic";
  const spent = secondsByPassage(review.per_question ?? [], timeMs);
  return (review.per_passage ?? []).map((passage, index) => ({
    passageId: passage.passage_id,
    title: passage.title ?? passage.passage_id,
    position: index + 1,
    correct: passage.correct,
    total: passage.total,
    spentSeconds: Math.round(spent.get(passage.passage_id) ?? 0),
    targetSeconds: pacingFor(format, index + 1) * 60,
  }));
}

/** True when the attempt recorded no per-question times at all. */
export function hasTiming(rows: PassagePacing[]): boolean {
  return rows.some((row) => row.spentSeconds > 0);
}

export interface CostLine {
  slowCount: number;
  slowSeconds: number;
  slowMarks: number;
  blankCount: number;
  /** The one sentence worth reading twice, or null when there is nothing in it. */
  sentence: string | null;
}

function minutes(seconds: number): string {
  const value = Math.round(seconds / 60);
  return `${value} minute${value === 1 ? "" : "s"}`;
}

export function costOfSlowQuestions(
  review: ReviewRecord,
  timeMs: Record<string, number>,
): CostLine {
  const questions = review.per_question ?? [];
  const slow = questions.filter((question) => (timeMs[String(question.number)] ?? 0) > SLOW_QUESTION_MS);
  const slowSeconds = Math.round(
    slow.reduce((sum, question) => sum + (timeMs[String(question.number)] ?? 0) / 1000, 0),
  );
  const slowMarks = slow.filter((question) => question.correct).length;
  const blanks = questions.filter((question) => !question.answered);

  let sentence: string | null = null;
  if (slow.length > 0) {
    sentence =
      `${slow.length} question${slow.length === 1 ? "" : "s"} cost you ${minutes(slowSeconds)} ` +
      `and returned ${slowMarks} mark${slowMarks === 1 ? "" : "s"}` +
      (blanks.length > 0
        ? `; ${blanks.length} question${blanks.length === 1 ? " was" : "s were"} left blank.`
        : ".");
  } else if (blanks.length > 0) {
    sentence = `${blanks.length} question${blanks.length === 1 ? " was" : "s were"} left blank, and a blank scores nothing while a guess sometimes does.`;
  }

  return {
    slowCount: slow.length,
    slowSeconds,
    slowMarks,
    blankCount: blanks.length,
    sentence,
  };
}

export type VerdictKind = "time" | "location" | "technique" | "clean";

export interface Verdict {
  kind: VerdictKind;
  headline: string;
  detail: string;
  tone: "warn" | "good";
}

/** Types whose answers are scattered — losing marks here is a locating problem. */
const SCATTERED_TYPES = new Set(["matching_headings", "matching_information", "matching_features"]);
/** The judgement types — losing marks here is a deciding problem. */
const JUDGEMENT_TYPES = new Set(["true_false_not_given", "yes_no_not_given"]);

/**
 * One verdict, never a list. Three diagnoses with three different remedies:
 * pacing, locating, deciding.
 */
export function verdictOf(review: ReviewRecord, timeMs: Record<string, number>): Verdict {
  const questions = review.per_question ?? [];
  const wrong = questions.filter((question) => !question.correct);
  const cost = costOfSlowQuestions(review, timeMs);

  if (wrong.length === 0) {
    return {
      kind: "clean",
      headline: "Forty out of forty.",
      detail:
        "Nothing to diagnose. Sit the other format, or move to a harder passage — this one is no longer measuring you.",
      tone: "good",
    };
  }

  if (cost.blankCount >= 3 || cost.slowCount >= 3) {
    return {
      kind: "time",
      headline: "This was a pacing problem before it was a reading problem.",
      detail:
        `${cost.blankCount} blank${cost.blankCount === 1 ? "" : "s"} and ` +
        `${cost.slowCount} question${cost.slowCount === 1 ? "" : "s"} over two minutes. ` +
        "Fix the clock first: two minutes maximum per question, a guess and a flag rather than a blank, and the palette swept at 58 minutes. Comprehension work on top of a broken clock shows up as nothing.",
      tone: "warn",
    };
  }

  const scattered = wrong.filter((question) => SCATTERED_TYPES.has(question.qtype)).length;
  const judgement = wrong.filter((question) => JUDGEMENT_TYPES.has(question.qtype)).length;

  if (scattered > judgement && scattered / wrong.length >= 0.4) {
    return {
      kind: "location",
      headline: "You lost most of these looking in the wrong place.",
      detail:
        "The damage is in the matching types, whose answers are not in passage order — which means the search was unbounded. Work the paragraph map before the questions, and place the items you are certain of first so each one narrows what is left.",
      tone: "warn",
    };
  }

  return {
    kind: "technique",
    headline: "You were in the right place and chose wrong.",
    detail:
      "The damage is concentrated in the deciding types rather than the finding ones. That is the paraphrase link and the three-way judgement — read the worked solutions for the ones you missed and name the trap each time before you look.",
    tone: "warn",
  };
}

// ------------------------------------------------------------- next actions ---

export interface NextAction {
  id: string;
  title: string;
  detail: string;
  to: string;
  cta: string;
}

/**
 * Two to four actions, each a link. Ordered by what will move the score most: the
 * wrong answers first, then the weakest type, then the passage that fell behind.
 */
export function buildNextActions(
  review: ReviewRecord,
  timeMs: Record<string, number>,
  attemptId: string,
): NextAction[] {
  const actions: NextAction[] = [];
  const questions = review.per_question ?? [];
  const wrong = questions.filter((question) => !question.correct);
  const rows = pacingRows(review, timeMs);

  if (wrong.length > 0) {
    actions.push({
      id: "review",
      title: `Work the ${wrong.length} you got wrong`,
      detail:
        "Four minutes of this is worth more than the next mock. Each one opens on the same question twice: where the answer was, and why the option you chose was written to attract you.",
      to: `/reading/review/${encodeURIComponent(attemptId)}`,
      cta: "Open the review",
    });
  }

  if (review.weakest_type) {
    const { qtype, correct, total } = review.weakest_type;
    actions.push({
      id: "drill",
      title: `Drill ${qtypeLabel(qtype)} — ${correct}/${total} this paper`,
      detail:
        "A drill pulls this type from across the whole bank and shows only the anchor paragraphs, so it trains the decision rather than the reading stamina.",
      to: `/reading?tab=drills&qtype=${encodeURIComponent(qtype)}`,
      cta: "Start the drill",
    });
  }

  const worst = [...rows]
    .filter((row) => row.total > 0)
    .sort((a, b) => a.correct / a.total - b.correct / b.total)[0];
  if (worst) {
    actions.push({
      id: `coach-${worst.passageId}`,
      title: `Study ${worst.title} in the coach`,
      detail:
        `${worst.correct} of ${worst.total} on this one. Its worked solutions are unlocked now, and so are its paraphrase pairs — that is the part that transfers to the next passage.`,
      to: `/reading/coach/${encodeURIComponent(worst.passageId)}`,
      cta: "Open the coach",
    });
  }

  const overrun = rows.find((row) => row.spentSeconds > row.targetSeconds * 1.25);
  if (overrun) {
    actions.push({
      id: `pacing-${overrun.passageId}`,
      title: `Passage ${overrun.position} took ${minutes(overrun.spentSeconds)} of a ${Math.round(overrun.targetSeconds / 60)}-minute budget`,
      detail:
        "Sit that passage alone against its own clock before the next full paper. Every minute over here was taken from a passage further down, where the marks are more expensive.",
      to: `/reading/coach/${encodeURIComponent(overrun.passageId)}`,
      cta: "Study it first",
    });
  }

  return actions.slice(0, 4);
}
