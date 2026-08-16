/**
 * The 60-minute writing mock: pre-flight, sitting, report.
 *
 * Past sittings are no longer listed here. They are records like any other and live with
 * the rest of them at `/writing/history`.
 */

export { MockPreflight } from "./MockPreflight";
export { MockSitting } from "./MockSitting";
export { MockReport } from "./MockReport";
export {
  MOCK_SECONDS,
  TARGET_SECONDS,
  TASK_ORDER,
  elapsedOf,
  estimatedPaperBand,
  remainingOf,
  roundHalfBand,
  task1TypeFor,
  useMockStore,
  type MockModule,
  type MockRecord,
  type MockTaskKey,
} from "./store";
export {
  HARD_FLOOR_WORDS,
  buildNextActions,
  timeVerdict,
  unmarkedReason,
  weakestCriterion,
  type NextAction,
  type UnmarkedReason,
} from "./analysis";
