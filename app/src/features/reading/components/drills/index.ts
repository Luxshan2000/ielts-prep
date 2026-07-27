/**
 * The reading drill surface.
 *
 * `DrillPractice` is the whole thing in one component — launcher, runner, report — and is
 * what a screen should mount. The pieces are exported for tests and for anywhere that
 * wants one of them on its own (the review screen, for instance, can render a
 * `SolutionCard` from an attempt's own reveal without starting a drill).
 *
 * This folder deliberately does **not** replace `../DrillPane.tsx`. That component is the
 * question-type drill *inside a scored attempt* (`ReadingPlayer` mounts it when
 * `attempt.mode === "drill"`), it works, and its route stays exactly as it is. What lives
 * here is the standalone practice surface that attempt cannot express: selection by trap
 * rather than by type, items generated from the teaching payload, and a reveal that opens
 * per item instead of after a submit.
 */

export { DrillPractice, type DrillPracticeProps } from "./DrillPractice";
export { DrillLauncher } from "./DrillLauncher";
export { DrillRunner } from "./DrillRunner";
export { DrillReportView } from "./DrillReport";
export { SolutionCard, VerdictBoundary } from "./SolutionCard";
export { SelfDiagnose, DiagnosisChip } from "./SelfDiagnose";
export { JudgementItem, type JudgementAnswer } from "./JudgementItem";
export { ParaphraseItem, type ParaphraseAnswer } from "./ParaphraseItem";
export { SkimWindow } from "./SkimWindow";
export { ExplainBackBox } from "./ExplainBackBox";
export {
  FAMILY_LABEL,
  FAMILY_ORDER,
  FORM_TRAP_LABEL,
  SOLUTION_ORDER,
  TWO_STAGE_VERDICT,
  familyTone,
  headlineFor,
  humanise,
  isFormTrap,
  verdictTone,
} from "./labels";
export {
  MockInProgressError,
  NoContentError,
  buildSet,
  explainBack,
  fetchCatalogue,
  fetchKinds,
  fetchTraps,
  gradeSet,
  type RunnerParams,
} from "./api";
export type {
  Catalogue,
  DrillItem,
  DrillKind,
  DrillKindInfo,
  DrillReport,
  DrillResponse,
  DrillSet,
  ExplainBack,
  ItemResult,
  Reveal,
  TrapCatalogue,
  TrapCount,
  TrapInfo,
  TrapLoss,
  VerdictContrast,
} from "./types";
