/**
 * Wire types for the dashboard (10-curriculum-progress.md §5/§7, 18 §4.13).
 *
 * Mirrors what `sidecar/bandready/server/routes/progress.py` actually returns.
 * Everything the sidecar can omit is optional here so a half-populated profile
 * renders instead of crashing.
 */

export type SkillKey = "listening" | "reading" | "writing" | "speaking";

export const SKILL_KEYS: readonly SkillKey[] = [
  "listening",
  "reading",
  "writing",
  "speaking",
] as const;

export const SKILL_LABELS: Record<SkillKey | "overall", string> = {
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
  overall: "Overall",
};

export const CRITERION_LABELS: Record<string, string> = {
  TA: "Task Achievement",
  TR: "Task Response",
  CC: "Coherence and Cohesion",
  LR: "Lexical Resource",
  GRA: "Grammatical Range and Accuracy",
  FC: "Fluency and Coherence",
  P: "Pronunciation",
};

export type Confidence = "insufficient" | "low" | "medium" | "high";

/** One row of the `current_band_estimates` view (10 §6.2). */
export interface SkillEstimate {
  skill: string;
  /** `null` while confidence is "insufficient" — never invent a number. */
  band: number | null;
  band_raw?: number | null;
  estimate_raw?: number | null;
  range_low: number;
  range_high: number;
  confidence: Confidence;
  n_eff: number;
  attempts_used: number;
  newest_attempt_at: string | null;
  criteria: Record<string, number> | null;
  method: string;
  stale: boolean;
  /** Server-rendered "6.5 (likely 6.0–7.0)" — 10 §6.4 forbids a band without it. */
  display: string;
}

export type BlockKind = "warmup_srs" | "main" | "micro_drill";

export interface PlanBlock {
  kind: BlockKind;
  minutes: number;
  module?: string | null;
  activity?: string | null;
  params?: Record<string, unknown> | null;
}

export type PlanSessionStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "partial"
  | "skipped";

export interface PlanSession {
  session_id: string;
  date: string;
  phase: "build" | "taper";
  duration_min: number;
  blocks: PlanBlock[];
  status: PlanSessionStatus;
  minutes_logged: number;
  current_block: number | null;
}

/** An adaptive-rule firing (10 §8) — evidence AND action, so changes are auditable. */
export interface Callout {
  id: string;
  rule_id: string;
  description: string;
  fired_at: string;
  evidence: Record<string, unknown> | null;
  action: Record<string, unknown> | null;
  dismissed_at: string | null;
}

export interface StreakDoc {
  current: number;
  longest: number;
  repaired_dates: string[];
  total_minutes_400d: number;
  today_minutes: number;
  today_goal_met: boolean;
  daily_goal_min: number;
  next_milestone: number | null;
}

export interface HeatmapCell {
  date: string;
  minutes: number;
  level: 0 | 1 | 2 | 3;
  goal_met: boolean;
  is_rest_day: boolean;
  future: boolean;
}

export interface HeatmapDoc {
  weeks: number;
  start: string;
  end: string;
  daily_goal_min: number;
  cells: HeatmapCell[];
}

export interface VocabTile {
  cards: number;
  due_today: number;
  reviews_7d: number;
  retention_7d: number | null;
}

/**
 * The one number the dashboard borrows from `GET /vocab/stats`.
 *
 * `progress/summary` counts every card whose due date has passed and ignores the
 * daily new-card cap the review room actually applies — 151 against the room's
 * 20 on a fresh install. The tile links straight into that room, so it has to
 * promise the number the room will hand back.
 */
export interface VocabStats {
  due_today: number;
}

export interface ProfileDoc {
  target_band: number;
  exam_date: string | null;
  exam_in_days: number | null;
  exam_format: "academic" | "general_training" | string;
  daily_minutes: number;
  study_days: string[];
}

export interface WeakCriterion {
  skill: string;
  criterion: string;
  band: number;
}

export interface ProgressSummary {
  profile: ProfileDoc;
  disclaimer: string;
  tooltip: string;
  estimates: Partial<Record<SkillKey | "overall", SkillEstimate>>;
  weakest_criteria: WeakCriterion[];
  callouts: Callout[];
  streak: StreakDoc;
  heatmap: HeatmapDoc;
  vocab: VocabTile;
  today: PlanSession | null;
  plan_id: string | null;
  milestones_earned: string[];
  stale_skills: string[];
  needs_placement: boolean;
}

export interface PlanDoc {
  plan_id: string;
  generated_at: string;
  horizon_weeks: number;
  goal_band: number;
  exam_date: string | null;
  weights_by_week: Record<string, number | string>[];
  rationale: Record<string, unknown>;
  sessions: PlanSession[];
}

export interface PlanResponse {
  plan: PlanDoc | null;
  today: PlanSession | null;
  next: PlanSession | null;
  empty_reason?: string;
  hint?: string;
  profile?: Partial<ProfileDoc>;
}

/** `POST /plan/sessions/{id}/complete` — the wrap-up payload (10 §5). */
export interface SessionMarkResult {
  session_id: string;
  plan_id: string;
  date: string;
  status: PlanSessionStatus;
  minutes_logged: number;
  streak?: StreakDoc;
  milestones_earned?: string[];
}
