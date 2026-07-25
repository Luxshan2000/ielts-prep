/**
 * Wire types for the progress screen (10 §6/§7/§10, 18 §4.13).
 * Mirrors `sidecar/bandready/server/routes/progress.py`.
 */

export type SkillKey = "listening" | "reading" | "writing" | "speaking";

export const SKILL_KEYS: readonly SkillKey[] = [
  "listening",
  "reading",
  "writing",
  "speaking",
] as const;

export const PRODUCTIVE_SKILLS: readonly SkillKey[] = ["writing", "speaking"] as const;

export const SKILL_LABELS: Record<SkillKey | "overall", string> = {
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
  overall: "Overall",
};

/** Full criterion names — the dataviz rules forbid bare initialisms on an axis. */
export const CRITERION_LABELS: Record<string, string> = {
  TA: "Task Achievement",
  TR: "Task Response",
  CC: "Coherence and Cohesion",
  LR: "Lexical Resource",
  GRA: "Grammatical Range and Accuracy",
  FC: "Fluency and Coherence",
  P: "Pronunciation",
};

export const QTYPE_LABELS: Record<string, string> = {
  true_false_notgiven: "True / False / Not Given",
  yes_no_notgiven: "Yes / No / Not Given",
  multiple_choice: "Multiple choice",
  matching_headings: "Matching headings",
  matching_information: "Matching information",
  matching_features: "Matching features",
  sentence_completion: "Sentence completion",
  summary_completion: "Summary completion",
  note_completion: "Note completion",
  table_completion: "Table completion",
  form_completion: "Form completion",
  flow_chart_completion: "Flow-chart completion",
  diagram_labelling: "Diagram labelling",
  map_labelling: "Map labelling",
  short_answer: "Short answer",
  short_answer_questions: "Short-answer questions",
  multiple_answer: "Multiple answer",
};

export type Confidence = "insufficient" | "low" | "medium" | "high";

export interface SkillEstimate {
  skill: string;
  band: number | null;
  range_low: number;
  range_high: number;
  confidence: Confidence;
  n_eff: number;
  attempts_used: number;
  newest_attempt_at: string | null;
  criteria: Record<string, number> | null;
  method: string;
  stale: boolean;
  display: string;
}

export interface TrajectoryPoint {
  week: string;
  at: string;
  /** `null` for an "insufficient" week — renders as a gap, never interpolated. */
  band: number | null;
  range_low: number | null;
  range_high: number | null;
  confidence: Confidence;
  model_id: string | null;
}

export interface TrajectoryDoc {
  skill: SkillKey | "overall";
  weeks: number;
  target_band: number;
  disclaimer: string;
  points: TrajectoryPoint[];
}

export interface CriteriaRadarDoc {
  skill: SkillKey;
  kind: "criteria_radar";
  criteria: Record<string, number>;
  band: SkillEstimate | null;
  disclaimer: string;
}

export interface QtypeAccuracyItem {
  qtype: string;
  attempted: number;
  correct: number;
  accuracy: number;
}

export interface QtypeAccuracyDoc {
  skill: SkillKey;
  kind: "question_type_accuracy";
  items: QtypeAccuracyItem[];
  band: SkillEstimate | null;
}

export type CriteriaDoc = CriteriaRadarDoc | QtypeAccuracyDoc;

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

export interface ReadinessItem {
  id: string;
  kind: "auto" | "manual";
  label: string;
  checked: boolean;
  checked_at?: string | null;
}

export interface ReadinessDoc {
  unlocked: boolean;
  exam_date: string | null;
  days_out: number | null;
  verdict: "ready" | "nearly" | "keep_building";
  auto_done: number;
  auto_total: number;
  items: ReadinessItem[];
  disclaimer: string;
  reality_check: boolean;
}

export interface SummaryDoc {
  profile: {
    target_band: number;
    exam_date: string | null;
    exam_in_days: number | null;
    exam_format: string;
    daily_minutes: number;
    study_days: string[];
  };
  disclaimer: string;
  tooltip: string;
  estimates: Partial<Record<SkillKey | "overall", SkillEstimate>>;
  stale_skills: string[];
  needs_placement: boolean;
  plan_id: string | null;
}

// ------------------------------------------------------------- mock history ---

/**
 * One mock sitting, assembled client-side. The sidecar has no single
 * "mock history" route, so the table is stitched from the per-module attempt
 * lists that do exist (`GET /listening/attempts`, `GET /writing/attempts`,
 * `GET /speaking/sessions`), grouped by calendar day.
 */
export interface MockSitting {
  date: string;
  bands: Partial<Record<SkillKey, number>>;
  detail: Partial<Record<SkillKey, string>>;
}

export interface ListeningAttemptRow {
  attempt_id: string;
  test_id: string | null;
  script_id: string | null;
  mode: string;
  status: string;
  raw_score: number | null;
  total_questions: number | null;
  band: number | null;
  duration_s: number | null;
  submitted_at: string | null;
}

export interface WritingAttemptRow {
  attempt_id?: string;
  id?: string;
  mode?: string | null;
  status?: string | null;
  band?: number | null;
  overall_band?: number | null;
  word_count?: number | null;
  submitted_at?: string | null;
  started_at?: string | null;
  prompt?: { task_type?: string | null } | null;
}

export interface SpeakingSessionRow {
  id: string;
  mode: string;
  activity: string | null;
  part: number | null;
  status: string | null;
  overall_band: number | null;
  started_at: string | null;
  ended_at: string | null;
}
