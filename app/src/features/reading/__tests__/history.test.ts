/**
 * The reading → `HistoryRow` adapter.
 *
 * This is where a history screen breaks: not in the view, which is shared and tested once,
 * but in the mapping — a row titled with an id, a link into a 404, a band invented for an
 * attempt that was never scored, or the same sitting listed three times because reading
 * records it in three tables. Each of those is a test below.
 */

import { afterEach, describe, expect, it } from "vitest";
import { matchesQuery, sortRows } from "@/components/practice/history";
import { attemptRow, buildHistoryRows, drillRow, mockRow } from "../history";
import type { AttemptListItem, DrillResultItem, MockSessionItem } from "../types";

const MOCK_LEDGER_KEY = "bandready.reading.mocks.v1";

function attempt(over: Partial<AttemptListItem> = {}): AttemptListItem {
  return {
    attempt_id: "rd_1",
    test_id: null,
    passage_id: "rp_a1",
    mode: "passage",
    activity: "single_passage",
    exam_conditions: false,
    title: "Deep Sea Cables",
    format: "academic",
    qtype: null,
    status: "submitted",
    started_at: "2026-07-26T15:47:01.543Z",
    finished_at: "2026-07-26T15:47:17.177Z",
    raw_score: 9,
    total_questions: 13,
    band: 6.5,
    duration_s: 640,
    answered: 13,
    ...over,
  };
}

function drill(over: Partial<DrillResultItem> = {}): DrillResultItem {
  return {
    drill_id: "dr_1",
    drill_kind: "trap",
    qtype: null,
    trap: "extreme_wording",
    n_items: 10,
    n_correct: 6,
    started_at: "2026-07-20T09:00:00.000Z",
    finished_at: "2026-07-20T09:08:00.000Z",
    duration_s: 480,
    attempt_id: null,
    ...over,
  };
}

function mock(over: Partial<MockSessionItem> = {}): MockSessionItem {
  return {
    mock_id: "rm_1",
    attempt_id: "rm_1",
    status: "submitted",
    module: "academic",
    test_id: "rt_1",
    title: "Academic Practice Test 2",
    started_at: "2026-07-01T08:00:00.000Z",
    finished_at: "2026-07-01T09:00:00.000Z",
    minutes: 58,
    raw_score: 31,
    total_questions: 40,
    band: 7.0,
    ...over,
  };
}

const NO_MOCKS: ReadonlySet<string> = new Set<string>();

afterEach(() => {
  globalThis.localStorage?.clear();
});

// ------------------------------------------------------------------- titles ---

describe("what a row is called", () => {
  it("titles a passage attempt with the passage, never with its id", () => {
    const row = attemptRow(attempt(), NO_MOCKS);
    expect(row.title).toBe("Deep Sea Cables");
    expect(row.title).not.toContain("rd_");
    expect(row.title).not.toContain("rp_");
  });

  it("titles a full test with the test", () => {
    const row = attemptRow(
      attempt({ mode: "full", activity: "full_test", test_id: "rt_1", passage_id: null, title: "Academic Practice Test 1" }),
      NO_MOCKS,
    );
    expect(row.title).toBe("Academic Practice Test 1");
    expect(row.kind).toBe("mock");
  });

  it("titles a drill by its question type, because a drill has no one passage", () => {
    const row = attemptRow(
      attempt({ mode: "drill", activity: "drill", title: null, qtype: "true_false_not_given" }),
      NO_MOCKS,
    );
    expect(row.title).toBe("True / False / Not Given drill");
    expect(row.kind).toBe("drill");
  });

  it("says so plainly when the content pack that held the passage is gone", () => {
    const row = attemptRow(attempt({ title: null }), NO_MOCKS);
    expect(row.title).toContain("no longer installed");
    expect(row.href).toBeNull();
    expect(row.unopenableReason).toBe("its content pack is no longer installed");
  });
});

// -------------------------------------------------------------------- kinds ---

describe("what produced the attempt", () => {
  it.each([
    ["full", "mock"],
    ["passage", "practice"],
    ["drill", "drill"],
  ] as const)("maps mode %s to kind %s", (mode, kind) => {
    expect(attemptRow(attempt({ mode, qtype: "matching_headings" }), NO_MOCKS).kind).toBe(kind);
  });

  it("treats a server-assembled mock sitting as a full test", () => {
    const row = attemptRow(
      attempt({ mode: "full", activity: "reading_mock", exam_conditions: true }),
      NO_MOCKS,
    );
    expect(row.kind).toBe("mock");
    expect(row.href).toBe("/reading/mock/report/rd_1");
  });
});

// -------------------------------------------------------------------- score ---

describe("what the score says", () => {
  it("reports the raw score rather than a converted band, as an objective paper should", () => {
    const row = attemptRow(attempt(), NO_MOCKS);
    expect(row.correct).toBe(9);
    expect(row.outOf).toBe(13);
    expect(row.band).toBeNull();
  });

  it("keeps the band findable by search even though it is not the headline", () => {
    const row = attemptRow(attempt(), NO_MOCKS);
    expect(matchesQuery(row, "band 6.5")).toBe(true);
  });

  it("gives an unfinished attempt no score at all, not a zero", () => {
    const row = attemptRow(
      attempt({ status: "in_progress", raw_score: null, band: null, answered: 4 }),
      NO_MOCKS,
    );
    expect(row.correct).toBeNull();
    expect(row.outOf).toBeNull();
    expect(row.band).toBeNull();
    expect(row.statusLabel).toBe("Not finished");
  });

  it("folds how far an unfinished attempt got into the search text", () => {
    const row = attemptRow(
      attempt({ status: "in_progress", raw_score: null, answered: 4 }),
      NO_MOCKS,
    );
    expect(matchesQuery(row, "4 of 13 answered")).toBe(true);
  });

  it("drops a zero duration rather than printing 0:00", () => {
    expect(attemptRow(attempt({ duration_s: 0 }), NO_MOCKS).durationS).toBeNull();
  });
});

// ------------------------------------------------------------ where it goes ---

describe("where a row opens", () => {
  it("sends a scored attempt to its review", () => {
    expect(attemptRow(attempt(), NO_MOCKS).href).toBe("/reading/review/rd_1");
  });

  it("sends an unfinished attempt back into the player to resume", () => {
    expect(attemptRow(attempt({ status: "in_progress" }), NO_MOCKS).href).toBe(
      "/reading/attempt/rd_1",
    );
  });

  it("sends a mock sitting to the pacing report, not to the plain review", () => {
    const ledger = new Set(["rd_1"]);
    expect(attemptRow(attempt({ mode: "full" }), ledger).href).toBe("/reading/mock/report/rd_1");
    expect(attemptRow(attempt({ mode: "full", status: "in_progress" }), ledger).href).toBe(
      "/reading/mock/sitting/rd_1",
    );
  });

  it("opens nothing for an abandoned attempt, and says why", () => {
    const row = attemptRow(attempt({ status: "abandoned" }), NO_MOCKS);
    expect(row.href).toBeNull();
    expect(row.unopenableReason).toBe("it was never marked");
    expect(row.statusLabel).toBe("Ended early");
  });

  it("never leaves a dead row without a reason", () => {
    for (const status of ["submitted", "in_progress", "abandoned", "who_knows"]) {
      const row = attemptRow(attempt({ status }), NO_MOCKS);
      expect(row.href === null ? Boolean(row.unopenableReason) : true).toBe(true);
    }
  });
});

// ------------------------------------------------------------------- drills ---

describe("standalone drills", () => {
  it("names a trap drill by its kind and keeps its raw count", () => {
    const row = drillRow(drill());
    expect(row.title).toBe("Trap drill");
    expect(row.kind).toBe("drill");
    expect(row.correct).toBe(6);
    expect(row.outOf).toBe(10);
    expect(row.band).toBeNull();
  });

  it("prefers the question type when the drill had one", () => {
    expect(drillRow(drill({ qtype: "matching_headings" })).title).toBe("Matching headings drill");
  });

  it("does not pretend a drill report can be reopened", () => {
    const row = drillRow(drill());
    expect(row.href).toBeNull();
    expect(row.unopenableReason).toBe("drill reports are not kept after the run");
  });

  it("finds a drill by the trap it was about", () => {
    expect(matchesQuery(drillRow(drill()), "extreme wording")).toBe(true);
  });
});

// -------------------------------------------------------------- mock papers ---

describe("server-side mock sittings", () => {
  it("opens the report of a submitted sitting", () => {
    const row = mockRow(mock());
    expect(row.kind).toBe("mock");
    expect(row.href).toBe("/reading/mock/report/rm_1");
    expect(row.correct).toBe(31);
    expect(row.outOf).toBe(40);
    expect(row.durationS).toBe(58 * 60);
  });

  it("has nowhere to send a walked-out sitting", () => {
    const row = mockRow(mock({ status: "abandoned", raw_score: null, total_questions: null }));
    expect(row.href).toBeNull();
    expect(row.statusLabel).toBe("Walked out");
    expect(row.correct).toBeNull();
  });
});

// ------------------------------------------------------------------ merging ---

describe("one sitting, one row", () => {
  it("drops the drill_results shadow of a drill that was sat as an attempt", () => {
    const rows = buildHistoryRows({
      attempts: [attempt({ attempt_id: "rd_9", mode: "drill", title: null, qtype: "true_false_not_given" })],
      drills: [drill({ drill_id: "dr_9", attempt_id: "rd_9" })],
      mocks: [],
    });
    expect(rows.map((row) => row.id)).toEqual(["rd_9"]);
  });

  it("keeps a standalone drill, which has no attempt behind it", () => {
    const rows = buildHistoryRows({
      attempts: [attempt({ attempt_id: "rd_9" })],
      drills: [drill({ drill_id: "dr_9", attempt_id: null })],
      mocks: [],
    });
    expect(rows.map((row) => row.id).sort()).toEqual(["dr_9", "rd_9"]);
  });

  it("drops a mock session that is already listed as an attempt", () => {
    const rows = buildHistoryRows({
      attempts: [attempt({ attempt_id: "rm_1", mode: "full", activity: "reading_mock" })],
      drills: [],
      mocks: [mock()],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("rm_1");
  });

  it("keeps a mock sitting whose attempt row is not in the page", () => {
    const rows = buildHistoryRows({ attempts: [], drills: [], mocks: [mock()] });
    expect(rows.map((row) => row.id)).toEqual(["rm_1"]);
  });

  it("reads the local sitting ledger, so a library-started mock still opens its report", () => {
    globalThis.localStorage.setItem(
      MOCK_LEDGER_KEY,
      JSON.stringify([
        {
          attemptId: "rd_1",
          testId: "rt_1",
          testTitle: "Academic Practice Test 1",
          format: "academic",
          startedAt: 1_780_000_000_000,
          endedAt: null,
          status: "submitted",
          totalQuestions: 40,
        },
      ]),
    );
    const rows = buildHistoryRows({
      attempts: [attempt({ mode: "full", activity: "full_test" })],
      drills: [],
      mocks: [],
    });
    expect(rows[0].href).toBe("/reading/mock/report/rd_1");
  });
});

// ------------------------------------------- playing nicely with the screen ---

describe("the rows behave in the shared view", () => {
  it("sorts newest first across all three record types", () => {
    const rows = buildHistoryRows({
      attempts: [attempt()],
      drills: [drill()],
      mocks: [mock()],
    });
    expect(sortRows(rows, "newest").map((row) => row.id)).toEqual(["rd_1", "dr_1", "rm_1"]);
  });

  it("ranks by raw score when no row carries a band", () => {
    const rows = buildHistoryRows({
      attempts: [attempt()],
      drills: [drill()],
      mocks: [mock()],
    });
    // 31/40 beats 9/13 beats 6/10 — the ranking a reading learner expects, produced from
    // the raw counts alone because nothing here claims a band.
    expect(sortRows(rows, "band-high").map((row) => row.id)).toEqual(["rm_1", "rd_1", "dr_1"]);
  });

  it("finds an academic paper by format", () => {
    const rows = buildHistoryRows({ attempts: [attempt()], drills: [], mocks: [] });
    expect(matchesQuery(rows[0], "academic")).toBe(true);
    expect(matchesQuery(rows[0], "general training")).toBe(false);
  });
});
