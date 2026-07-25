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

const MODULE_ROUTES: Record<string, string> = {
  vocab: "/vocab",
  writing: "/writing",
  speaking: "/speaking",
  reading: "/reading",
  listening: "/listening",
};

/** Mock blocks have no room of their own — they start inside a skill room. */
const MOCK_ACTIVITY_ROUTES: Record<string, string> = {
  full_mock: "/listening",
  mock_speaking: "/speaking",
  mock_review: "/writing",
  mock_error_review: "/writing",
  readiness_checklist: "/progress",
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
  mock: "Mock test",
};

function humanize(value: string): string {
  const words = value.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : value;
}

export function activityLabel(activity: string | null | undefined): string {
  if (!activity) return "Practice";
  return ACTIVITY_LABELS[activity] ?? humanize(activity);
}

export function moduleLabel(module: string | null | undefined): string {
  if (!module) return "Practice";
  return MODULE_LABELS[module] ?? humanize(module);
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
  const path =
    module === "mock"
      ? (MOCK_ACTIVITY_ROUTES[block.activity ?? ""] ?? "/listening")
      : MODULE_ROUTES[module];

  if (!path) {
    return {
      path: null,
      unavailableReason: `${moduleLabel(module)} practice has no screen in this build yet.`,
    };
  }
  const feature = path.replace("/", "");
  if (!featureAvailable(feature)) {
    return {
      path: null,
      unavailableReason: `The ${moduleLabel(module)} room is not available in this build yet.`,
    };
  }
  return { path, unavailableReason: null };
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
  if (typeof focus === "string" && focus) return `Focus: ${focus}`;
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
