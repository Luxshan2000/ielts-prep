/**
 * Plan-block → feature-route mapping (10 §5).
 *
 * Which feature screens actually exist is discovered the same way `App.tsx`
 * discovers routes — a lazy `import.meta.glob` over `features/<name>/route.tsx`,
 * which reads the module *keys* without executing anything. That lets the
 * dashboard render an honest "not available in this build yet" state instead of
 * shipping a Start button that lands on the 404 screen.
 */

import type { PlanBlock, PlanSession } from "./types";

const routeModules = import.meta.glob("../*/route.tsx");

const AVAILABLE_FEATURES: ReadonlySet<string> = new Set(
  Object.keys(routeModules)
    .map((file) => file.split("/")[1])
    .filter((name): name is string => Boolean(name)),
);

/** True when `features/<name>/route.tsx` exists in this build. */
export function featureAvailable(name: string): boolean {
  return AVAILABLE_FEATURES.has(name);
}

/**
 * Where each module is practised. `feature` is the directory under `features/`,
 * which is not always the last segment of the path — the pronunciation room is
 * `/pronunciation` but lives in `features/pron/`, so deriving one from the other
 * would report a shipped screen as missing.
 */
const MODULE_ROUTES: Record<string, { path: string; feature: string }> = {
  vocab: { path: "/vocab", feature: "vocab" },
  writing: { path: "/writing", feature: "writing" },
  speaking: { path: "/speaking", feature: "speaking" },
  reading: { path: "/reading", feature: "reading" },
  listening: { path: "/listening", feature: "listening" },
  grammar: { path: "/grammar", feature: "grammar" },
  pron: { path: "/pronunciation", feature: "pron" },
  progress: { path: "/progress", feature: "progress" },
};

/**
 * Activities whose room is not their module's room.
 *
 * The planner files minimal pairs under `speaking` because that is the skill
 * they serve, but the drill itself is in the pronunciation room — routing on the
 * module alone opens a screen with no minimal pairs in it. Mock blocks have no
 * room of their own either; they start inside a skill room.
 */
const ACTIVITY_ROUTES: Record<string, string> = {
  minimal_pairs: "pron",
  full_mock: "listening",
  mock_speaking: "speaking",
  mock_review: "writing",
  mock_error_review: "writing",
  readiness_checklist: "progress",
};

const ACTIVITY_LABELS: Record<string, string> = {
  task2_essay: "Task 2 essay",
  task1_report: "Task 1 report",
  rewrite_with_feedback: "Rewrite with feedback",
  p1_interview: "Part 1 interview",
  p2_long_turn: "Part 2 long turn",
  p3_discussion: "Part 3 discussion",
  passage_timed: "Timed passage",
  qtype_drill: "Question-type drill",
  skimming_set: "Skimming set",
  part_set: "Part set",
  part34_set: "Parts 3 and 4 set",
  dictation: "Dictation",
  section_test: "Full section test",
  review_day: "Review day",
  srs_deep_session: "Deep vocabulary session",
  vocab_recall_sprint: "Vocabulary recall sprint",
  full_mock: "Full mock test",
  mock_speaking: "Mock speaking",
  mock_review: "Mock review",
  mock_error_review: "Mock error review",
  readiness_checklist: "Readiness checklist",
  gra_complex_sentences: "Complex sentences",
  cc_cohesion_linkers: "Cohesion and linkers",
  ta_answer_the_question: "Answer the question",
  lr_paraphrase_sprint: "Paraphrase sprint",
  fc_fluency_shadowing: "Fluency shadowing",
  minimal_pairs: "Minimal pairs",
};

const MODULE_LABELS: Record<string, string> = {
  vocab: "Vocabulary",
  writing: "Writing",
  speaking: "Speaking",
  reading: "Reading",
  listening: "Listening",
  grammar: "Grammar",
  pron: "Pronunciation",
  mock: "Mock test",
};

/**
 * The planner emits a bare criterion code (`GRA`, `MINIMAL`) as a block's focus.
 * A learner has never seen those letters; the block says what it works on.
 */
const FOCUS_LABELS: Record<string, string> = {
  TA: "task achievement",
  TR: "task response",
  CC: "coherence and cohesion",
  LR: "vocabulary range and precision",
  GRA: "grammar range and accuracy",
  FC: "fluency and coherence",
  P: "speaking clearly enough to be understood",
  MINIMAL: "sounds that are easy to confuse",
};

/**
 * Milestone ids as the sidecar stores them (`streak-7`, `first-session`). The id
 * is a database key, not a sentence, and must never reach a badge as-is.
 */
const MILESTONE_LABELS: Record<string, string> = {
  "first-session": "First practice session",
  "first-confident-estimate": "First confident band estimate",
};

function humanize(value: string): string {
  const words = value.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : value;
}

export function activityLabel(activity: string | null | undefined): string {
  if (!activity) return "Practice";
  return ACTIVITY_LABELS[activity] ?? humanize(activity);
}

/** A criterion code as the phrase it stands for — never the bare letters. */
export function focusLabel(code: string): string {
  return FOCUS_LABELS[code.toUpperCase()] ?? humanize(code).toLowerCase();
}

export function moduleLabel(module: string | null | undefined): string {
  if (!module) return "Practice";
  return MODULE_LABELS[module] ?? humanize(module);
}

/** "7-day streak", "First practice session" — never the raw milestone id. */
export function milestoneLabel(id: string): string {
  const streak = /^streak-(\d+)$/.exec(id);
  if (streak) return `${streak[1]}-day streak`;
  return MILESTONE_LABELS[id] ?? humanize(id);
}

export interface BlockTarget {
  /** react-router path, or `null` when nothing in this build can run the block. */
  path: string | null;
  /** Set when `path` is null — user-facing reason, never a bare TODO. */
  unavailableReason: string | null;
}

/** Where a Start button on this block should go. */
export function blockTarget(block: PlanBlock): BlockTarget {
  const module = block.kind === "warmup_srs" ? "vocab" : (block.module ?? "");
  // The activity decides first: it knows which room actually runs the drill.
  // A mock block with an activity nobody has mapped still starts at Listening,
  // which is where every full mock begins.
  const key =
    ACTIVITY_ROUTES[block.activity ?? ""] ?? (module === "mock" ? "listening" : module);
  const route = MODULE_ROUTES[key];

  if (!route) {
    return {
      path: null,
      unavailableReason: `${moduleLabel(module)} practice has no screen in this build yet.`,
    };
  }
  if (!featureAvailable(route.feature)) {
    return {
      path: null,
      unavailableReason: `The ${moduleLabel(key)} room is not available in this build yet.`,
    };
  }
  return { path: route.path, unavailableReason: null };
}

/** "Warm-up — vocabulary review" / "Writing — Task 2 essay". */
export function blockTitle(block: PlanBlock): string {
  if (block.kind === "warmup_srs") return "Warm-up — vocabulary review";
  if (block.kind === "micro_drill") {
    return `Micro-drill — ${activityLabel(block.activity)}`;
  }
  return `${moduleLabel(block.module)} — ${activityLabel(block.activity)}`;
}

export function blockSubtitle(block: PlanBlock): string | null {
  const params = block.params ?? {};
  if (block.kind === "warmup_srs") {
    const max = params.max_cards;
    if (params.new_cards === 0) return "Review only — no new cards during the taper.";
    return typeof max === "number" ? `Up to ${max} due cards` : null;
  }
  if (params.confirm_long_session) {
    return "Runs about 2 h 35 — Listening, Reading and Writing back to back.";
  }
  if (params.timed || params.full_section) return "Timed, full exam length.";
  const focus = params.criterion_focus;
  if (typeof focus === "string" && focus) return `Works on ${focusLabel(focus)}`;
  return null;
}

/** The block the learner should resume at — `current_block`, else the first unfinished. */
export function activeBlockIndex(session: PlanSession | null): number {
  if (!session) return 0;
  if (typeof session.current_block === "number" && session.current_block >= 0) {
    return Math.min(session.current_block, Math.max(0, session.blocks.length - 1));
  }
  return 0;
}
