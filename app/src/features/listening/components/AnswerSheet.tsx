import { Badge } from "@/components/ui";
import { groupQuestions, rangeLabel, typeLabel } from "../qtypes";
import type { ListeningPart } from "../types";
import { MapAsset } from "./MapAsset";
import { QuestionBlock } from "./QuestionBlock";

export interface AnswerSheetProps {
  part: ListeningPart;
  answers: Record<string, string>;
  onAnswer: (number: number, value: string) => void;
  /** Locked once the transcript for this part is revealed, or after submission. */
  readOnly?: boolean;
  activeNumber: number;
  onActive: (number: number) => void;
  registerRef?: (number: number, el: HTMLDivElement | null) => void;
}

/** Type-as-you-listen sheet for one part, grouped by shared instruction (07 §6). */
export function AnswerSheet({
  part,
  answers,
  onAnswer,
  readOnly = false,
  activeNumber,
  onActive,
  registerRef,
}: AnswerSheetProps) {
  const groups = groupQuestions(part.questions);

  return (
    <div className="space-y-6">
      {groups.map((group, index) => {
        const assetKey = JSON.stringify(group.questions[0]?.asset ?? null);
        const sharedAsset =
          group.questions.length > 1 &&
          assetKey !== "null" &&
          group.questions.every((q) => JSON.stringify(q.asset ?? null) === assetKey)
            ? group.questions[0].asset
            : null;

        return (
          <section key={index} className="space-y-2" aria-label={rangeLabel(group.questions)}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[13px] font-semibold">{rangeLabel(group.questions)}</h3>
              <Badge tone="outline">{typeLabel(group.type)}</Badge>
            </div>
            {group.instruction && (
              <p className="text-[13px] uppercase tracking-wide text-muted-foreground">
                {group.instruction}
              </p>
            )}
            {sharedAsset && (
              <MapAsset asset={sharedAsset} label={`Map for ${rangeLabel(group.questions)}`} />
            )}
            <div className="space-y-1">
              {group.questions.map((question) => (
                <QuestionBlock
                  key={question.id}
                  question={question}
                  value={answers[String(question.number)] ?? ""}
                  onChange={(value) => onAnswer(question.number, value)}
                  readOnly={readOnly}
                  active={activeNumber === question.number}
                  onFocus={() => onActive(question.number)}
                  showAsset={!sharedAsset}
                  registerRef={(el) => registerRef?.(question.number, el)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
