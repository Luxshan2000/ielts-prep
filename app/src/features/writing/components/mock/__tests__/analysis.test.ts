/**
 * The two pieces of arithmetic the mock report rests on.
 *
 * Both are asserted rather than eyeballed because both are claims about the exam
 * that the learner will act on: that Task 2 is worth twice Task 1, and that
 * over-running Task 1 is the most expensive habit in the paper. If the weighting
 * were wrong, the report would confidently teach the opposite of the truth.
 */

import { describe, expect, it } from "vitest";
import { buildNextActions, timeVerdict, weakestCriterion } from "../analysis";
import { estimatedPaperBand, roundHalfBand, type MockRecord } from "../store";
import type { WritingAttempt } from "../../../store";

function record(task1Minutes: number, task2Minutes: number, overtime = 0): MockRecord {
  return {
    id: "m1",
    module: "academic",
    startedAt: Date.now() - 3_600_000,
    endedAt: Date.now(),
    status: "submitted",
    task1: { attemptId: "a1", promptId: "wp_1" },
    task2: { attemptId: "a2", promptId: "wp_2" },
    perTaskSeconds: { task1: task1Minutes * 60, task2: task2Minutes * 60 },
    overtimeSeconds: overtime,
  };
}

function attempt(band: number, words: number): WritingAttempt {
  return {
    id: "a1",
    prompt_id: "wp_1",
    parent_attempt_id: null,
    mode: "exam",
    status: "scored",
    word_count: words,
    seconds_elapsed: 1200,
    overtime_seconds: 0,
    paste_events: 0,
    integrity_flag: null,
    submitted_at: null,
    overall_band: band,
    started_at: null,
    essay_text: "…",
    outline_text: "",
    prompt: null,
    min_words: 150,
    time_limit_s: 1200,
    evaluation: {
      id: "e1",
      created_at: null,
      llm_evaluation_id: null,
      prompt_version: null,
      overall_band: band,
      bands: { ta: band, cc: band, lr: band - 1, gra: band },
      criteria: {},
      annotations: [],
      unanchored: [],
      structure_analysis: { paragraphs: [], missing_elements: [], summary: "" },
      model_answer_outline: [],
      prechecks: [],
      vocab_suggestions: [],
    },
    evaluations: [],
    children: [],
    parent: null,
  };
}

describe("the weighted paper estimate", () => {
  it("weights Task 2 twice, which is the whole lesson about where the hour goes", () => {
    // The pair the report cites: the same two bands, swapped, half a band apart.
    expect(estimatedPaperBand(6, 7.5)).toBe(7);
    expect(estimatedPaperBand(7.5, 6)).toBe(6.5);
  });

  it("rounds to the nearest half band", () => {
    expect(roundHalfBand(6.24)).toBe(6);
    expect(roundHalfBand(6.25)).toBe(6.5);
    expect(estimatedPaperBand(7, 7)).toBe(7);
  });

  it("refuses to invent a paper band when one answer was not marked", () => {
    expect(estimatedPaperBand(null, 7)).toBeNull();
    expect(estimatedPaperBand(6, null)).toBeNull();
  });
});

describe("the time verdict", () => {
  it("names an over-run on Task 1 rather than burying it under the bands", () => {
    const verdict = timeVerdict(record(32, 28));
    expect(verdict.tone).toBe("warn");
    expect(verdict.headline).toMatch(/32 min/);
    expect(verdict.detail).toMatch(/twice as much/);
  });

  it("names a starved Task 2", () => {
    expect(timeVerdict(record(18, 26)).tone).toBe("warn");
  });

  it("names overtime even when the split itself was right", () => {
    const verdict = timeVerdict(record(20, 40, 4 * 60));
    expect(verdict.tone).toBe("warn");
    expect(verdict.headline).toMatch(/past the hour/);
  });

  it("says so plainly when the hour was spent the way the paper expects", () => {
    const verdict = timeVerdict(record(20, 40));
    expect(verdict.tone).toBe("good");
    expect(verdict.headline).toMatch(/20 min on Task 1, 40 min on Task 2/);
  });
});

describe("what to do next", () => {
  it("finds the floor across both answers, not the average", () => {
    const worst = weakestCriterion([attempt(7, 200), attempt(6, 300)]);
    expect(worst).toEqual({ key: "lr", band: 5 });
  });

  it("always ends on the coach for both prompts just sat", () => {
    const actions = buildNextActions({
      record: record(20, 40),
      task1: attempt(7, 180),
      task2: attempt(7, 280),
    });
    const links = actions.filter((a) => a.to?.startsWith("/writing/coach/"));
    expect(links).toHaveLength(2);
  });

  it("calls out an under-length answer as arithmetic, not style", () => {
    const actions = buildNextActions({
      record: record(20, 40),
      task1: attempt(6, 110),
      task2: attempt(6, 280),
    });
    expect(actions.some((a) => a.id === "length")).toBe(true);
  });
});
