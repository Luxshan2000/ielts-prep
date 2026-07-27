/**
 * Everything the mock says, in one place.
 *
 * A mock is only worth sitting if it reproduces the conditions it claims to, and
 * nobody reproduces them by accident. So the briefing states what will happen, what
 * will *not* be available, and the one operational fact about this paper that costs
 * candidates marks every session — that the hour includes writing the answers down.
 */

import { PACING_MINUTES } from "../coach/labels";
import type { ReadingFormat } from "../../types";

/** The whole paper. Not configurable: a shorter mock is a different exercise. */
export const MOCK_SECONDS = 60 * 60;

/** Elapsed-seconds checkpoints for starting each passage, by format. */
export function checkpoints(format: ReadingFormat): number[] {
  const plan = PACING_MINUTES[format] ?? PACING_MINUTES.academic;
  return [plan[0] * 60, (plan[0] + plan[1]) * 60];
}

export function pacingPlan(format: ReadingFormat): [number, number, number] {
  return PACING_MINUTES[format] ?? PACING_MINUTES.academic;
}

export const FORMAT_LABEL: Record<ReadingFormat, string> = {
  academic: "Academic",
  general_training: "General Training",
};

export interface Condition {
  id: string;
  title: string;
  detail: string;
}

/** What the hour takes away, and why each one is in the list. */
export const CONDITIONS: Condition[] = [
  {
    id: "transfer",
    title: "There is no transfer time",
    detail:
      "Sixty minutes is the whole paper. Unlike Listening, Reading gives no extra time at the end to copy answers onto an answer sheet — the writing happens inside the hour. On screen the risk does not exist, and if you are sitting the paper test it certainly does.",
  },
  {
    id: "coaching",
    title: "No coaching of any kind",
    detail:
      "The strategy cards, the paragraph map, the paraphrase families, the vocabulary and the worked solutions are all shut while the clock runs. There is nothing to open in another tab.",
  },
  {
    id: "dictionary",
    title: "The dictionary is off",
    detail:
      "Double-clicking a word queues it silently instead. The list is waiting for you on the report, which is where a looked-up word is worth something.",
  },
  {
    id: "clock",
    title: "One clock, and it does not pause",
    detail:
      "Sixty minutes across three passages, counted in wall-clock time. Walking away does not stop it, and at zero the paper submits itself with whatever is on it.",
  },
  {
    id: "tools",
    title: "Highlighting and notes stay on",
    detail:
      "Computer-delivered IELTS has both, so removing them would make this less like the test rather than more.",
  },
  {
    id: "blank",
    title: "Never leave a blank",
    detail:
      "One mark per question, no negative marking, no partial credit. At 58 minutes stop answering and sweep the palette for anything empty.",
  },
];

/** The two facts about the band table that change how a learner reads their score. */
export const BAND_FACTS: Record<ReadingFormat, string> = {
  academic:
    "On Academic, seven marks separate band 6.0 from band 7.0 — roughly one bad True/False/Not Given group. The middle of the table is also crowded: 23 to 26 marks is all band 6.0, so three extra correct answers can move nothing. Read the raw score first and the band second.",
  general_training:
    "On General Training the same raw score buys a lower band: 30 out of 40 is band 6.0 here and band 7.0 on Academic. Sections 1 and 2 carry 27 of the 40 marks and are the easy ones, so near-full accuracy on the first twenty-seven is the band-6 lever.",
};

export const NO_TRANSFER_LINE =
  "60 minutes total — and unlike Listening, there is no extra time at the end to write your answers up.";
