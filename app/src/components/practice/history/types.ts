/**
 * One shape for every past attempt, whatever produced it.
 *
 * Each skill stores its history in its own table and serves it from its own route: listening
 * and writing list attempts, reading lists nothing at all, speaking lists sessions, and all
 * four keep mocks somewhere else again. Left alone, four history screens would have grown four
 * different row shapes and four different filter vocabularies, which is how this repo ended up
 * with eight incompatible key sets in a content pack once already.
 *
 * So the adapting happens at the edge. Each feature maps its own endpoints into `HistoryRow`
 * and hands the list to one screen, which owns the search box, the filters, the sort and the
 * empty states. A new skill costs an adapter, not another history screen.
 */

/** What produced the attempt. This is the filter the learner actually wants. */
export type HistoryKind = "mock" | "practice" | "drill" | "coach";

export const KIND_LABEL: Record<HistoryKind, string> = {
  mock: "Full test",
  practice: "Practice",
  drill: "Drill",
  coach: "Coaching",
};

export interface HistoryRow {
  id: string;
  kind: HistoryKind;
  /** What was attempted, in the learner's terms: a passage title, a cue card topic. */
  title: string;
  /** ISO timestamp. Rows with no usable date sort last rather than to 1970. */
  startedAt: string | null;
  /** Seconds spent, when the attempt recorded any. */
  durationS?: number | null;
  /**
   * The band, when one was awarded. Null covers three different situations, so never render a
   * bare dash: `statusLabel` says which one it was.
   */
  band?: number | null;
  /** Raw score, for the objective papers where "31 of 40" beats a band estimate. */
  correct?: number | null;
  outOf?: number | null;
  /** Short state in the learner's words: "Scored", "Not finished", "Ended early". */
  statusLabel: string;
  statusTone?: "default" | "success" | "warning" | "destructive";
  /** Where the row goes when opened. Null means the record cannot be reopened. */
  href: string | null;
  /** Why it cannot be opened, when `href` is null. A row that does nothing must say so. */
  unopenableReason?: string;
  /** Free text folded into the search, e.g. a topic or the first line of a transcript. */
  searchText?: string;
}

export type SortKey = "newest" | "oldest" | "band-high" | "band-low";

export const SORT_LABEL: Record<SortKey, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  "band-high": "Highest band",
  "band-low": "Lowest band",
};

function timeOf(row: HistoryRow): number {
  if (!row.startedAt) return Number.NEGATIVE_INFINITY;
  const t = Date.parse(row.startedAt);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** Band, then raw score as a fraction, so a listening paper still sorts by how it went. */
function scoreOf(row: HistoryRow): number | null {
  if (typeof row.band === "number") return row.band;
  if (typeof row.correct === "number" && row.outOf) return (row.correct / row.outOf) * 9;
  return null;
}

export function sortRows(rows: HistoryRow[], key: SortKey): HistoryRow[] {
  const out = [...rows];
  if (key === "newest" || key === "oldest") {
    const dir = key === "newest" ? -1 : 1;
    // Undated rows go last in both directions. Sorting them to the top of "oldest" would
    // put the records we know least about in front of the ones the learner is looking for.
    out.sort((a, b) => {
      const ta = timeOf(a);
      const tb = timeOf(b);
      if (ta === tb) return 0;
      if (ta === Number.NEGATIVE_INFINITY) return 1;
      if (tb === Number.NEGATIVE_INFINITY) return -1;
      return (ta - tb) * dir;
    });
    return out;
  }
  const dir = key === "band-high" ? -1 : 1;
  out.sort((a, b) => {
    const sa = scoreOf(a);
    const sb = scoreOf(b);
    // An unscored attempt has no place on a band ranking, so it falls to the bottom
    // rather than being treated as a zero.
    if (sa === null && sb === null) return timeOf(b) - timeOf(a);
    if (sa === null) return 1;
    if (sb === null) return -1;
    if (sa === sb) return timeOf(b) - timeOf(a);
    return (sa - sb) * dir;
  });
  return out;
}

export function matchesQuery(row: HistoryRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [row.title, row.searchText, KIND_LABEL[row.kind], row.statusLabel]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  // Every word has to appear somewhere, in any order: "reading band 7" should find a
  // reading row scored 7 without the learner guessing the field order.
  return q.split(/\s+/).every((word) => haystack.includes(word));
}
