/**
 * Listening's adapter onto the shared history contract.
 *
 * Four ledgers record listening work and none of them agreed on anything: attempts live in
 * `listening_attempts` and are listed by mode and status, mock sittings live in
 * `listening_mocks` and are listed by their own five-value status, drills live in
 * `drill_results` behind a raw count, and none of the three carries the one thing a learner
 * recognises a row by — what they actually listened to. This module is where the three
 * become one list.
 *
 * Three decisions are worth reading before the code.
 *
 * 1. **A mock sitting is in both ledgers, and must appear once.** Opening a mock writes a
 *    `listening_attempts` row whose id *is* the mock id, so the attempts list and the mock
 *    list describe the same sitting. The mock list wins — it is the one that knows the
 *    paper's title and whether the report exists — and the duplicate attempt is dropped.
 * 2. **Listening is an objective paper, so rows carry `correct`/`outOf` and no band.** The
 *    middle of the band table is five raw marks wide: a learner who went from 18 to 22 has
 *    improved by a fifth and a band-first row tells them nothing happened. `sortRows`
 *    ranks a raw score as a fraction, so "highest band" still orders these correctly.
 * 3. **A row links only where a page really exists.** A review needs a submitted attempt
 *    (the endpoint 409s otherwise, because in listening the transcript is the key), a mock
 *    report needs a marked paper, and a drill has no page at all — its report is drawn once
 *    by the runner and never persisted. Each of those says so in its own words rather than
 *    linking somewhere that dead-ends.
 */

import type { HistoryRow } from "@/components/practice/history";
import { KIND_LABEL as DRILL_KIND_LABEL } from "../components/drills/labels";
import { modeLabel } from "../labels";
import type { AttemptMode } from "../types";

// ------------------------------------------------------------------ wire shapes ---

/** One row of `GET /api/v1/listening/attempts`. */
export interface AttemptListRow {
  attempt_id: string;
  test_id: string | null;
  script_id: string | null;
  mode: AttemptMode | string;
  status: string;
  raw_score: number | null;
  total_questions: number | null;
  band: number | null;
  duration_s: number | null;
  /** Added for this screen: `submitted_at` is null for everything walked out of. */
  started_at?: string | null;
  submitted_at: string | null;
}

/** One row of `GET /api/v1/listening/mock/sessions`. */
export interface MockListRow {
  mock_id: string;
  attempt_id: string;
  status: string;
  title: string | null;
  test_id: string | null;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  raw_score: number | null;
  total_questions: number | null;
  band: number | null;
}

/** One row of `GET /api/v1/listening/practice/sessions`. */
export interface DrillListRow {
  session_id: string;
  kind: string;
  drill_kind: string;
  script_id: string | null;
  part: number | null;
  accent_set: string | null;
  mode: string | null;
  n_items: number;
  n_correct: number;
  started_at: string | null;
  ended_at: string | null;
  duration_s: number | null;
}

/**
 * Enough of the library to name a row. Structural on purpose: `TestSummary` and
 * `ScriptSummary` satisfy it, and so does a two-field fixture.
 */
export interface LibraryLookup {
  tests?: { id: string; title: string }[] | null;
  scripts?: { id: string; part: number; title: string }[] | null;
}

// ---------------------------------------------------------------------- naming ---

/**
 * What the learner would call it. A row titled `la_01KYFQ3M4F…` is a row nobody opens, and
 * "Attempt 3" is the same thing with extra steps.
 */
function titleOfAttempt(row: AttemptListRow, library: LibraryLookup): string {
  if (row.test_id) {
    const test = library.tests?.find((t) => t.id === row.test_id);
    // Uninstalling a pack does not delete the attempts taken from it, so the row survives
    // its own content. Saying which kind of thing it was beats showing the id.
    return test?.title ?? "Listening test (not in your library)";
  }
  const script = library.scripts?.find((s) => s.id === row.script_id);
  return script ? `Part ${script.part}: ${script.title}` : "Listening part (not in your library)";
}

function titleOfDrill(row: DrillListRow, library: LibraryLookup): string {
  const kind =
    DRILL_KIND_LABEL[row.kind as keyof typeof DRILL_KIND_LABEL] ??
    DRILL_KIND_LABEL[row.drill_kind as keyof typeof DRILL_KIND_LABEL] ??
    // `numbers_spelling` is the stored taxonomy value for the launcher's `numbers`.
    (row.drill_kind === "numbers_spelling" ? DRILL_KIND_LABEL.numbers : "Listening drill");
  const script = library.scripts?.find((s) => s.id === row.script_id);
  if (script) return `${kind} · Part ${script.part}: ${script.title}`;
  return kind;
}

// -------------------------------------------------------------------- attempts ---

/** Seconds between two stamps, when both parse. The mock ledger stores no duration. */
function spanSeconds(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 1000);
}

export function attemptRow(row: AttemptListRow, library: LibraryLookup): HistoryRow {
  const submitted = row.status === "submitted";
  const scored = submitted && row.raw_score !== null;
  const drillMode = row.mode === "accent_drill" || row.mode === "dictation";

  return {
    id: row.attempt_id,
    /*
      The mode is the filter, not the target: the library's own two tabs are "Exam
      conditions" and "Practice", and that is the distinction a learner is holding in mind
      when they come looking. A single part is never a full test, whatever mode it was
      opened in, so it stays under Practice.
    */
    kind: drillMode ? "drill" : row.mode === "exam" && row.test_id ? "mock" : "practice",
    title: titleOfAttempt(row, library),
    startedAt: row.started_at ?? row.submitted_at ?? null,
    durationS: row.duration_s,
    // No band, deliberately: this is an objective paper and `31 of 40` is the honest number.
    correct: scored ? row.raw_score : null,
    outOf: scored ? row.total_questions : null,
    statusLabel: submitted ? "Scored" : row.status === "in_progress" ? "Not finished" : "Ended early",
    statusTone: submitted ? "success" : row.status === "in_progress" ? "warning" : "default",
    href: submitted ? `/listening/review/${row.attempt_id}` : null,
    unopenableReason: submitted
      ? undefined
      : row.status === "in_progress"
        ? "never handed in, so nothing was marked"
        : "left before it was marked",
    searchText: [modeLabel(row.mode), row.test_id ? "full test" : "single part"].join(" "),
  };
}

// ----------------------------------------------------------------------- mocks ---

/** The three statuses a sitting is still open in — the preflight resumes all of them. */
const LIVE_MOCK = new Set(["preparing", "ready", "in_progress"]);

const MOCK_STATUS: Record<string, string> = {
  complete: "Scored",
  abandoned: "Ended early",
  in_progress: "Not finished",
  ready: "Never started",
  preparing: "Audio never finished rendering",
};

export function mockRow(row: MockListRow): HistoryRow {
  const scored = row.raw_score !== null;
  const live = LIVE_MOCK.has(row.status);
  return {
    id: row.mock_id,
    kind: "mock",
    title: row.title ?? "Mock listening paper",
    startedAt: row.started_at ?? row.created_at ?? null,
    durationS: spanSeconds(row.started_at, row.finished_at),
    correct: scored ? row.raw_score : null,
    outOf: scored ? row.total_questions : null,
    statusLabel: MOCK_STATUS[row.status] ?? "Not finished",
    statusTone:
      row.status === "complete" ? "success" : row.status === "abandoned" ? "default" : "warning",
    /*
      A finished paper opens its report; a sitting still open goes back to the sitting,
      which is the only honest destination while its clock is running. An abandoned mock
      has no report — walking out is not a submission and never earned one.
    */
    href: row.status === "complete"
      ? `/listening/mock/report/${row.mock_id}`
      : live
        ? `/listening/mock/sitting/${row.mock_id}`
        : null,
    unopenableReason: row.status === "complete" || live ? undefined : "walked out, so it was never marked",
    searchText: "mock paper exam conditions full test",
  };
}

// ---------------------------------------------------------------------- drills ---

export function drillRow(row: DrillListRow, library: LibraryLookup): HistoryRow {
  return {
    id: row.session_id,
    kind: "drill",
    title: titleOfDrill(row, library),
    startedAt: row.started_at ?? row.ended_at ?? null,
    durationS: row.duration_s,
    correct: row.n_correct,
    outOf: row.n_items,
    statusLabel: "Scored",
    statusTone: "success",
    // The runner draws a drill report once, in memory, and the sidecar stores only the
    // counts. There is no page to send anyone back to, so the row says so instead of
    // pretending to be a link.
    href: null,
    unopenableReason: "drill reports are not kept after the set ends",
    searchText: [row.kind, row.drill_kind, row.mode, row.accent_set].filter(Boolean).join(" "),
  };
}

// ------------------------------------------------------------------ everything ---

export interface ListeningHistoryInput {
  attempts: AttemptListRow[];
  mocks: MockListRow[];
  drills: DrillListRow[];
  library: LibraryLookup;
}

/**
 * Every listening record this learner has, as one list.
 *
 * Ordering is left to `HistoryView`, which owns the sort control; what happens here is the
 * de-duplication, which cannot be left to it: a mock sitting exists in both ledgers under
 * one id and would otherwise be counted twice on the filter chips as well as listed twice.
 */
export function listeningHistoryRows({
  attempts,
  mocks,
  drills,
  library,
}: ListeningHistoryInput): HistoryRow[] {
  const mockIds = new Set<string>();
  for (const mock of mocks) {
    mockIds.add(mock.mock_id);
    if (mock.attempt_id) mockIds.add(mock.attempt_id);
  }
  return [
    ...mocks.map(mockRow),
    ...attempts.filter((a) => !mockIds.has(a.attempt_id)).map((a) => attemptRow(a, library)),
    ...drills.map((d) => drillRow(d, library)),
  ];
}
