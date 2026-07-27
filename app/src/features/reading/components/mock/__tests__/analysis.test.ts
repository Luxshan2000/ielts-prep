/**
 * The arithmetic behind the mock report.
 *
 * Asserted rather than eyeballed because every number here is a claim about the
 * exam that the learner will act on: that the passage budgets are front-loaded and
 * differ by module, that a question over two minutes is a pacing failure rather than
 * a comprehension one, and that blanks and slow questions get a different diagnosis
 * from wrong answers. A report that mixes those up teaches the wrong fix.
 */

import { describe, expect, it } from "vitest";
import {
  SLOW_QUESTION_MS,
  buildNextActions,
  costOfSlowQuestions,
  hasTiming,
  pacingRows,
  verdictOf,
} from "../analysis";
import { pacingFor } from "../../coach/labels";
import type { ReviewQuestion, ReviewRecord } from "../../../types";

function question(partial: Partial<ReviewQuestion> & { number: number }): ReviewQuestion {
  return {
    question_id: `q${partial.number}`,
    passage_id: "rp_1",
    qtype: "true_false_not_given",
    given: "TRUE",
    correct: true,
    flagged: false,
    answered: true,
    prompt: `Question ${partial.number}`,
    options: null,
    word_limit: null,
    instructions: "",
    accepted_answers: ["TRUE"],
    explanation: null,
    trap_note: null,
    locate: {
      passage_id: partial.passage_id ?? "rp_1",
      paragraph_id: "A",
      anchor_paragraphs: ["A"],
      evidence_quote: null,
    },
    why_wrong: null,
    can_ask_why: false,
    solution: null,
    ...partial,
  };
}

function review(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  const per_question = overrides.per_question ?? [
    question({ number: 1 }),
    question({ number: 2, correct: false, qtype: "matching_headings" }),
  ];
  return {
    attempt_id: "rd_1",
    mode: "full",
    format: "academic",
    raw_score: 30,
    total_questions: 40,
    scaled_raw_40: 30,
    band: 7,
    band_is_estimate: false,
    band_disclaimer: "estimate",
    per_question,
    per_type: {},
    per_passage: [
      { passage_id: "rp_1", title: "One", correct: 10, total: 13 },
      { passage_id: "rp_2", title: "Two", correct: 10, total: 13 },
      { passage_id: "rp_3", title: "Three", correct: 10, total: 14 },
    ],
    weakest_type: null,
    duration_s: 3600,
    auto_submitted: false,
    submitted_at: null,
    ...overrides,
  } as ReviewRecord;
}

describe("pacing", () => {
  it("front-loads the Academic budget 16/20/22 and the GT budget 15/18/25", () => {
    expect([1, 2, 3].map((position) => pacingFor("academic", position))).toEqual([16, 20, 22]);
    expect([1, 2, 3].map((position) => pacingFor("general_training", position))).toEqual([
      15, 18, 25,
    ]);
    // The two plans both fill 58 minutes, leaving two in reserve for the sweep.
    expect(16 + 20 + 22).toBe(58);
    expect(15 + 18 + 25).toBe(58);
  });

  it("sums per-question time onto its own passage and compares it to that budget", () => {
    const rows = pacingRows(
      review({
        per_question: [
          question({ number: 1, passage_id: "rp_1" }),
          question({ number: 2, passage_id: "rp_1" }),
          question({ number: 3, passage_id: "rp_3" }),
        ],
      }),
      { "1": 600_000, "2": 600_000, "3": 60_000 },
    );
    expect(rows[0].spentSeconds).toBe(1200);
    expect(rows[0].targetSeconds).toBe(16 * 60);
    expect(rows[2].spentSeconds).toBe(60);
    expect(rows[2].targetSeconds).toBe(22 * 60);
  });

  it("says so rather than inventing a split when no times were recorded", () => {
    expect(hasTiming(pacingRows(review(), {}))).toBe(false);
  });
});

describe("the money sentence", () => {
  it("counts only questions over two minutes, and what they returned", () => {
    const record = review({
      per_question: [
        question({ number: 1 }),
        question({ number: 2, correct: false }),
        question({ number: 3, correct: false, answered: false, given: "" }),
      ],
    });
    const cost = costOfSlowQuestions(record, {
      "1": SLOW_QUESTION_MS + 1000,
      "2": SLOW_QUESTION_MS * 2,
      "3": 5_000,
    });
    expect(cost.slowCount).toBe(2);
    expect(cost.slowMarks).toBe(1);
    expect(cost.blankCount).toBe(1);
    expect(cost.sentence).toMatch(/2 questions cost you 6 minutes and returned 1 mark/);
    expect(cost.sentence).toMatch(/1 question was left blank/);
  });

  it("still names blanks when nothing ran long", () => {
    const cost = costOfSlowQuestions(
      review({
        per_question: [question({ number: 1, answered: false, correct: false, given: "" })],
      }),
      {},
    );
    expect(cost.slowCount).toBe(0);
    expect(cost.sentence).toMatch(/left blank/);
  });
});

describe("the verdict — one diagnosis, never a list", () => {
  it("calls three blanks a pacing problem before a reading problem", () => {
    const record = review({
      per_question: [1, 2, 3, 4].map((number) =>
        question({ number, correct: false, answered: number > 1 ? false : true, given: "" }),
      ),
    });
    expect(verdictOf(record, {}).kind).toBe("time");
  });

  it("calls losses in the scattered matching types a location problem", () => {
    const record = review({
      per_question: [
        question({ number: 1, correct: false, qtype: "matching_headings" }),
        question({ number: 2, correct: false, qtype: "matching_information" }),
        question({ number: 3, correct: true }),
      ],
    });
    expect(verdictOf(record, {}).kind).toBe("location");
  });

  it("calls losses in the judgement types a technique problem", () => {
    const record = review({
      per_question: [
        question({ number: 1, correct: false, qtype: "true_false_not_given" }),
        question({ number: 2, correct: false, qtype: "yes_no_not_given" }),
      ],
    });
    expect(verdictOf(record, {}).kind).toBe("technique");
  });

  it("has nothing to diagnose on a clean paper", () => {
    expect(verdictOf(review({ per_question: [question({ number: 1 })] }), {}).kind).toBe("clean");
  });
});

describe("next actions", () => {
  it("leads with the wrong answers and links the weakest passage into the coach", () => {
    const record = review({
      weakest_type: { qtype: "matching_headings", correct: 1, total: 6 },
      per_passage: [
        { passage_id: "rp_1", title: "One", correct: 12, total: 13 },
        { passage_id: "rp_2", title: "Two", correct: 3, total: 13 },
        { passage_id: "rp_3", title: "Three", correct: 10, total: 14 },
      ],
    });
    const actions = buildNextActions(record, {}, "rd_1");
    expect(actions[0].to).toBe("/reading/review/rd_1");
    expect(actions.some((action) => action.to === "/reading/coach/rp_2")).toBe(true);
    expect(actions.some((action) => action.to.includes("tab=drills&qtype=matching_headings"))).toBe(
      true,
    );
    expect(actions.length).toBeLessThanOrEqual(4);
  });

  it("offers nothing but study when every answer was right", () => {
    const actions = buildNextActions(
      review({ per_question: [question({ number: 1 })], weakest_type: null }),
      {},
      "rd_1",
    );
    expect(actions.every((action) => action.id !== "review")).toBe(true);
  });
});
