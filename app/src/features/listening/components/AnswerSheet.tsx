import { Badge } from "@/components/ui";
import {
  groupQuestions,
  instructionStatesLimit,
  rangeLabel,
  sharedOptionBank,
  typeLabel,
} from "../qtypes";
import type { ListeningPart } from "../types";
import { MapAsset } from "./MapAsset";
import { QuestionBlock } from "./QuestionBlock";
import { SharedBlock, isSharedBlock } from "./SharedBlock";

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
        const bank = sharedOptionBank(group.questions);
        const limitStated = instructionStatesLimit(group.instruction);

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
            {bank && <OptionBankBox entries={bank} label={rangeLabel(group.questions)} />}
            {isSharedBlock(group.questions) ? (
              // Form, note and table prompts are one block shared by the whole group. Drawn
              // per question they repeat in full once per gap; drawn once they read as the
              // form they are.
              <SharedBlock
                questions={group.questions}
                answers={answers}
                onAnswer={onAnswer}
                readOnly={readOnly}
                activeNumber={activeNumber}
                onActive={onActive}
                showLimitHint={!limitStated}
                registerRef={registerRef}
              />
            ) : (
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
                    bankShown={Boolean(bank)}
                    showLimitHint={!limitStated}
                    registerRef={(el) => registerRef?.(question.number, el)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * The lettered box a matching group shares, printed once above its questions.
 *
 * On paper this is a boxed list and the answer sheet takes a letter beside each number;
 * the questions below therefore show letter buttons only.
 */
function OptionBankBox({ entries, label }: { entries: [string, string][]; label: string }) {
  return (
    <div
      className="rounded-xl border border-border bg-card/40 p-3"
      role="group"
      aria-label={`Answer choices for ${label}`}
    >
      <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {entries.map(([letter, text]) => (
          <li key={letter} className="flex items-start gap-2 text-sm leading-relaxed">
            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-[11px] font-semibold">
              {letter}
            </span>
            <span className="min-w-0 flex-1">{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
