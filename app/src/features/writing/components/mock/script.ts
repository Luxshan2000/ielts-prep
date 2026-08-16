/**
 * Everything the writing mock *says*, in one file.
 *
 * Two rules govern this copy and both are load-bearing:
 *
 *  1. **The sitting never teaches.** Inside the hour the interface may state the
 *     format — how long, how many words, which task — because the real paper prints
 *     exactly that on the front. It must never suggest content, structure, phrasing
 *     or strategy. If a line here would help somebody write better *right now*, it
 *     belongs in the coach.
 *  2. **Nothing here promises what the engine does not do.** The minima and the
 *     minutes are the sidecar's own values restated for the candidate.
 */

/** The 60 minutes as the paper hands them over. */
export interface TaskOutline {
  key: "task1" | "task2";
  title: string;
  target: string;
  minWords: number;
  what: string;
}

export const TASK_OUTLINE: TaskOutline[] = [
  {
    key: "task1",
    title: "Task 1",
    target: "about 20 minutes",
    minWords: 150,
    what: "A report on what a visual shows, or a letter for a given situation. It is worth half as much as Task 2.",
  },
  {
    key: "task2",
    title: "Task 2",
    target: "about 40 minutes",
    minWords: 250,
    what: "An essay responding to a position or a question. It carries twice the weight of Task 1 in the final band.",
  },
];

export interface Expectation {
  id: string;
  title: string;
  detail: string;
}

/** The terms of entry. Each is a promise the sitting keeps. */
export const EXPECTATIONS: Expectation[] = [
  {
    id: "one-clock",
    title: "One clock for both tasks, and it does not pause",
    detail:
      "Sixty minutes total. You move between Task 1 and Task 2 whenever you like and spend the hour however you like. That freedom is the thing being practised, and it is where most candidates lose the marks.",
  },
  {
    id: "no-help",
    title: "No coach, no frameworks, no phrase help, no spellcheck",
    detail:
      "None of it is hidden behind a setting: those panels are simply not built into this screen. The model answers for these two prompts stay locked until the sitting is over.",
  },
  {
    id: "no-auto-submit",
    title: "Nothing submits itself at zero",
    detail:
      "When the hour runs out the clock turns red and counts upwards. Anything you write after that is recorded as overtime and named in the report, because in the real room it would not exist.",
  },
  {
    id: "one-report",
    title: "One submission, two marked answers, one estimate",
    detail:
      "Both answers go to the examiner model together. The report opens on how you spent the hour, then the two band sets, then a weighted estimate. It is the only place in BandReady where a combined Writing band is shown.",
  },
];

/** Restated inside the sitting, where it is a statement of fact rather than a warning. */
export const CONDITIONS_LINE =
  "Exam conditions: one clock, no help of any kind, nothing submits itself.";

/**
 * The honesty paragraph about the combined figure. Shown on the pre-flight screen
 * as well as the report, so nobody meets it for the first time after the fact.
 */
export const WEIGHTING_NOTE =
  "Task 2 counts twice as much as Task 1. We estimate the paper band as (Task 1 + 2 × Task 2) ÷ 3, rounded to the nearest half band. That 1:2 weighting is consistently reported by the test-makers but the exact rounding order is not published, so treat the figure as an estimate and watch the trend rather than any single number.";

export const ABANDON_CONFIRM =
  "Leaving ends this sitting. Both drafts are saved and stay in your history, but the hour cannot be resumed and neither answer will be marked as part of a mock.";
