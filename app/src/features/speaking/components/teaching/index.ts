/**
 * The teaching layer of the Speaking module.
 *
 * Everything here reads the `schema_version: 2` teaching payload described in
 * `content/core-en/staging/DESIGN.md` and degrades cleanly when it is absent — the
 * pack still ships twelve legacy sets that carry none of it.
 */

export { TopicCoach } from "./TopicCoach";
export { CoachPicker } from "./CoachPicker";

export { CardBrief, type CardBriefProps } from "./CardBrief";
export { PrepCoach, type PrepCoachProps } from "./PrepCoach";
export {
  ModelAnswerViewer,
  AttemptGate,
  type ModelAnswerViewerProps,
  type AttemptGateProps,
} from "./ModelAnswers";
export {
  CompareWithModel,
  type CompareWithModelProps,
  type CriterionGap,
} from "./CompareWithModel";
export { LanguageBankPanel, type LanguageBankPanelProps } from "./LanguageBank";
export { TopicVocabulary, type TopicVocabularyProps } from "./TopicVocabulary";
export {
  AnnotatedModel,
  sameSelection,
  type AnnotatedModelProps,
  type MarkSelection,
} from "./AnnotatedModel";

export { AddToBank, Callout, Disclosure } from "./primitives";
export { useTeachingStore, attemptedSetIds, type PackSlot, type PackStatus } from "./store";
export {
  fetchTeachingPack,
  sendToVocabInbox,
  TeachingUnavailableError,
  type BankItem,
} from "./api";
export { useRehearsal, PREP_SECONDS, TURN_SECONDS, type RehearsalPhase } from "./useRehearsal";
export * from "./types";
