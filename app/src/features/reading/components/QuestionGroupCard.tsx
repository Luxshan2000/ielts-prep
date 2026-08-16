import { Fragment, type ReactNode } from "react";
import { Flag } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  BANK_TYPES,
  CHOICE_TYPES,
  LAYOUT_TYPES,
  LETTER_TYPES,
  MULTI_TYPES,
  TEXT_TYPES,
  choiceValues,
  hasGap,
  layoutGapNumbers,
  qtypeLabel,
  selectCount,
  splitGaps,
} from "../qtypes";
import {
  chosenLetters,
  distributeLetters,
  groupRangeLabel,
  questionDomId,
  usedLetters,
} from "../model";
import type { Question, QuestionGroup, QuestionOption } from "../types";
import { AnswerInput } from "./AnswerInput";
import { LayoutRenderer } from "./LayoutRenderer";
import {
  CheckboxChoices,
  ChoiceGlossary,
  LetterSelect,
  OptionBank,
  RadioChoices,
  SegmentedChoices,
} from "./Options";

export interface QuestionGroupCardProps {
  group: QuestionGroup;
  answers: Record<string, string>;
  flags: number[];
  current: number | null;
  onAnswer: (key: string, value: string) => void;
  onAnswers: (patch: Record<string, string>) => void;
  onToggleFlag: (number: number) => void;
  onFocusQuestion: (number: number) => void;
  disabled?: boolean;
}

function FlagButton({
  number,
  flagged,
  onToggle,
  disabled,
}: {
  number: number;
  flagged: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={flagged}
      aria-label={`${flagged ? "Unflag" : "Flag"} question ${number} for review`}
      title="Flag for review (Ctrl+Shift+F)"
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        flagged
          ? "bg-warning/15 text-warning"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Flag className={cn("h-3.5 w-3.5", flagged && "fill-current")} aria-hidden="true" />
    </button>
  );
}

/** One numbered question: marker, flag, prompt and its type-specific control. */
function QuestionRow({
  number,
  flagged,
  current,
  onToggleFlag,
  header,
  children,
  disabled,
}: {
  number: number;
  flagged: boolean;
  current: boolean;
  onToggleFlag: () => void;
  header: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      id={questionDomId(number)}
      data-question={number}
      className={cn(
        "scroll-mt-4 rounded-lg border px-3 py-2.5 transition-colors",
        current ? "border-primary/60 bg-primary/[0.04]" : "border-transparent",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 w-6 shrink-0 text-[13px] font-semibold tabular text-muted-foreground">
          {number}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="text-[13px] leading-relaxed text-foreground">{header}</div>
          {children}
        </div>
        <FlagButton
          number={number}
          flagged={flagged}
          onToggle={onToggleFlag}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function optionsFor(question: Question, group: QuestionGroup): QuestionOption[] {
  const own = question.options ?? null;
  if (own && own.length > 0) return own;
  return group.options ?? [];
}

/**
 * Renders one `question_groups[]` entry with the right input affordance for its
 * type — all fourteen 06 §2 families, including the layout-driven completions
 * and the letter banks. Unknown types fall back to a free-text box rather than
 * silently dropping the questions.
 */
export function QuestionGroupCard({
  group,
  answers,
  flags,
  current,
  onAnswer,
  onAnswers,
  onToggleFlag,
  onFocusQuestion,
  disabled,
}: QuestionGroupCardProps) {
  const questions = group.questions ?? [];
  if (questions.length === 0) return null;

  const type = group.type;
  const allowReuse = Boolean(group.allow_reuse);
  const flagged = new Set(flags);
  const bankOptions = group.options ?? [];
  const used = usedLetters(group, answers);
  const numbers = questions.map((q) => Number(q.number) || 0);
  const skeleton = group.summary ?? group.summary_text ?? null;
  const isLetterGap = type === "summary_completion_bank";

  const gapControl = (n: number, question: Question | undefined) => {
    const key = String(n);
    const label = `Question ${n}${question?.prompt ? `: ${question.prompt}` : ""}`;
    if (isLetterGap && bankOptions.length > 0) {
      return (
        <span className="mx-1 inline-flex items-baseline gap-1 align-middle">
          <span className="text-[11px] font-semibold tabular text-muted-foreground">{n}</span>
          <LetterSelect
            ariaLabel={label}
            className="w-24"
            options={bankOptions}
            value={answers[key] ?? ""}
            disabled={disabled}
            disabledKeys={allowReuse ? undefined : used}
            onChange={(value) => {
              onFocusQuestion(n);
              onAnswer(key, value);
            }}
          />
        </span>
      );
    }
    return (
      <span className="mx-1 inline-flex items-baseline gap-1 align-middle">
        <span className="text-[11px] font-semibold tabular text-muted-foreground">{n}</span>
        <AnswerInput
          inline
          ariaLabel={label}
          value={answers[key] ?? ""}
          wordLimit={group.word_limit}
          disabled={disabled}
          onFocus={() => onFocusQuestion(n)}
          onChange={(value) => onAnswer(key, value)}
        />
      </span>
    );
  };

  // ------------------------------------------------------------------ body ---

  let body: ReactNode = null;

  if (MULTI_TYPES.has(type) && bankOptions.length > 0) {
    // "Choose TWO letters": ONE checkbox set whose letters are spread across the
    // group's answer slots — the sidecar unions them back when marking.
    const max = selectCount(group);
    const selected = chosenLetters(group, answers);
    body = (
      <div className="space-y-2">
        <CheckboxChoices
          ariaLabel={`${groupRangeLabel(group)}: choose ${max}`}
          options={bankOptions}
          selected={selected}
          max={max}
          disabled={disabled}
          onFocus={() => onFocusQuestion(numbers[0] ?? 0)}
          onToggle={(letter) => {
            const key = letter.toUpperCase();
            const next = selected.includes(key)
              ? selected.filter((l) => l !== key)
              : selected.length >= max
                ? selected
                : [...selected, key];
            onAnswers(distributeLetters(group, next));
          }}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {numbers.map((n) => (
            <span key={n} className="inline-flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground tabular">Q{n}</span>
              <FlagButton
                number={n}
                flagged={flagged.has(n)}
                onToggle={() => onToggleFlag(n)}
                disabled={disabled}
              />
            </span>
          ))}
        </div>
      </div>
    );
  } else if (LAYOUT_TYPES.has(type) || (group.layout && TEXT_TYPES.has(type)) || (skeleton && TEXT_TYPES.has(type)) || (skeleton && isLetterGap)) {
    // Note / table / flow-chart / form / diagram / summary skeletons.
    const gapNumbers = layoutGapNumbers(group.layout, skeleton, numbers);
    const covered = new Set(gapNumbers);
    const leftover = questions.filter((q) => !covered.has(Number(q.number)));
    const byNumber = new Map(questions.map((q) => [Number(q.number), q]));
    body = (
      <div className="space-y-3">
        <LayoutRenderer
          layout={group.layout}
          fallbackText={skeleton}
          renderGap={(explicit, ordinal) => {
            const n = explicit ?? gapNumbers[ordinal] ?? numbers[ordinal] ?? 0;
            if (!n) return <span className="text-muted-foreground">____</span>;
            return gapControl(n, byNumber.get(n));
          }}
        >
          <p className="text-[13px] text-muted-foreground">
            This group ships no layout skeleton. Answer each numbered gap below.
          </p>
        </LayoutRenderer>
        {leftover.length > 0 && (
          <div className="space-y-1">
            {leftover.map((question) => {
              const n = Number(question.number);
              return (
                <QuestionRow
                  key={n}
                  number={n}
                  flagged={flagged.has(n)}
                  current={current === n}
                  onToggleFlag={() => onToggleFlag(n)}
                  disabled={disabled}
                  header={question.prompt}
                >
                  <AnswerInput
                    ariaLabel={`Question ${n}: ${question.prompt}`}
                    value={answers[String(n)] ?? ""}
                    wordLimit={group.word_limit}
                    disabled={disabled}
                    onFocus={() => onFocusQuestion(n)}
                    onChange={(value) => onAnswer(String(n), value)}
                  />
                </QuestionRow>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {numbers.map((n) => (
            <span key={n} className="inline-flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground tabular">Q{n}</span>
              <FlagButton
                number={n}
                flagged={flagged.has(n)}
                onToggle={() => onToggleFlag(n)}
                disabled={disabled}
              />
            </span>
          ))}
        </div>
      </div>
    );
  } else {
    body = (
      <div className="space-y-1">
        {questions.map((question) => {
          const n = Number(question.number) || 0;
          const key = String(n);
          const value = answers[key] ?? "";
          const label = `Question ${n}: ${question.prompt}`;
          const prompt = question.prompt ?? "";
          const inlineGap = TEXT_TYPES.has(type) && hasGap(prompt);

          let control: ReactNode = null;
          let header: ReactNode = prompt;

          if (CHOICE_TYPES.has(type)) {
            control = (
              <SegmentedChoices
                name={`${group.id}-${n}`}
                ariaLabel={label}
                values={choiceValues(type)}
                value={value}
                disabled={disabled}
                onFocus={() => onFocusQuestion(n)}
                onChange={(next) => onAnswer(key, next === value ? "" : next)}
              />
            );
          } else if (type === "multiple_choice") {
            const options = optionsFor(question, group);
            control =
              options.length > 0 ? (
                <RadioChoices
                  name={`${group.id}-${n}`}
                  ariaLabel={label}
                  options={options}
                  value={value}
                  disabled={disabled}
                  onFocus={() => onFocusQuestion(n)}
                  onChange={(next) => onAnswer(key, next)}
                />
              ) : (
                <AnswerInput
                  ariaLabel={label}
                  value={value}
                  disabled={disabled}
                  placeholder="A"
                  onFocus={() => onFocusQuestion(n)}
                  onChange={(next) => onAnswer(key, next)}
                />
              );
          } else if (LETTER_TYPES.has(type)) {
            control =
              bankOptions.length > 0 ? (
                <LetterSelect
                  ariaLabel={label}
                  options={bankOptions}
                  value={value}
                  disabled={disabled}
                  disabledKeys={allowReuse ? undefined : used}
                  onChange={(next) => {
                    onFocusQuestion(n);
                    onAnswer(key, next);
                  }}
                />
              ) : (
                <AnswerInput
                  ariaLabel={label}
                  value={value}
                  disabled={disabled}
                  onFocus={() => onFocusQuestion(n)}
                  onChange={(next) => onAnswer(key, next)}
                />
              );
          } else if (inlineGap) {
            header = (
              <span>
                {splitGaps(prompt).map((token, index) =>
                  token.kind === "text" ? (
                    <Fragment key={index}>{token.value}</Fragment>
                  ) : (
                    <AnswerInput
                      key={index}
                      inline
                      ariaLabel={label}
                      value={value}
                      wordLimit={group.word_limit}
                      disabled={disabled}
                      onFocus={() => onFocusQuestion(n)}
                      onChange={(next) => onAnswer(key, next)}
                    />
                  ),
                )}
              </span>
            );
          } else {
            control = (
              <AnswerInput
                ariaLabel={label}
                value={value}
                wordLimit={group.word_limit}
                disabled={disabled}
                onFocus={() => onFocusQuestion(n)}
                onChange={(next) => onAnswer(key, next)}
              />
            );
          }

          return (
            <QuestionRow
              key={n}
              number={n}
              flagged={flagged.has(n)}
              current={current === n}
              onToggleFlag={() => onToggleFlag(n)}
              disabled={disabled}
              header={header}
            >
              {control}
            </QuestionRow>
          );
        })}
      </div>
    );
  }

  const showBank = BANK_TYPES.has(type) && bankOptions.length > 0 && !MULTI_TYPES.has(type);
  const instructions = group.instructions?.trim();

  return (
    <section
      aria-label={`${groupRangeLabel(group)}: ${qtypeLabel(type)}`}
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{groupRangeLabel(group)}</h3>
          <Badge tone="outline">{qtypeLabel(type)}</Badge>
        </div>
        {instructions && (
          <p className="text-[13px] font-medium text-foreground">{instructions}</p>
        )}
        {group.instructions_extra && (
          <p className="text-[13px] italic text-muted-foreground">{group.instructions_extra}</p>
        )}
        {group.heading && <p className="text-[13px] font-semibold">{group.heading}</p>}
      </header>

      {/* The three buttons say TRUE / FALSE / NOT GIVEN and nothing in the pack says
          what they mean. The real paper prints this rubric; so do we. */}
      <ChoiceGlossary qtype={type} />

      {showBank && (
        <OptionBank
          options={bankOptions}
          used={used}
          allowReuse={allowReuse}
          title={type === "matching_headings" ? "List of headings" : "Options"}
        />
      )}

      {body}
    </section>
  );
}
