/**
 * The reading adapter for the shared history screen.
 *
 * Reading records the same session in up to three places — a `reading_attempts` row, a
 * `drill_results` row when the attempt was a type drill, and a mock ledger entry when it
 * was sat as a mock paper — so the mapping here is mostly about *not* showing one sitting
 * three times. Everything else is translation: the sidecar's columns into the words a
 * learner would use for their own work.
 *
 * Nothing in this file renders. `HistoryView` owns the search, the filters, the sort and
 * the empty states; this file owns what a reading record *means*.
 */

import { api } from "@/lib/api";
import type { HistoryRow } from "@/components/practice/history";
import { qtypeLabel } from "./qtypes";
import { readMockRecords } from "./components/mock/store";
import type {
  AttemptListItem,
  DrillResultItem,
  MockSessionItem,
  Paged,
} from "./types";

const RD = "/api/v1/reading";

/** One page is the whole ledger for any realistic learner; paging is there if not. */
const PAGE = 200;

const FORMAT_LABEL: Record<string, string> = {
  academic: "Academic",
  general_training: "General Training",
};

/**
 * Drill kinds from `bandready.reading.drills.RESULT_KINDS`, in the learner's words.
 * A drill that arrives under an unknown kind is still listed — titled by its raw slug
 * rather than dropped, because a row the app cannot name is still a row the learner sat.
 */
const DRILL_KIND_LABEL: Record<string, string> = {
  question_type: "Question type",
  trap: "Trap",
  paraphrase: "Paraphrase",
  skim: "Skim",
  scan: "Scan",
};

function drillKindLabel(kind: string): string {
  return DRILL_KIND_LABEL[kind] ?? kind.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Words folded into the search box but never rendered. Blank parts are dropped. */
function searchable(...parts: (string | number | null | undefined)[]): string | undefined {
  const text = parts
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== "")
    .join(" ");
  return text || undefined;
}

// --------------------------------------------------------------------- attempts ---

export type MockLedger = ReadonlySet<string>;

/**
 * Where an attempt reopens.
 *
 * A mock sitting is an ordinary attempt row, so the plain review would open for it and
 * would be the wrong screen: the mock report leads with the pacing split, which is the
 * only thing an hour under exam conditions was measuring. Which attempts were mocks is
 * known from the local sitting ledger and from the sidecar's own `reading_mock` activity.
 */
function attemptDestination(
  item: AttemptListItem,
  isMock: boolean,
  contentGone: boolean,
): { href: string | null; unopenableReason?: string } {
  // The sidecar rebuilds the passage document to serve a review, so a record whose pack has
  // been uninstalled would answer 404. A row that opens onto an error is worse than a row
  // that says why it cannot open.
  if (contentGone) return { href: null, unopenableReason: "its content pack is no longer installed" };
  if (item.status === "submitted") {
    return {
      href: isMock ? `/reading/mock/report/${item.attempt_id}` : `/reading/review/${item.attempt_id}`,
    };
  }
  if (item.status === "in_progress") {
    return {
      href: isMock
        ? `/reading/mock/sitting/${item.attempt_id}`
        : `/reading/attempt/${item.attempt_id}`,
    };
  }
  // Abandoned. Review is refused until an attempt is submitted (the sidecar answers 409),
  // and resuming it would restart a clock that already ran out, so there is nowhere to go.
  return { href: null, unopenableReason: "it was never marked" };
}

export function isMockAttempt(item: AttemptListItem, ledger: MockLedger): boolean {
  return item.activity === "reading_mock" || ledger.has(item.attempt_id);
}

export function attemptRow(item: AttemptListItem, ledger: MockLedger): HistoryRow {
  const mock = isMockAttempt(item, ledger);
  const scored = item.status === "submitted";
  const drill = item.mode === "drill";
  // The sidecar leaves `title` null for a drill on purpose (a drill borrows questions from
  // across the bank), and *also* when the test or passage has left the installed pack.
  const contentGone = !drill && !item.title;

  const title = drill
    ? `${qtypeLabel(item.qtype ?? "")} drill`
    : (item.title ??
      (item.test_id ? "A reading test that is no longer installed" : "A passage that is no longer installed"));

  const statusLabel =
    item.status === "submitted"
      ? "Scored"
      : item.status === "abandoned"
        ? "Ended early"
        : "Not finished";

  const destination = attemptDestination(item, mock, contentGone);

  return {
    id: item.attempt_id,
    // `KIND_LABEL.mock` is "Full test", which is what a whole 40-question paper is whether
    // it was sat from the library or through the mock preflight.
    kind: drill ? "drill" : item.mode === "full" ? "mock" : "practice",
    title,
    startedAt: item.started_at,
    durationS: item.duration_s && item.duration_s > 0 ? item.duration_s : null,
    // Reading is marked, not judged: the band is a table lookup off the raw score, and on a
    // single passage it is a projection of thirteen questions onto forty. "31 of 40" is the
    // measurement; the band is shown on the review screen where the disclaimer fits.
    band: null,
    correct: scored ? item.raw_score : null,
    outOf: scored ? item.total_questions : null,
    statusLabel,
    statusTone:
      item.status === "submitted" ? "success" : item.status === "abandoned" ? "warning" : "default",
    href: destination.href,
    unopenableReason: destination.unopenableReason,
    searchText: searchable(
      FORMAT_LABEL[item.format ?? ""] ?? item.format,
      item.qtype ? qtypeLabel(item.qtype) : null,
      item.exam_conditions ? "exam conditions" : null,
      typeof item.band === "number" ? `band ${item.band.toFixed(1)}` : null,
      !scored && item.answered > 0 && item.total_questions
        ? `${item.answered} of ${item.total_questions} answered`
        : null,
    ),
  };
}

// ----------------------------------------------------------------------- drills ---

export function drillRow(item: DrillResultItem): HistoryRow {
  const name = item.qtype ? qtypeLabel(item.qtype) : drillKindLabel(item.drill_kind);
  return {
    id: item.drill_id,
    kind: "drill",
    title: `${name} drill`,
    startedAt: item.started_at,
    durationS: item.duration_s && item.duration_s > 0 ? item.duration_s : null,
    band: null,
    correct: item.n_correct,
    outOf: item.n_items,
    statusLabel: "Scored",
    statusTone: "success",
    // A standalone drill keeps its counts and its trap tallies but not the set: the items
    // are rebuilt from a seed at grade time and nothing renders a past one.
    href: null,
    unopenableReason: "drill reports are not kept after the run",
    searchText: searchable(drillKindLabel(item.drill_kind), item.trap?.replace(/[-_]/g, " ")),
  };
}

// ------------------------------------------------------------------ mock papers ---

export function mockRow(item: MockSessionItem): HistoryRow {
  const scored = item.raw_score !== null && item.raw_score !== undefined;
  const href =
    item.status === "submitted"
      ? `/reading/mock/report/${item.attempt_id}`
      : item.status === "in_progress"
        ? `/reading/mock/sitting/${item.attempt_id}`
        : null;
  return {
    id: item.mock_id,
    kind: "mock",
    title: item.title ?? "Mock reading paper",
    startedAt: item.started_at,
    durationS: item.minutes ? Math.round(item.minutes * 60) : null,
    band: null,
    correct: scored ? item.raw_score : null,
    outOf: scored ? item.total_questions : null,
    statusLabel:
      item.status === "submitted"
        ? "Scored"
        : item.status === "abandoned"
          ? "Walked out"
          : "Still open",
    statusTone: item.status === "submitted" ? "success" : "warning",
    href,
    unopenableReason: href ? undefined : "it was never marked",
    searchText: searchable(
      FORMAT_LABEL[item.module ?? ""] ?? item.module,
      "mock paper exam conditions",
    ),
  };
}

// ------------------------------------------------------------------- assembling ---

export interface ReadingHistorySources {
  attempts: AttemptListItem[];
  drills: DrillResultItem[];
  mocks: MockSessionItem[];
}

/**
 * Every reading record this learner has, once each.
 *
 * The three sources overlap on purpose in the database and must not overlap on screen:
 * a mock sitting is also an attempt row, and a type drill sat inside an attempt is also a
 * `drill_results` row. The attempt is the richer record of the two in both cases — it is
 * the one that can be reopened — so it wins, and the shadow is dropped.
 */
export function buildHistoryRows(sources: ReadingHistorySources): HistoryRow[] {
  const ledger: MockLedger = new Set(readMockRecords().map((record) => record.attemptId));
  const attemptIds = new Set(sources.attempts.map((item) => item.attempt_id));

  const rows = sources.attempts.map((item) => attemptRow(item, ledger));
  for (const item of sources.drills) {
    if (item.attempt_id && attemptIds.has(item.attempt_id)) continue;
    rows.push(drillRow(item));
  }
  for (const item of sources.mocks) {
    if (attemptIds.has(item.attempt_id) || attemptIds.has(item.mock_id)) continue;
    rows.push(mockRow(item));
  }
  return rows;
}

/**
 * Fetch all three ledgers.
 *
 * The mock list is optional: a build whose learner has never opened a server-assembled
 * mock has no `reading_mocks` table behind it, and the local sitting ledger covers the
 * mocks the current preflight screen creates. A failure there must not blank out the
 * attempts the learner definitely has, so it degrades to an empty list rather than
 * throwing — unlike the attempts call, whose failure is the screen's failure.
 */
export async function fetchReadingHistory(): Promise<HistoryRow[]> {
  const [attempts, drills] = await Promise.all([
    api.get<Paged<AttemptListItem>>(`${RD}/attempts?limit=${PAGE}`),
    api
      .get<Paged<DrillResultItem>>(`${RD}/drills/results?limit=${PAGE}`)
      .catch(() => ({ items: [], next_cursor: null }) as Paged<DrillResultItem>),
  ]);
  const mocks = await api
    .get<{ items?: MockSessionItem[] }>(`${RD}/mock/sessions?limit=100`)
    .catch(() => ({ items: [] }));

  return buildHistoryRows({
    attempts: attempts.items ?? [],
    drills: drills.items ?? [],
    mocks: mocks.items ?? [],
  });
}
