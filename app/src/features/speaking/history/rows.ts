/**
 * Speaking's adapter onto the shared `HistoryRow` contract.
 *
 * Pure on purpose: everything the screen shows is decided here, so the rules that
 * matter — what a row is called, whether it opens, and what its status honestly is —
 * can be asserted without rendering anything.
 *
 * The rule this file exists to enforce: a session with no band is not a failed session.
 * Three of the four speaking modes are never scored (04 §2), so for most of this room
 * the conversation IS the record, and a row whose only content is a transcript has to
 * open that transcript rather than sit there disabled. Every stored session the learner
 * has is currently a quick chat, and every one of them was unreachable.
 */

import type { HistoryKind, HistoryRow } from "@/components/practice/history";
import type { SessionRecord } from "../store";
import type { DrillAttempt, MockSitting } from "./api";

/** The activity kind, with the estimator weight class as the fallback for old rows. */
export function activityOf(record: SessionRecord): string {
  const activity = (record.activity ?? "").split(":")[0];
  if (activity) return activity;
  // Rows written before `practice_sessions.activity` existed carry only the weight
  // class (11 §4.2), where `mock` and `practice` mean the same thing one level up.
  if (record.mode === "mock") return "full_mock";
  if (record.mode === "practice") return "single_part";
  if (record.mode === "micro") return "quick_chat";
  return "";
}

const KIND_OF: Record<string, HistoryKind> = {
  full_mock: "mock",
  single_part: "practice",
  topic_drill: "drill",
  quick_chat: "practice",
};

/** Only Full Mock and Single Part are ever marked (04 §2). */
function scoreable(activity: string): boolean {
  return activity === "full_mock" || activity === "single_part";
}

function partOf(record: SessionRecord): number | null {
  if (typeof record.part === "number") return record.part;
  const suffix = (record.activity ?? "").split(":")[1];
  const parsed = Number(suffix);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3 ? parsed : null;
}

/**
 * What the learner would call this attempt.
 *
 * The topic is preferred over the mode every time: "Describe a place you like to
 * visit" is what they remember, "Single part" is what the database remembers. The mode
 * only names the row when there is no topic, and it never repeats the kind badge the
 * screen already draws.
 */
export function titleFor(record: SessionRecord, sitting: MockSitting | undefined): string {
  const activity = activityOf(record);
  const part = partOf(record);
  const topic =
    sitting?.part2_topic ?? sitting?.card_set_title ?? record.card_set_title ?? null;

  if (activity === "full_mock") return topic ?? "Full mock test";
  if (activity === "single_part") {
    if (topic) return part ? `${topic} · Part ${part}` : topic;
    return part ? `Part ${part} practice` : "Single part practice";
  }
  if (activity === "topic_drill") {
    if (topic) return `Topic drill · ${topic}`;
    return part ? `Part ${part} topic drill` : "Topic drill";
  }
  if (activity === "quick_chat") {
    // A chat has no card and no topic, so the only thing that tells one from another is
    // what was said in it. Without this every chat in the list has the same name.
    return record.opening_line ? `Chat · “${trim(record.opening_line, 70)}”` : "Quick chat";
  }
  return topic ?? "Speaking session";
}

function trim(text: string, max: number): string {
  const line = text.trim().replace(/\s+/g, " ");
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}

interface Status {
  label: string;
  tone: HistoryRow["statusTone"];
}

/**
 * The session's state in the learner's words.
 *
 * "Not scored" is reserved for sessions that were *meant* to be scored. Saying it about
 * a quick chat would report a rule of the product as a fault of the learner's.
 */
export function statusFor(record: SessionRecord, sitting: MockSitting | undefined): Status {
  const activity = activityOf(record);
  const hasTranscript = Boolean(record.has_transcript) || (record.turn_count ?? 0) > 0;

  if (record.live) return { label: "Live now", tone: "warning" };
  if (record.status === "failed" || record.state === "ERROR") {
    return { label: "Ended with an error", tone: "destructive" };
  }
  if (record.status === "aborted" || sitting?.status === "abandoned") {
    return { label: "Ended early", tone: "warning" };
  }
  if (record.status === "active") return { label: "Not finished", tone: "warning" };
  if (typeof record.overall_band === "number") return { label: "Scored", tone: "success" };
  if (scoreable(activity)) {
    return {
      label: hasTranscript ? "Not scored" : "Nothing recorded",
      tone: hasTranscript ? "warning" : "default",
    };
  }
  return hasTranscript
    ? { label: "Conversation saved", tone: "default" }
    : { label: "Nothing recorded", tone: "default" };
}

export function toHistoryRow(
  record: SessionRecord,
  sitting: MockSitting | undefined,
): HistoryRow {
  const activity = activityOf(record);
  const kind = KIND_OF[activity] ?? "practice";
  const isMock = kind === "mock";
  const hasTranscript = Boolean(record.has_transcript) || (record.turn_count ?? 0) > 0;
  const status = statusFor(record, sitting);

  // Three destinations in falling order of usefulness: the marked report, the live call
  // it is still in, and the conversation itself. Nothing else is ever linked — a row
  // that navigates to a screen with nothing on it is worse than one that says why not.
  let href: string | null = null;
  let unopenableReason: string | undefined;
  if (record.report_id) {
    href = isMock
      ? `/speaking/mock/report/${record.report_id}`
      : `/speaking/report/${record.report_id}`;
  } else if (record.live) {
    href = `/speaking/session/${record.id}`;
  } else if (hasTranscript) {
    href = `/speaking/session/${record.id}/transcript`;
  } else {
    unopenableReason = "nothing was said in it";
  }

  return {
    id: record.id,
    kind,
    title: titleFor(record, sitting),
    startedAt: record.started_at ?? sitting?.started_at ?? null,
    durationS: record.duration_s ?? sitting?.duration_s ?? null,
    // A band only when one was measured. An unscored session is not a band 0, and the
    // three unscoreable modes never produce one at all.
    band: typeof record.overall_band === "number" ? record.overall_band : null,
    statusLabel: status.label,
    statusTone: status.tone,
    href,
    unopenableReason,
    searchText: [
      record.opening_line,
      sitting?.part2_topic,
      sitting?.card_set_title ?? record.card_set_title,
      sitting?.difficulty,
      typeof record.overall_band === "number" ? `band ${record.overall_band}` : null,
      hasTranscript ? "transcript" : null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/** The four coaching drills, named as the coach names them. */
const DRILL_KIND_LABEL: Record<string, string> = {
  shadowing: "Shadowing",
  minimal_pair: "Minimal pairs",
  error_repair: "Error repair",
  extend: "Extending an answer",
};

/**
 * One coaching drill from the topic coach.
 *
 * `coach` rather than `drill`: the live Topic Drill mode is a spoken session with the
 * examiner and already owns that kind. These are the two-minute exercises inside the
 * teaching layer, and mixing the two would make the filter chip mean two things.
 *
 * They never open. There is no screen that replays a past drill attempt — the coach
 * grades one, shows the feedback, and moves on — so the row says that outright rather
 * than pretending to be a link.
 */
export function drillRow(
  attempt: DrillAttempt,
  cardTitles: Record<string, string> = {},
): HistoryRow {
  const kindLabel = DRILL_KIND_LABEL[attempt.kind] ?? "Coaching drill";
  const card = attempt.card_id ? cardTitles[attempt.card_id] : undefined;

  const status =
    attempt.passed === true
      ? { label: "Passed", tone: "success" as const }
      : attempt.passed === false
        ? { label: "Not passed", tone: "warning" as const }
        : { label: "Attempted", tone: "default" as const };

  return {
    id: attempt.id,
    kind: "coach",
    title: card ? `${card} · ${kindLabel}` : kindLabel,
    startedAt: attempt.at,
    durationS: attempt.duration_s,
    // A drill's 0–100 score is a hit rate on one exercise. Presenting it as a band, or
    // as "80 of 100" alongside a listening paper's raw score, would put it on the same
    // footing as a marked test. It belongs in the search text and nowhere else.
    band: null,
    statusLabel: status.label,
    statusTone: status.tone,
    href: null,
    unopenableReason: "coaching drills aren't kept as a report",
    searchText: [
      attempt.headline,
      card,
      kindLabel,
      typeof attempt.score === "number" ? `score ${attempt.score}` : null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/**
 * Every recorded thing this room has, as one list.
 *
 * A mock sitting writes rows in both tables, so the two lists are merged on the session
 * id rather than concatenated — otherwise every mock would appear twice, once with a
 * band and once without.
 */
export function toHistoryRows(
  sessions: SessionRecord[],
  mocks: MockSitting[] = [],
  drills: DrillAttempt[] = [],
  cardTitles: Record<string, string> = {},
): HistoryRow[] {
  const sittings = new Map<string, MockSitting>();
  for (const sitting of mocks) {
    if (sitting?.session_id) sittings.set(sitting.session_id, sitting);
  }

  const seen = new Set<string>();
  const rows: HistoryRow[] = [];
  for (const record of sessions) {
    if (!record?.id || seen.has(record.id)) continue;
    seen.add(record.id);
    rows.push(toHistoryRow(record, sittings.get(record.id)));
  }

  // A sitting with no session row should not exist, but if the envelope was ever lost
  // the sitting is still a thing the learner did, and dropping it silently would be the
  // same bug this screen was built to fix.
  for (const sitting of mocks) {
    if (!sitting?.session_id || seen.has(sitting.session_id)) continue;
    seen.add(sitting.session_id);
    rows.push(
      toHistoryRow(
        {
          id: sitting.session_id,
          mode: "mock",
          activity: "full_mock",
          part: null,
          card_set_id: sitting.card_set_id,
          card_set_title: sitting.card_set_title,
          state: "",
          status: sitting.status === "in_progress" ? "active" : "complete",
          overall_band: sitting.overall_band,
          started_at: sitting.started_at,
          ended_at: sitting.ended_at,
          duration_s: sitting.duration_s,
        },
        sitting,
      ),
    );
  }

  for (const attempt of drills) {
    if (!attempt?.id || seen.has(attempt.id)) continue;
    seen.add(attempt.id);
    rows.push(drillRow(attempt, cardTitles));
  }

  return rows;
}
