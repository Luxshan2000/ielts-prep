/** The writing coach: the teaching layer over one prompt. */

export { WritingCoach } from "./WritingCoach";
export { CoachPicker } from "./CoachPicker";
export { AttemptGate, GATE_REASON, ModelAnswerViewer, NoticeGate } from "./ModelAnswers";
export { CompareWithModel } from "./CompareWithModel";
export { LanguageBankPanel } from "./LanguageBank";
export { OverviewCoach } from "./OverviewCoach";
export { PlanPanel } from "./PlanPanel";
export { SentenceLadder } from "./SentenceLadder";
export { TaskBrief } from "./TaskBrief";
export { useCoachStore, isAttempted, type AttemptStanding, type PromptSlot } from "./store";
export { hasTeaching } from "./types";
export type { WritingTeaching } from "./types";
