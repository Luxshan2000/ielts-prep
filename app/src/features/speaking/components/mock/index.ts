/**
 * The mock exam: a whole IELTS-style speaking sitting, from the commitment screen to
 * the report that sends the candidate back into the Topic Coach.
 *
 * Four screens, wired in `../../route.tsx`:
 *   /speaking/mock                      MockPreflight
 *   /speaking/mock/sitting/:sessionId   MockSitting
 *   /speaking/mock/report/:reportId     MockReport
 *   /speaking/mock/history              MockHistoryPage
 */

export { MockPreflight } from "./MockPreflight";
export { MockSitting } from "./MockSitting";
export { MockReport } from "./MockReport";
export { MockHistory, MockHistoryPage } from "./MockHistory";
export { useMockStore, isMockRecord } from "./store";
export {
  analyseSitting,
  nextActions,
  separable,
  deliverySignal,
  evidenceSignal,
  partOfTurn,
  PART_LABELS,
  type SittingAnalysis,
  type PartSummary,
  type PartQuote,
  type PartNumber,
  type NextAction,
} from "./analysis";
export { fetchSetOutline, type SetOutline, type SetCard } from "./api";
