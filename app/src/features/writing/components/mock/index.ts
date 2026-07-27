/** The 60-minute writing mock: pre-flight, sitting, report, history. */

export { MockPreflight } from "./MockPreflight";
export { MockSitting } from "./MockSitting";
export { MockReport } from "./MockReport";
export { MockHistory } from "./MockHistory";
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
export { buildNextActions, timeVerdict, weakestCriterion, type NextAction } from "./analysis";
