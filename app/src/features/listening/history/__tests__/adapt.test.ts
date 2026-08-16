/**
 * The mapping is where a history screen breaks, so it is pinned here rather than assumed.
 *
 * What these tests defend is the promise the row makes to the learner: that its title is
 * something they recognise, that a row which links somewhere opens something real, that a
 * row which does not says why, and that a mock sitting recorded in two ledgers appears
 * once.
 */

import { describe, expect, it } from "vitest";
import { matchesQuery, sortRows } from "@/components/practice/history";
import {
  attemptRow,
  drillRow,
  listeningHistoryRows,
  mockRow,
  type AttemptListRow,
  type DrillListRow,
  type LibraryLookup,
  type MockListRow,
} from "../adapt";

const library: LibraryLookup = {
  tests: [{ id: "lt_test_1", title: "Practice Test 1" }],
  scripts: [
    { id: "ls_t1_p1", part: 1, title: "Booking a village hall" },
    { id: "ls_t1_p3", part: 3, title: "Tutorial on urban beekeeping" },
  ],
};

function attempt(over: Partial<AttemptListRow> = {}): AttemptListRow {
  return {
    attempt_id: "la_01AAA",
    test_id: "lt_test_1",
    script_id: null,
    mode: "exam",
    status: "submitted",
    raw_score: 31,
    total_questions: 40,
    band: 7,
    duration_s: 1800,
    started_at: "2026-07-26T17:21:04.146Z",
    submitted_at: "2026-07-26T17:51:04.146Z",
    ...over,
  };
}

function mock(over: Partial<MockListRow> = {}): MockListRow {
  return {
    mock_id: "lm_01BBB",
    attempt_id: "lm_01BBB",
    status: "complete",
    title: "Mock paper — four parts",
    test_id: "lt_test_1",
    created_at: "2026-08-01T09:00:00.000Z",
    started_at: "2026-08-01T09:02:00.000Z",
    finished_at: "2026-08-01T09:36:00.000Z",
    raw_score: 24,
    total_questions: 40,
    band: 6,
    ...over,
  };
}

function drill(over: Partial<DrillListRow> = {}): DrillListRow {
  return {
    session_id: "dr_01CCC",
    kind: "dictation",
    drill_kind: "dictation",
    script_id: "ls_t1_p1",
    part: 1,
    accent_set: "uk",
    mode: null,
    n_items: 8,
    n_correct: 5,
    started_at: "2026-08-02T11:00:00.000Z",
    ended_at: "2026-08-02T11:06:00.000Z",
    duration_s: 360,
    ...over,
  };
}

// ------------------------------------------------------------------- attempts ---

describe("attempts become history rows", () => {
  it("names a full test after the test, scores it out of forty and links to its review", () => {
    const row = attemptRow(attempt(), library);
    expect(row.title).toBe("Practice Test 1");
    expect(row.kind).toBe("mock");
    expect(row.correct).toBe(31);
    expect(row.outOf).toBe(40);
    expect(row.statusLabel).toBe("Scored");
    expect(row.href).toBe("/listening/review/la_01AAA");
    expect(row.unopenableReason).toBeUndefined();
  });

  it("never converts an objective paper into a band, even when the server sends one", () => {
    // 18 to 22 raw is one five-mark-wide band. "31 of 40" is the number that moves.
    expect(attemptRow(attempt({ band: 7 }), library).band).toBeFalsy();
  });

  it("names a single part by its part number and title, and files it under practice", () => {
    const row = attemptRow(
      attempt({ test_id: null, script_id: "ls_t1_p3", mode: "practice", raw_score: 7, total_questions: 10 }),
      library,
    );
    expect(row.title).toBe("Part 3: Tutorial on urban beekeeping");
    expect(row.kind).toBe("practice");
    expect(row.correct).toBe(7);
    expect(row.outOf).toBe(10);
  });

  it("files accent training and dictation under drills, not under practice", () => {
    expect(attemptRow(attempt({ test_id: null, script_id: "ls_t1_p1", mode: "accent_drill" }), library).kind).toBe(
      "drill",
    );
    expect(attemptRow(attempt({ test_id: null, script_id: "ls_t1_p1", mode: "dictation" }), library).kind).toBe(
      "drill",
    );
  });

  it("dates an attempt that was walked out of, which has no submission stamp at all", () => {
    const row = attemptRow(
      attempt({ status: "abandoned", raw_score: null, total_questions: null, band: null, submitted_at: null }),
      library,
    );
    expect(row.startedAt).toBe("2026-07-26T17:21:04.146Z");
    expect(row.statusLabel).toBe("Ended early");
    expect(row.correct).toBeFalsy();
    expect(row.outOf).toBeFalsy();
    // The review endpoint 409s on anything unsubmitted: in listening the transcript IS
    // the key, so a link here would dead-end on purpose-built server refusal.
    expect(row.href).toBeNull();
    expect(row.unopenableReason).toBe("left before it was marked");
  });

  it("says an unfinished attempt was never marked rather than linking at it", () => {
    const row = attemptRow(attempt({ status: "in_progress", raw_score: null, submitted_at: null }), library);
    expect(row.statusLabel).toBe("Not finished");
    expect(row.href).toBeNull();
    expect(row.unopenableReason).toBe("never handed in, so nothing was marked");
  });

  it("still says what an attempt was when its content pack has been uninstalled", () => {
    const gone = attemptRow(attempt({ test_id: "lt_vanished" }), { tests: [], scripts: [] });
    expect(gone.title).toBe("Listening test (not in your library)");
    expect(gone.title).not.toContain("lt_vanished");

    const part = attemptRow(attempt({ test_id: null, script_id: "ls_vanished" }), { tests: [], scripts: [] });
    expect(part.title).toBe("Listening part (not in your library)");
    expect(part.title).not.toContain("ls_vanished");
  });
});

// ---------------------------------------------------------------------- mocks ---

describe("mock sittings become history rows", () => {
  it("opens a marked paper at its report and times it from the clock stamps", () => {
    const row = mockRow(mock());
    expect(row.kind).toBe("mock");
    expect(row.title).toBe("Mock paper — four parts");
    expect(row.correct).toBe(24);
    expect(row.outOf).toBe(40);
    expect(row.durationS).toBe(34 * 60);
    expect(row.href).toBe("/listening/mock/report/lm_01BBB");
  });

  it("sends a sitting that is still open back to the sitting, whatever it is waiting on", () => {
    for (const status of ["preparing", "ready", "in_progress"]) {
      const row = mockRow(mock({ status, raw_score: null, total_questions: null, finished_at: null }));
      expect(row.href).toBe("/listening/mock/sitting/lm_01BBB");
      expect(row.correct).toBeFalsy();
    }
  });

  it("refuses to invent a report for a paper that was walked out of", () => {
    const row = mockRow(mock({ status: "abandoned", raw_score: null, total_questions: null }));
    expect(row.href).toBeNull();
    expect(row.statusLabel).toBe("Ended early");
    expect(row.unopenableReason).toBe("walked out, so it was never marked");
  });

  it("falls back to the creation stamp when a sitting never started", () => {
    const row = mockRow(mock({ status: "ready", started_at: null, finished_at: null, raw_score: null }));
    expect(row.startedAt).toBe("2026-08-01T09:00:00.000Z");
    expect(row.durationS).toBeNull();
  });
});

// --------------------------------------------------------------------- drills ---

describe("drill sets become history rows", () => {
  it("names the drill and the part it was cut from", () => {
    const row = drillRow(drill(), library);
    expect(row.kind).toBe("drill");
    expect(row.title).toBe("Dictation · Part 1: Booking a village hall");
    expect(row.correct).toBe(5);
    expect(row.outOf).toBe(8);
    expect(row.statusLabel).toBe("Scored");
  });

  it("translates the stored taxonomy value back into the launcher's own word", () => {
    const row = drillRow(drill({ kind: "numbers_spelling", drill_kind: "numbers_spelling" }), library);
    expect(row.title).toContain("Numbers & spelling");
  });

  it("admits that a drill report is not kept, instead of linking nowhere", () => {
    const row = drillRow(drill(), library);
    expect(row.href).toBeNull();
    expect(row.unopenableReason).toBe("drill reports are not kept after the set ends");
  });

  it("drops the part when the set was cut across the whole pack", () => {
    expect(drillRow(drill({ script_id: null, part: null }), library).title).toBe("Dictation");
  });
});

// ----------------------------------------------------------------- everything ---

describe("the three ledgers as one list", () => {
  it("lists a mock sitting once, though it is recorded in two tables under one id", () => {
    // Opening a mock writes a listening_attempts row whose id IS the mock id.
    const rows = listeningHistoryRows({
      attempts: [attempt({ attempt_id: "lm_01BBB" }), attempt({ attempt_id: "la_01AAA" })],
      mocks: [mock()],
      drills: [],
      library,
    });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.id === "lm_01BBB")).toHaveLength(1);
    // And the mock ledger is the one that wins, because it knows about the report.
    expect(rows.find((r) => r.id === "lm_01BBB")?.href).toBe("/listening/mock/report/lm_01BBB");
  });

  it("gives every row a unique id, so nothing collapses in the list", () => {
    const rows = listeningHistoryRows({
      attempts: [attempt(), attempt({ attempt_id: "la_02" })],
      mocks: [mock(), mock({ mock_id: "lm_02", attempt_id: "lm_02" })],
      drills: [drill(), drill({ session_id: "dr_02" })],
      library,
    });
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it("ranks a raw score the way the shared sort expects, with unscored rows last", () => {
    const rows = listeningHistoryRows({
      attempts: [
        attempt({ attempt_id: "high", raw_score: 36, total_questions: 40 }),
        attempt({ attempt_id: "low", raw_score: 12, total_questions: 40 }),
        attempt({ attempt_id: "never", status: "abandoned", raw_score: null, submitted_at: null }),
      ],
      mocks: [],
      drills: [],
      library,
    });
    expect(sortRows(rows, "band-high").map((r) => r.id)).toEqual(["high", "low", "never"]);
    expect(sortRows(rows, "band-low").map((r) => r.id)).toEqual(["low", "high", "never"]);
  });

  it("finds a row by how it was taken, not only by what it was called", () => {
    const rows = listeningHistoryRows({
      attempts: [attempt({ test_id: null, script_id: "ls_t1_p1", mode: "practice" })],
      mocks: [],
      drills: [],
      library,
    });
    expect(matchesQuery(rows[0], "village hall")).toBe(true);
    expect(matchesQuery(rows[0], "practice")).toBe(true);
    expect(matchesQuery(rows[0], "beekeeping")).toBe(false);
  });
});
