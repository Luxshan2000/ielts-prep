/**
 * The adapter is where this will break: every row on the history screen is one of these
 * mappings, and the failures that matter are quiet ones — an invented band, a link to a
 * screen that cannot open the record, four rows reading the same sentence.
 */

import { describe, expect, it } from "vitest";
import { matchesQuery, sortRows } from "@/components/practice/history";
import type { AttemptSummary } from "../../store";
import type { MockRecord } from "../../components/mock/store";
import { buildWritingHistory, snippet, type WritingMockSession } from "../rows";

const PROMPT_TEXT =
  "Some people believe that university education should be free for everyone, while others " +
  "argue that students should pay their own tuition fees. Discuss both views and give your " +
  "own opinion about widening participation.";

function attempt(over: Partial<AttemptSummary> & { id: string }): AttemptSummary {
  return {
    prompt_id: "wp_1",
    parent_attempt_id: null,
    mode: "practice",
    status: "draft",
    word_count: 0,
    seconds_elapsed: 0,
    overtime_seconds: 0,
    paste_events: 0,
    integrity_flag: null,
    submitted_at: null,
    overall_band: null,
    started_at: "2026-07-26T15:00:00.000Z",
    prompt: {
      id: "wp_1",
      task_type: "task2",
      genre: "discussion",
      prompt_text: PROMPT_TEXT,
    },
    ...over,
  };
}

function mockRecord(over: Partial<MockRecord> = {}): MockRecord {
  return {
    id: "mk_1",
    module: "academic",
    startedAt: Date.parse("2026-07-20T09:00:00.000Z"),
    endedAt: Date.parse("2026-07-20T10:00:00.000Z"),
    status: "submitted",
    task1: { attemptId: "wa_t1", promptId: "wp_t1" },
    task2: { attemptId: "wa_t2", promptId: "wp_t2" },
    perTaskSeconds: { task1: 20 * 60, task2: 40 * 60 },
    overtimeSeconds: 0,
    ...over,
  };
}

const row = (rows: ReturnType<typeof buildWritingHistory>, id: string) => {
  const found = rows.find((r) => r.id === id);
  if (!found) throw new Error(`no row ${id} in ${rows.map((r) => r.id).join(", ")}`);
  return found;
};

describe("snippet", () => {
  it("cuts at a word and marks the cut", () => {
    const short = snippet(PROMPT_TEXT, 40);
    expect(short.endsWith("…")).toBe(true);
    expect(short.length).toBeLessThanOrEqual(41);
    expect(PROMPT_TEXT.startsWith(short.slice(0, -1))).toBe(true);
  });

  it("leaves a short prompt alone and flattens whitespace", () => {
    expect(snippet("  Write a\n letter  ")).toBe("Write a letter");
    expect(snippet(null)).toBe("");
  });
});

describe("attempt rows", () => {
  it("titles a row with the question, never the id", () => {
    const [r] = buildWritingHistory({
      attempts: [attempt({ id: "wa_1", status: "scored", overall_band: 7.5, word_count: 280 })],
    });
    expect(r.title).toContain("Task 2");
    expect(r.title).toContain("Some people believe that university education");
    expect(r.title).not.toContain("wa_1");
    expect(r.band).toBe(7.5);
    expect(r.statusLabel).toBe("Marked");
    expect(r.statusTone).toBe("success");
    expect(r.href).toBe("/writing/attempt/wa_1");
    expect(r.kind).toBe("practice");
  });

  it("never invents a band for an attempt marking could not reach, and still opens it", () => {
    const [r] = buildWritingHistory({
      attempts: [attempt({ id: "wa_1", status: "failed", word_count: 260 })],
    });
    expect(r.band ?? null).toBeNull();
    expect(r.statusLabel).toBe("Not marked");
    expect(r.href).toBe("/writing/attempt/wa_1");
    expect(r.unopenableReason).toBeUndefined();
  });

  it("says whether a draft was started, and never scores one", () => {
    const rows = buildWritingHistory({
      attempts: [
        attempt({ id: "wa_started", word_count: 120, seconds_elapsed: 600 }),
        attempt({ id: "wa_blank" }),
        attempt({ id: "wa_sent", status: "submitted", word_count: 300 }),
      ],
    });
    expect(row(rows, "wa_started").statusLabel).toBe("Unfinished draft");
    expect(row(rows, "wa_started").durationS).toBe(600);
    expect(row(rows, "wa_blank").statusLabel).toBe("Not started");
    expect(row(rows, "wa_sent").statusLabel).toBe("Being marked");
    expect(rows.every((r) => (r.band ?? null) === null)).toBe(true);
  });

  it("keeps a scored row honest when no band came back with it", () => {
    const [r] = buildWritingHistory({
      attempts: [attempt({ id: "wa_1", status: "scored", overall_band: null })],
    });
    expect(r.band ?? null).toBeNull();
    expect(r.statusLabel).toBe("Marked, no band recorded");
  });

  it("opens an attempt whose prompt has left the pack, and says the prompt is gone", () => {
    const [r] = buildWritingHistory({
      attempts: [attempt({ id: "wa_1", prompt: null, word_count: 200 })],
    });
    expect(r.title).toContain("Prompt no longer in your pack");
    expect(r.href).toBe("/writing/attempt/wa_1");
  });

  it("numbers a redraft chain so three rows do not read the same", () => {
    const rows = buildWritingHistory({
      attempts: [
        attempt({ id: "wa_c", parent_attempt_id: "wa_b", started_at: "2026-07-03T09:00:00Z" }),
        attempt({ id: "wa_a", started_at: "2026-07-01T09:00:00Z" }),
        attempt({ id: "wa_b", parent_attempt_id: "wa_a", started_at: "2026-07-02T09:00:00Z" }),
      ],
    });
    expect(row(rows, "wa_a").title).toContain("(draft 1 of 3)");
    expect(row(rows, "wa_b").title).toContain("(draft 2 of 3)");
    expect(row(rows, "wa_c").title).toContain("(draft 3 of 3)");
    expect(new Set(rows.map((r) => r.title)).size).toBe(3);
  });

  it("marks a redraft whose parent is not on this page, and does not hang on a cycle", () => {
    const rows = buildWritingHistory({
      attempts: [
        attempt({ id: "wa_orphan", parent_attempt_id: "wa_missing" }),
        attempt({ id: "wa_loop", parent_attempt_id: "wa_loop" }),
      ],
    });
    expect(row(rows, "wa_orphan").title).toContain("(redraft)");
    expect(row(rows, "wa_loop").title).toContain("(redraft)");
  });

  it("files an exam attempt with no sitting around it as a full test", () => {
    const [r] = buildWritingHistory({
      attempts: [attempt({ id: "wa_1", mode: "exam", status: "scored", overall_band: 6 })],
    });
    expect(r.kind).toBe("mock");
    expect(r.href).toBe("/writing/attempt/wa_1");
  });

  it("searches the whole prompt, not just the part the title shows", () => {
    const [r] = buildWritingHistory({ attempts: [attempt({ id: "wa_1" })] });
    expect(r.title).not.toContain("widening participation");
    expect(matchesQuery(r, "widening participation")).toBe(true);
    expect(matchesQuery(r, "discuss both views")).toBe(true);
    expect(matchesQuery(r, "bar chart")).toBe(false);
  });
});

describe("mock sittings", () => {
  const task1 = attempt({
    id: "wa_t1",
    prompt_id: "wp_t1",
    mode: "exam",
    status: "scored",
    overall_band: 6,
    prompt: { id: "wp_t1", task_type: "ac_task1", genre: "bar", prompt_text: "The bar chart shows coffee consumption." },
  });
  const task2 = attempt({
    id: "wa_t2",
    prompt_id: "wp_t2",
    mode: "exam",
    status: "scored",
    overall_band: 7.5,
    prompt: { id: "wp_t2", task_type: "task2", genre: "opinion", prompt_text: PROMPT_TEXT },
  });

  it("shows one row for the hour instead of two unrelated essays", () => {
    const rows = buildWritingHistory({
      attempts: [task1, task2],
      mocks: [mockRecord()],
    });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.id).toBe("mock:mk_1");
    expect(r.kind).toBe("mock");
    expect(r.title).toContain("Academic paper");
    expect(r.title).toContain("Some people believe");
    // Task 2 counts double: (6 + 2 × 7.5) / 3 = 7.0, the same rule the report applies.
    expect(r.band).toBe(7);
    expect(r.statusLabel).toBe("Marked");
    expect(r.href).toBe("/writing/mock/report/mk_1");
    expect(r.durationS).toBe(3600);
    expect(matchesQuery(r, "coffee consumption")).toBe(true);
  });

  it("scores nothing while the hour is still running and sends you back to the clock", () => {
    const rows = buildWritingHistory({
      attempts: [task1, task2],
      mocks: [mockRecord({ status: "sitting", endedAt: null })],
    });
    const r = rows[0];
    expect(r.band ?? null).toBeNull();
    expect(r.statusLabel).toBe("Not finished");
    expect(r.href).toBe("/writing/mock/sitting/mk_1");
    // The attributed minutes, not every hour since the sitting was opened.
    expect(r.durationS).toBe(3600);
  });

  it("awards no band when only one task came back marked", () => {
    const rows = buildWritingHistory({
      attempts: [task1, { ...task2, status: "failed", overall_band: null }],
      mocks: [mockRecord()],
    });
    expect(rows[0].band ?? null).toBeNull();
    expect(rows[0].statusLabel).toBe("Handed in, not marked");
  });

  it("says an abandoned hour was ended early", () => {
    const rows = buildWritingHistory({
      attempts: [task1, task2],
      mocks: [mockRecord({ status: "abandoned" })],
    });
    expect(rows[0].statusLabel).toBe("Ended early");
    expect(rows[0].href).toBe("/writing/mock/report/mk_1");
  });

  it("refuses to link a sitting whose answers are gone", () => {
    const rows = buildWritingHistory({ attempts: [], mocks: [mockRecord()] });
    expect(rows[0].href).toBeNull();
    expect(rows[0].unopenableReason).toBe("its answers are no longer stored");
  });
});

describe("server-side sittings", () => {
  const session: WritingMockSession = {
    mock_id: "wm_1",
    status: "complete",
    module: "general_training",
    started_at: "2026-06-01T08:00:00.000Z",
    finished_at: "2026-06-01T09:00:00.000Z",
    minutes: 58,
    estimated_band: 6.5,
    task1_band: 6,
    task2_band: 7,
    prompt_ids: ["wp_a", "wp_b"],
  };

  it("lists a sitting it cannot open rather than linking a screen that would fail", () => {
    const rows = buildWritingHistory({ attempts: [], serverMocks: [session] });
    expect(rows[0].href).toBeNull();
    expect(rows[0].unopenableReason).toBe("this sitting is not on this machine");
    expect(rows[0].title).toBe("General Training paper");
    expect(rows[0].band).toBe(6.5);
    expect(rows[0].durationS).toBe(58 * 60);
  });

  it("does not also list the two attempts that sitting opened", () => {
    const rows = buildWritingHistory({
      attempts: [
        attempt({ id: "wa_a", prompt_id: "wp_a", mode: "exam", started_at: session.started_at }),
        attempt({ id: "wa_b", prompt_id: "wp_b", mode: "exam", started_at: session.started_at }),
        // Same prompt, different day: a practice run, not part of that hour.
        attempt({ id: "wa_c", prompt_id: "wp_a", started_at: "2026-06-09T08:00:00.000Z" }),
      ],
      serverMocks: [session],
    });
    expect(rows.map((r) => r.id).sort()).toEqual(["mock:wm_1", "wa_c"]);
  });
});

describe("the whole list", () => {
  it("sorts unscored work below the bands without calling it band zero", () => {
    const rows = buildWritingHistory({
      attempts: [
        attempt({ id: "wa_draft", word_count: 40 }),
        attempt({ id: "wa_low", status: "scored", overall_band: 5 }),
        attempt({ id: "wa_high", status: "scored", overall_band: 8 }),
      ],
    });
    expect(sortRows(rows, "band-high").map((r) => r.id)).toEqual(["wa_high", "wa_low", "wa_draft"]);
    expect(sortRows(rows, "band-low").map((r) => r.id)).toEqual(["wa_low", "wa_high", "wa_draft"]);
  });

  it("offers both filters when the learner has practised and sat a paper", () => {
    const rows = buildWritingHistory({
      attempts: [attempt({ id: "wa_1" })],
      mocks: [mockRecord()],
    });
    expect(new Set(rows.map((r) => r.kind))).toEqual(new Set(["practice", "mock"]));
  });
});
