/**
 * Writing's records, in the shared history shape.
 *
 * Three sources feed one list, and the awkward part is that they overlap:
 *
 *  - `GET /writing/attempts` — every essay ever started, including the two attempts a mock
 *    sitting opens (a mock task *is* an ordinary attempt in `mode: "exam"`).
 *  - the local mock records (`components/mock/store.ts`) — the only place the *pairing* of
 *    those two attempts into one sixty-minute sitting is kept.
 *  - `GET /writing/mock/sessions` — the sidecar's own mock table. Nothing in this app writes
 *    it, so it is normally empty; when it is not, its sittings have no screen to open (the
 *    report resolves a local record), so they are listed unopenably rather than linked to a
 *    screen that would say "not on this machine".
 *
 * So a sitting is emitted once, as one row, and the task attempts it owns are dropped from
 * the flat list rather than repeated under it.
 *
 * **Redrafts.** `POST /attempts/{id}/rewrite` makes a child attempt against the same prompt,
 * so one prompt can own a chain of four attempts that would otherwise render as four
 * identical lines. Each attempt still gets its own row — every one of them is a real thing
 * the learner wrote and can reopen — but a chain of more than one numbers its members in the
 * title, so the rows read "…(draft 1 of 3)", "…(draft 2 of 3)" instead of four copies of the
 * same sentence. A redraft whose parent fell off the page is marked "(redraft)".
 */

import type { HistoryRow } from "@/components/practice/history";
import { TASK_SHORT, genreLabel, type AttemptSummary, type TaskType } from "../store";
import { elapsedOf, estimatedPaperBand, type MockRecord } from "../components/mock/store";

/** One row of `GET /api/v1/writing/mock/sessions`. */
export interface WritingMockSession {
  mock_id: string;
  status: string;
  module?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  minutes?: number | null;
  estimated_band?: number | null;
  task1_band?: number | null;
  task2_band?: number | null;
  prompt_ids?: (string | null)[] | null;
}

export interface WritingHistoryInput {
  attempts: AttemptSummary[];
  /** Sittings kept on this machine. */
  mocks?: MockRecord[];
  /** Sittings the sidecar knows about. Empty for every build that ships this screen. */
  serverMocks?: WritingMockSession[];
}

const MODULE_LABEL: Record<string, string> = {
  academic: "Academic",
  general: "General Training",
  general_training: "General Training",
};

const NO_PROMPT = "Prompt no longer in your pack";

/**
 * The first line of a prompt, cut at a word. A title is what the learner would call the
 * thing; for writing that is the question, not the attempt id.
 */
export function snippet(text: string | null | undefined, max = 96): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  const kept = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${kept.replace(/[\s,.;:—-]+$/, "")}…`;
}

export interface ChainPosition {
  /** 0-based place in the redraft chain, oldest first. */
  index: number;
  /** How many attempts are in the chain. 1 means it was never redrafted. */
  size: number;
  /** A redraft whose parent is not in this list — the chain is only partly known. */
  orphan: boolean;
}

function orderKey(attempt: AttemptSummary): string {
  // ULIDs are time-ordered, so the id is a usable tie-break for rows with no envelope.
  return attempt.started_at ?? attempt.submitted_at ?? attempt.id;
}

/** Where each attempt sits in its redraft chain. */
export function chainPositions(attempts: AttemptSummary[]): Map<string, ChainPosition> {
  const byId = new Map(attempts.map((a) => [a.id, a]));
  const groups = new Map<string, AttemptSummary[]>();

  for (const attempt of attempts) {
    let node = attempt;
    const seen = new Set<string>([attempt.id]);
    while (node.parent_attempt_id) {
      const parent = byId.get(node.parent_attempt_id);
      // A parent off the page, or a cycle written by a bad migration, ends the walk
      // rather than hanging the render.
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      node = parent;
    }
    const bucket = groups.get(node.id);
    if (bucket) bucket.push(attempt);
    else groups.set(node.id, [attempt]);
  }

  const positions = new Map<string, ChainPosition>();
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => orderKey(a).localeCompare(orderKey(b)));
    ordered.forEach((attempt, index) => {
      positions.set(attempt.id, {
        index,
        size: ordered.length,
        orphan: ordered.length === 1 && Boolean(attempt.parent_attempt_id),
      });
    });
  }
  return positions;
}

interface AttemptState {
  label: string;
  tone: HistoryRow["statusTone"];
  band: number | null;
}

/**
 * What happened to this attempt, in the learner's words.
 *
 * `failed` is the common case rather than the rare one: the shipped default points at a
 * local model most people have never installed, so the marking job fails and the attempt
 * lands here. That is "not marked", not "marking failed" in red — the essay is intact, the
 * attempt still opens, and the workspace explains what to configure. No band is invented.
 */
export function attemptState(attempt: AttemptSummary): AttemptState {
  switch (attempt.status) {
    case "scored":
      return typeof attempt.overall_band === "number"
        ? { label: "Marked", tone: "success", band: attempt.overall_band }
        : { label: "Marked, no band recorded", tone: "default", band: null };
    case "submitted":
      return { label: "Being marked", tone: "default", band: null };
    case "failed":
      return { label: "Not marked", tone: "warning", band: null };
    default:
      return attempt.word_count > 0
        ? { label: "Unfinished draft", tone: "warning", band: null }
        : { label: "Not started", tone: "default", band: null };
  }
}

export function attemptRow(attempt: AttemptSummary, position?: ChainPosition): HistoryRow {
  const taskType: TaskType = attempt.prompt?.task_type ?? "task2";
  const question = snippet(attempt.prompt?.prompt_text);
  let title = `${TASK_SHORT[taskType]} · ${question || NO_PROMPT}`;
  if (position && position.size > 1) {
    title += ` (draft ${position.index + 1} of ${position.size})`;
  } else if (attempt.parent_attempt_id) {
    title += " (redraft)";
  }

  const state = attemptState(attempt);
  return {
    id: attempt.id,
    // An exam-mode attempt with no sitting around it is what a mock leaves behind once its
    // local record is gone. It was sat as a full test, so it is still filed as one.
    kind: attempt.mode === "exam" ? "mock" : "practice",
    title,
    startedAt: attempt.started_at ?? attempt.submitted_at ?? null,
    durationS: attempt.seconds_elapsed || null,
    band: state.band,
    statusLabel: state.label,
    statusTone: state.tone,
    href: `/writing/attempt/${attempt.id}`,
    searchText: [
      attempt.prompt?.prompt_text ?? "",
      attempt.prompt?.genre ? genreLabel(attempt.prompt.genre) : "",
      attempt.mode === "exam" ? "exam mock" : "practice",
      `${attempt.word_count} words`,
      attempt.status === "failed" ? "marking failed unmarked" : "",
      attempt.parent_attempt_id ? "redraft rewrite" : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function isoOf(epochMs: number): string | null {
  if (!Number.isFinite(epochMs)) return null;
  const date = new Date(epochMs);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function mockRow(record: MockRecord, byId: Map<string, AttemptSummary>): HistoryRow {
  const task1 = byId.get(record.task1.attemptId) ?? null;
  const task2 = byId.get(record.task2.attemptId) ?? null;
  const moduleLabel = MODULE_LABEL[record.module] ?? "Academic";
  // Task 2 is the memorable half of the hour and the one worth double, so it names the row.
  const topic = snippet(task2?.prompt?.prompt_text, 72);

  const band =
    record.status === "sitting"
      ? null
      : estimatedPaperBand(task1?.overall_band ?? null, task2?.overall_band ?? null);

  let label: string;
  let tone: HistoryRow["statusTone"];
  if (record.status === "sitting") {
    label = "Not finished";
    tone = "warning";
  } else if (record.status === "abandoned") {
    label = "Ended early";
    tone = "warning";
  } else if (band !== null) {
    label = "Marked";
    tone = "success";
  } else {
    label = "Handed in, not marked";
    tone = "default";
  }

  // Both answers gone means the report has nothing to draw, so the row says so instead of
  // opening a screen that can only apologise.
  const answersGone = record.status !== "sitting" && !task1 && !task2;
  const href = answersGone
    ? null
    : record.status === "sitting"
      ? `/writing/mock/sitting/${record.id}`
      : `/writing/mock/report/${record.id}`;

  const attributed = record.perTaskSeconds.task1 + record.perTaskSeconds.task2;

  return {
    id: `mock:${record.id}`,
    kind: "mock",
    title: topic ? `${moduleLabel} paper · ${topic}` : `${moduleLabel} paper`,
    startedAt: isoOf(record.startedAt),
    // A sitting left open would otherwise report every hour since it was opened, so an
    // unfinished one reports the time actually attributed to its two tasks.
    durationS: record.endedAt ? elapsedOf(record) : attributed || null,
    band,
    statusLabel: label,
    statusTone: tone,
    href,
    unopenableReason: answersGone ? "its answers are no longer stored" : undefined,
    searchText: [
      "mock full paper 60-minute sitting",
      moduleLabel,
      task1?.prompt?.prompt_text ?? "",
      task2?.prompt?.prompt_text ?? "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export function serverMockRow(item: WritingMockSession): HistoryRow {
  const moduleLabel = MODULE_LABEL[item.module ?? ""] ?? "Academic";
  const band = typeof item.estimated_band === "number" ? item.estimated_band : null;

  let label: string;
  let tone: HistoryRow["statusTone"];
  if (item.status === "in_progress") {
    label = "Not finished";
    tone = "warning";
  } else if (item.status === "abandoned") {
    label = "Ended early";
    tone = "warning";
  } else if (band !== null) {
    label = "Marked";
    tone = "success";
  } else {
    label = "Handed in, not marked";
    tone = "default";
  }

  return {
    id: `mock:${item.mock_id}`,
    kind: "mock",
    title: `${moduleLabel} paper`,
    startedAt: item.started_at ?? null,
    durationS: typeof item.minutes === "number" ? Math.round(item.minutes * 60) : null,
    band,
    statusLabel: label,
    statusTone: tone,
    // The sitting screens read the local record, so there is no screen to send this to.
    href: null,
    unopenableReason: "this sitting is not on this machine",
    searchText: `mock full paper 60-minute sitting ${moduleLabel}`,
  };
}

/** Every writing record this learner has, as one list. Sorting belongs to `HistoryView`. */
export function buildWritingHistory({
  attempts,
  mocks = [],
  serverMocks = [],
}: WritingHistoryInput): HistoryRow[] {
  const byId = new Map(attempts.map((a) => [a.id, a]));

  const paired = new Set<string>();
  for (const record of mocks) {
    paired.add(record.task1.attemptId);
    paired.add(record.task2.attemptId);
  }

  // A server-side sitting opens its two attempts in the same transaction, with the mock's
  // own `started_at` copied onto both envelopes — so prompt + start time identifies them
  // exactly, and the flat list does not repeat what the sitting row already says.
  const serverTasks = new Set<string>();
  for (const item of serverMocks) {
    for (const promptId of item.prompt_ids ?? []) {
      if (promptId && item.started_at) serverTasks.add(`${promptId}|${item.started_at}`);
    }
  }

  const positions = chainPositions(attempts);

  const rows: HistoryRow[] = [
    ...mocks.map((record) => mockRow(record, byId)),
    ...serverMocks.map(serverMockRow),
  ];

  for (const attempt of attempts) {
    if (paired.has(attempt.id)) continue;
    if (
      attempt.mode === "exam" &&
      attempt.started_at &&
      serverTasks.has(`${attempt.prompt_id}|${attempt.started_at}`)
    ) {
      continue;
    }
    rows.push(attemptRow(attempt, positions.get(attempt.id)));
  }

  return rows;
}
