/**
 * The mapping is where this breaks, so it is the thing under test.
 *
 * The bug that made this screen necessary: four stored quick chats, none of them
 * scored, none of them openable, all four rendering the same name. Every case below is
 * one half of that.
 */

import { describe, expect, it } from "vitest";
import { matchesQuery, sortRows } from "@/components/practice/history";
import type { SessionRecord } from "../../store";
import type { DrillAttempt, MockSitting } from "../api";
import {
  activityOf,
  drillRow,
  statusFor,
  titleFor,
  toHistoryRow,
  toHistoryRows,
} from "../rows";

function session(over: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "ss_1",
    mode: "micro",
    activity: "quick_chat",
    part: null,
    card_set_id: null,
    state: "CHAT",
    status: "complete",
    overall_band: null,
    started_at: "2026-07-26T15:38:14.886Z",
    ended_at: "2026-07-26T15:46:25.541Z",
    duration_s: 490,
    ...over,
  };
}

function sitting(over: Partial<MockSitting> = {}): MockSitting {
  return {
    session_id: "ss_mock",
    status: "scored",
    started_at: "2026-07-20T09:00:00Z",
    ended_at: "2026-07-20T09:13:00Z",
    duration_s: 780,
    overall_band: 6.5,
    card_set_id: "cs_travel",
    card_set_title: "Travel and places",
    part2_topic: "Describe a place you like to visit",
    difficulty: "core",
    stages_done: 6,
    stages_total: 6,
    ...over,
  };
}

function drill(over: Partial<DrillAttempt> = {}): DrillAttempt {
  return {
    id: "dr_1",
    kind: "minimal_pair",
    at: "2026-07-22T10:00:00Z",
    duration_s: 95,
    card_id: "sc_p2_travel",
    card_set_id: "cs_travel",
    item_id: "it_1",
    passed: true,
    score: 80,
    headline: "You kept ship and sheep apart every time.",
    ...over,
  };
}

describe("activityOf", () => {
  it("prefers the activity and strips the part suffix", () => {
    expect(activityOf(session({ activity: "single_part:2", mode: "practice" }))).toBe(
      "single_part",
    );
  });

  it("falls back to the estimator weight class for rows written before activity existed", () => {
    expect(activityOf(session({ activity: null, mode: "mock" }))).toBe("full_mock");
    expect(activityOf(session({ activity: null, mode: "micro" }))).toBe("quick_chat");
  });
});

describe("titleFor", () => {
  it("names a mock after the cue card, not after the mode", () => {
    const row = titleFor(session({ activity: "full_mock", mode: "mock" }), sitting());
    expect(row).toBe("Describe a place you like to visit");
  });

  it("falls back to the topic set when the sitting has no Part 2 topic", () => {
    expect(
      titleFor(session({ activity: "full_mock" }), sitting({ part2_topic: null })),
    ).toBe("Travel and places");
  });

  it("keeps the part in a single-part title, because that is the thing practised", () => {
    expect(
      titleFor(
        session({ activity: "single_part:3", part: 3, card_set_title: "Work and study" }),
        undefined,
      ),
    ).toBe("Work and study · Part 3");
  });

  it("tells one chat from another by what was said in it", () => {
    const a = titleFor(
      session({ opening_line: "My name is Sam Perera." }),
      undefined,
    );
    const b = titleFor(
      session({ id: "ss_2", opening_line: "I live in a small apartment near the coast." }),
      undefined,
    );
    expect(a).not.toBe(b);
    expect(a).toContain("Sam Perera");
  });

  it("never falls through to an id", () => {
    const row = titleFor(session({ opening_line: null }), undefined);
    expect(row).toBe("Quick chat");
    expect(row).not.toContain("ss_");
  });
});

describe("statusFor", () => {
  it("does not call an unscoreable mode 'not scored'", () => {
    // A quick chat is never marked. Reporting that as a missing score describes a rule
    // of the product as a failure of the learner's.
    expect(statusFor(session({ has_transcript: true }), undefined)).toEqual({
      label: "Conversation saved",
      tone: "default",
    });
  });

  it("does call a scoreable mode that produced no band 'not scored'", () => {
    expect(
      statusFor(
        session({ activity: "single_part:2", mode: "practice", has_transcript: true }),
        undefined,
      ).label,
    ).toBe("Not scored");
  });

  it("reports the terminal states in the learner's words", () => {
    expect(statusFor(session({ status: "aborted" }), undefined).label).toBe("Ended early");
    expect(statusFor(session({ status: "active" }), undefined).label).toBe("Not finished");
    expect(statusFor(session({ state: "ERROR" }), undefined).label).toBe(
      "Ended with an error",
    );
    expect(statusFor(session({ live: true }), undefined).label).toBe("Live now");
    expect(
      statusFor(session({ overall_band: 7, activity: "full_mock" }), undefined),
    ).toEqual({ label: "Scored", tone: "success" });
  });
});

describe("toHistoryRow", () => {
  it("opens a scored practice session at its report", () => {
    const row = toHistoryRow(
      session({ activity: "single_part:2", overall_band: 6, report_id: "sr_9" }),
      undefined,
    );
    expect(row.kind).toBe("practice");
    expect(row.href).toBe("/speaking/report/sr_9");
    expect(row.band).toBe(6);
  });

  it("sends a scored mock to the mock report, not the practice one", () => {
    const row = toHistoryRow(
      session({ id: "ss_mock", activity: "full_mock", mode: "mock", overall_band: 6.5, report_id: "sr_1" }),
      sitting(),
    );
    expect(row.kind).toBe("mock");
    expect(row.href).toBe("/speaking/mock/report/sr_1");
  });

  it("opens an unscored chat at its transcript — the whole point of the screen", () => {
    const row = toHistoryRow(session({ has_transcript: true, turn_count: 22 }), undefined);
    expect(row.href).toBe("/speaking/session/ss_1/transcript");
    expect(row.band).toBeNull();
    expect(row.unopenableReason).toBeUndefined();
  });

  it("treats a drill as a drill and still gives it its transcript", () => {
    const row = toHistoryRow(
      session({ activity: "topic_drill", part: 2, turn_count: 4, card_set_title: "Hobbies" }),
      undefined,
    );
    expect(row.kind).toBe("drill");
    expect(row.title).toBe("Topic drill · Hobbies");
    expect(row.href).toBe("/speaking/session/ss_1/transcript");
  });

  it("rejoins a live session rather than showing it a transcript that is still growing", () => {
    const row = toHistoryRow(session({ live: true, status: "active" }), undefined);
    expect(row.href).toBe("/speaking/session/ss_1");
  });

  it("refuses to link a session with nothing in it, and says why", () => {
    const row = toHistoryRow(session({ has_transcript: false, turn_count: 0 }), undefined);
    expect(row.href).toBeNull();
    expect(row.unopenableReason).toBe("nothing was said in it");
  });

  it("never reports an unscored session as band 0", () => {
    expect(toHistoryRow(session(), undefined).band).toBeNull();
  });
});

describe("drillRow", () => {
  it("names the drill after the card it drilled", () => {
    const row = drillRow(drill(), { sc_p2_travel: "A place you like to visit" });
    expect(row.title).toBe("A place you like to visit · Minimal pairs");
    expect(row.kind).toBe("coach");
  });

  it("still names itself when the cue-card titles could not be read", () => {
    expect(drillRow(drill(), {}).title).toBe("Minimal pairs");
  });

  it("never turns a drill's 0-100 score into a band or a raw score", () => {
    const row = drillRow(drill({ score: 80 }), {});
    expect(row.band).toBeNull();
    expect(row.correct).toBeUndefined();
    expect(row.outOf).toBeUndefined();
    // …but it is still findable by it.
    expect(matchesQuery(row, "score 80")).toBe(true);
  });

  it("says it cannot be reopened rather than linking to a screen that does not exist", () => {
    const row = drillRow(drill(), {});
    expect(row.href).toBeNull();
    expect(row.unopenableReason).toBe("coaching drills aren't kept as a report");
  });

  it("reports pass, fail and ungraded as three different things", () => {
    expect(drillRow(drill({ passed: true }), {}).statusLabel).toBe("Passed");
    expect(drillRow(drill({ passed: false }), {}).statusLabel).toBe("Not passed");
    expect(drillRow(drill({ passed: null }), {}).statusLabel).toBe("Attempted");
  });
});

describe("toHistoryRows", () => {
  it("merges a mock sitting onto its session row instead of listing it twice", () => {
    const rows = toHistoryRows(
      [session({ id: "ss_mock", activity: "full_mock", mode: "mock", overall_band: 6.5 })],
      [sitting()],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Describe a place you like to visit");
    expect(rows[0].band).toBe(6.5);
  });

  it("keeps a sitting whose session envelope has gone missing", () => {
    const rows = toHistoryRows([], [sitting()]);
    expect(rows.map((r) => r.id)).toEqual(["ss_mock"]);
    expect(rows[0].kind).toBe("mock");
  });

  it("ignores a duplicate session id rather than rendering the same attempt twice", () => {
    expect(toHistoryRows([session(), session()], [])).toHaveLength(1);
  });

  it("survives an older sidecar that answers none of the new fields", () => {
    const bare = toHistoryRows([session({ has_transcript: undefined, turn_count: undefined })]);
    expect(bare[0].href).toBeNull();
    expect(bare[0].statusLabel).toBe("Nothing recorded");
  });

  it("puts all four kinds in one list, which is what the filter chips are for", () => {
    const rows = toHistoryRows(
      [
        session({ id: "ss_m", activity: "full_mock", mode: "mock" }),
        session({ id: "ss_p", activity: "single_part:2", mode: "practice" }),
        session({ id: "ss_d", activity: "topic_drill" }),
      ],
      [],
      [drill()],
    );
    expect(rows.map((r) => r.kind).sort()).toEqual(["coach", "drill", "mock", "practice"]);
  });
});

describe("the rows the shared screen is given", () => {
  const rows = toHistoryRows(
    [
      session({ id: "ss_a", opening_line: "My name is Sam Perera." }),
      session({
        id: "ss_b",
        activity: "full_mock",
        mode: "mock",
        overall_band: 6.5,
        report_id: "sr_1",
        started_at: "2026-07-20T09:00:00Z",
      }),
      session({
        id: "ss_c",
        activity: "single_part:2",
        mode: "practice",
        overall_band: 5.5,
        report_id: "sr_2",
        started_at: "2026-07-24T09:00:00Z",
      }),
    ],
    [sitting({ session_id: "ss_b" })],
  );

  it("sorts by band with the unscored chat at the bottom, not treated as a zero", () => {
    expect(sortRows(rows, "band-low").map((r) => r.id)).toEqual(["ss_c", "ss_b", "ss_a"]);
    expect(sortRows(rows, "band-high").map((r) => r.id)).toEqual(["ss_b", "ss_c", "ss_a"]);
  });

  it("is searchable by topic, by what was said, and by band", () => {
    const find = (q: string) => rows.filter((r) => matchesQuery(r, q)).map((r) => r.id);
    expect(find("perera")).toEqual(["ss_a"]);
    expect(find("place you like to visit")).toEqual(["ss_b"]);
    expect(find("band 6.5")).toEqual(["ss_b"]);
    expect(find("full test")).toEqual(["ss_b"]);
  });

  it("offers exactly the kinds that are present", () => {
    expect(new Set(rows.map((r) => r.kind))).toEqual(new Set(["practice", "mock"]));
  });
});
