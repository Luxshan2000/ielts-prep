/**
 * Shapes returned by `/api/v1/speaking/drills/*`.
 *
 * Kept structural rather than exhaustive: the server owns the payload and adds fields
 * over time, so anything the runner does not read stays untyped instead of turning a
 * server-side addition into a compile error.
 */

export type DrillKind = "shadowing" | "minimal_pair" | "error_repair" | "extend";

/** How the server grades a kind. The runner only branches on `choice` vs the rest. */
export type GradingMode = "choice" | "stt_alignment" | "stt_contains" | "stt_repair" | "stt_fluency";

export interface DrillKindInfo {
  kind: DrillKind;
  title: string;
  seconds: number;
  graded_by: string;
  /** True when the item quotes a model answer, so it stays behind the attempt gate. */
  gated: boolean;
  trains: string;
  blurb: string;
}

export interface DrillPrompt {
  /** shadowing */
  sentence?: string;
  chunks?: string[];
  target_words?: string[];
  /** minimal_pair */
  a?: string;
  b?: string;
  contrast?: string;
  /** error_repair */
  wrong?: string;
  hint?: string;
  pattern?: string;
  /** extend */
  stub?: string;
  [key: string]: unknown;
}

export interface DrillItem {
  item_id: string;
  kind: DrillKind;
  seconds: number;
  title: string;
  instruction: string;
  prompt: DrillPrompt;
  /** Present when the item has a spoken reference the learner should hear first. */
  audio?: { text: string; role: string } | null;
  expected?: Record<string, unknown>;
  grading: { mode: GradingMode; [key: string]: unknown };
  why?: string;
  focus?: string;
  card_id: string;
  card_set_id?: string;
  part?: number;
}

export interface DrillGate {
  unlocked: boolean;
  reason?: string;
  attempts?: number;
}

export interface CardDrills {
  card_id: string;
  card_set_id?: string;
  topic?: string;
  gate: DrillGate;
  items: DrillItem[];
  /** Ordered item ids for the two-minute set — the recommended run. */
  plan: string[];
  available_kinds: DrillKind[];
  /** Keyed by kind, valued with the reason it is not offered — `{}` when all are. */
  unavailable_kinds?: Partial<Record<DrillKind, string>>;
  set_budget_s: number;
  accent_notice?: string | null;
}

/** One row of the shadowing alignment, under `detail.alignment`. */
export interface AlignmentRow {
  index?: number;
  expected: string;
  heard?: string | null;
  /** `hit` | `missed` | `substituted`. */
  status: string;
}

export interface DrillResult {
  item_id: string;
  kind: DrillKind;
  /** 0-100 where the kind produces one; absent for pass/fail kinds. */
  score?: number | null;
  passed?: boolean | null;
  /**
   * What the recogniser (or the learner's own typing) actually produced. The route
   * calls this `you_said`; `heard` is kept because older builds sent that name and
   * showing the learner what was heard is the whole point of a spoken drill.
   */
  you_said?: string | null;
  heard?: string | null;
  /**
   * Every grader in `speaking/drills.py` returns a **list** of sentences, never one
   * string. Typing this as `string` made React glue them together with no space
   * between them ("…three words.You reached for…"), so both shapes are declared and
   * the renderer joins.
   */
  feedback?: string | string[] | null;
  detail?: { alignment?: AlignmentRow[]; [key: string]: unknown } | null;
  [key: string]: unknown;
}
