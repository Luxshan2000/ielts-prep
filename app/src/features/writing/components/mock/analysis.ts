/**
 * Turning one sitting into a small number of things to do next.
 *
 * The rule here is the same one that governs the whole report: **the time verdict
 * comes before any band.** Over-running Task 1 is the most expensive error in the
 * paper and it is invisible in a band score — a 6 on Task 1 with a 7.5 on Task 2
 * estimates as 7.0, while the reverse estimates as 6.5, so the hour spent
 * perfecting Task 1 costs a full half band and nothing on the report would say so
 * unless it was written down.
 *
 * Everything returned here is derived deterministically from the two attempts and
 * the recorded seconds. No model is called to produce a verdict about a model's
 * output.
 */

import {
  CRITERION_ORDER,
  criterionLabel,
  type CriterionKey,
  type WritingAttempt,
} from "../../store";
import { TARGET_SECONDS, type MockRecord, type MockTaskKey } from "./store";
import { minutesLabel } from "./format";

export interface NextAction {
  id: string;
  title: string;
  detail: string;
  /** Where the fix lives, when there is one screen that is the fix. */
  to?: string;
  cta?: string;
}

/** The headline sentence about how the hour was spent. */
export interface TimeVerdict {
  /** `good` when the split is close to 20/40, `warn` when it is not. */
  tone: "good" | "warn";
  headline: string;
  detail: string;
}

const OVERRUN_TOLERANCE = 5 * 60;

export function timeVerdict(record: MockRecord): TimeVerdict {
  const t1 = record.perTaskSeconds.task1;
  const t2 = record.perTaskSeconds.task2;
  const overtime = record.overtimeSeconds;

  if (t1 > TARGET_SECONDS.task1 + OVERRUN_TOLERANCE) {
    return {
      tone: "warn",
      headline: `You gave Task 1 ${minutesLabel(t1)} of the hour.`,
      detail: `The target is about 20 minutes. Task 2 is worth twice as much, so every minute moved from Task 1 to Task 2 is worth double. This is the single most expensive habit in the paper, and it costs nothing to fix.`,
    };
  }

  if (t2 < TARGET_SECONDS.task2 - OVERRUN_TOLERANCE) {
    return {
      tone: "warn",
      headline: `Task 2 got ${minutesLabel(t2)} of the hour.`,
      detail:
        "It carries two thirds of the writing band and needs closer to forty minutes, five of them for planning and five for checking. Whatever it did not get came out of the score that matters most.",
    };
  }

  if (overtime > 60) {
    return {
      tone: "warn",
      headline: `You wrote for ${minutesLabel(overtime)} past the hour.`,
      detail:
        "In the real room that writing would not exist. Both answers are marked as they stand, but read the bands knowing part of them was written on time you would not have had.",
    };
  }

  return {
    tone: "good",
    headline: `${minutesLabel(t1)} on Task 1, ${minutesLabel(t2)} on Task 2.`,
    detail:
      "That is the split the paper is designed around, and getting it right is worth more than any single sentence you wrote.",
  };
}

/**
 * The hard floor the sidecar refuses to evaluate below
 * (`scoring/writing.py` `DEFAULT_THRESHOLDS["hard_floor_words"]`).
 */
export const HARD_FLOOR_WORDS = 50;

/** Why one answer in a sitting carries no band, said accurately. */
export interface UnmarkedReason {
  headline: string;
  detail: string;
  /** True when the cause is the setup rather than the answer, so Settings is the fix. */
  setup: boolean;
}

/**
 * The report used to give one reason for every unmarked answer — the fifty-word floor —
 * regardless of what actually happened. On the default install, where no marking model
 * is running, that told somebody who had just written 400 words under exam conditions
 * that their answer was too short. The reason is knowable from the attempt itself, so
 * it is read off the attempt instead of guessed.
 */
export function unmarkedReason(attempt: WritingAttempt): UnmarkedReason {
  if (attempt.status === "failed") {
    return {
      setup: true,
      headline: "This answer could not be marked.",
      detail:
        "It was submitted, but the marking model did not return a result, most often because no model is set up or the local one was not running. Your answer is saved exactly as you wrote it, and submitting it again once marking works will score it.",
    };
  }

  if (attempt.word_count < HARD_FLOOR_WORDS) {
    return {
      setup: false,
      headline: `This answer is ${attempt.word_count} words.`,
      detail: `Under ${HARD_FLOOR_WORDS} words there is not enough writing to judge, so BandReady refuses it rather than inventing a band for it.`,
    };
  }

  if (attempt.status === "submitted") {
    return {
      setup: false,
      headline: "This answer is still being marked.",
      detail: "Marking usually takes under a minute. Reload this report to pick up the result.",
    };
  }

  return {
    setup: false,
    headline: "This answer was never submitted.",
    detail:
      "The sitting ended before it was sent for marking. Open the draft and submit it to have it scored.",
  };
}

/** The weakest criterion across both answers, which is where the next hour goes. */
export function weakestCriterion(
  attempts: (WritingAttempt | null)[],
): { key: CriterionKey; band: number } | null {
  let worst: { key: CriterionKey; band: number } | null = null;
  for (const attempt of attempts) {
    const bands = attempt?.evaluation?.bands;
    if (!bands) continue;
    for (const key of CRITERION_ORDER) {
      const band = bands[key];
      if (typeof band !== "number") continue;
      if (worst === null || band < worst.band) worst = { key, band };
    }
  }
  return worst;
}

export interface BuildActionsInput {
  record: MockRecord;
  task1: WritingAttempt | null;
  task2: WritingAttempt | null;
}

export function buildNextActions({ record, task1, task2 }: BuildActionsInput): NextAction[] {
  const actions: NextAction[] = [];
  const verdict = timeVerdict(record);

  if (verdict.tone === "warn") {
    actions.push({
      id: "time",
      title: verdict.headline,
      detail: verdict.detail,
    });
  }

  const under: string[] = [];
  const pairs: [MockTaskKey, WritingAttempt | null, number][] = [
    ["task1", task1, 150],
    ["task2", task2, 250],
  ];
  for (const [key, attempt, min] of pairs) {
    if (attempt && attempt.word_count > 0 && attempt.word_count < min) {
      under.push(
        `${key === "task1" ? "Task 1" : "Task 2"} came in at ${attempt.word_count} words against a ${min}-word minimum`,
      );
    }
  }
  if (under.length > 0) {
    actions.push({
      id: "length",
      title: "One of your answers was under length",
      detail: `${under.join(" and ")}. An under-length answer cannot cover the task, and criterion 1 is measured on coverage. This is arithmetic, not style.`,
    });
  }

  const weakest = weakestCriterion([task1, task2]);
  if (weakest) {
    actions.push({
      id: `criterion-${weakest.key}`,
      title: `${criterionLabel(weakest.key, task2?.prompt?.task_type ?? "task2")} is your floor, at band ${weakest.band.toFixed(1)}`,
      detail:
        "Your overall band is the average of the four, so the lowest one is the cheapest to move. The coach for either prompt has the language and the structures that criterion is asking for.",
    });
  }

  for (const [key, attempt] of [
    ["task1", task1],
    ["task2", task2],
  ] as const) {
    const promptId = attempt?.prompt?.id ?? record[key].promptId;
    if (!promptId) continue;
    actions.push({
      id: `coach-${key}`,
      title: `${key === "task1" ? "Task 1" : "Task 2"}: the models are unlocked now`,
      detail:
        "The same answer at bands 6, 7 and 8 (same content, only the language moves), plus the plan, the language bank and the one change that would most raise what you wrote. They stayed locked until you had sat it, because a model read beforehand is a script to memorise.",
      to: `/writing/coach/${encodeURIComponent(promptId)}`,
      cta: "Open the coach",
    });
  }

  return actions;
}
