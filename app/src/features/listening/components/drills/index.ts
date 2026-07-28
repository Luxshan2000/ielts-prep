/**
 * The listening drill surface.
 *
 * `ListeningDrills` is the whole thing in one component — launcher, runner, report — and is
 * what a screen should mount. The pieces are exported for tests and for anywhere that wants
 * one of them on its own: a review screen, for instance, can drop a `<ListeningDrills
 * scriptId={…} />` straight under the results to send the learner from a miss into practice
 * on the same recording, and `ClipPlayer` is reusable for any "play these three seconds"
 * button elsewhere in the module.
 *
 * This folder does **not** replace `../AccentDrill.tsx`. That component re-voices a whole
 * script in another accent and compares the two, which is ear training rather than item
 * practice, and its route stays exactly as it is.
 */

export { ListeningDrills, type ListeningDrillsProps } from "./ListeningDrills";
export { DrillLauncher } from "./DrillLauncher";
export { DrillRunner } from "./DrillRunner";
export { DrillReportView } from "./DrillReport";
export { RevealCard } from "./RevealCard";
export { ClipPlayer, type ClipPlayerHandle, type ClipPlayerProps } from "./ClipPlayer";
export { DictationItem, DictationDiff } from "./DictationItem";
export { NumbersItem } from "./NumbersItem";
export { SignpostItem } from "./SignpostItem";
export { PredictionItem } from "./PredictionItem";
export {
  BUCKET_SHORT,
  BUCKET_TONE,
  KIND_LABEL,
  MODE_LABEL,
  TONE_CLASS,
  VERDICT_LABEL,
  clockMs,
  formatMs,
  modeLabel,
  type DiffTone,
} from "./labels";
export {
  MockInProgressError,
  NeedsAudioError,
  NoContentError,
  buildSet,
  checkSynonyms,
  fetchCatalogue,
  fetchKinds,
  fetchProfile,
  gradeSet,
  type RunnerParams,
} from "./api";
export type {
  BucketInfo,
  BucketProfile,
  Catalogue,
  CatalogueScript,
  Clip,
  DiffEntry,
  DrillItem,
  DrillKind,
  DrillKindInfo,
  DrillMode,
  DrillReport,
  DrillResponse,
  DrillSet,
  DrillSummary,
  ItemResult,
  KindsDoc,
  Marking,
  Reveal,
  ScriptRef,
  SynonymCheck,
} from "./types";
