import { useCallback, type KeyboardEvent, type ReactNode } from "react";
import { Badge, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  GAP_RE,
  countWords,
  isMarkdownTable,
  joinLetters,
  letterCount,
  optionEntries,
  parseMarkdownTable,
  splitLetters,
  stripEmphasis,
  wordLimitLabel,
} from "../qtypes";
import type { ListeningQuestion } from "../types";
import { MapAsset } from "./MapAsset";

export interface QuestionBlockProps {
  question: ListeningQuestion;
  value: string;
  onChange: (value: string) => void;
  /** Locked after the transcript for this part has been revealed, or after submit. */
  readOnly?: boolean;
  /** Highlighted as the question the learner is on. */
  active?: boolean;
  onFocus?: () => void;
  /** The group renderer draws a shared asset once; blocks opt out. */
  showAsset?: boolean;
  registerRef?: (el: HTMLDivElement | null) => void;
}

/** One numbered question, rendered for its own type (07 §5). */
export function QuestionBlock({
  question,
  value,
  onChange,
  readOnly = false,
  active = false,
  onFocus,
  showAsset = true,
  registerRef,
}: QuestionBlockProps) {
  const letters = optionEntries(question.options);
  const isLetterQuestion = letters.length > 0;

  return (
    <div
      ref={registerRef}
      id={`listening-q-${question.number}`}
      data-question={question.number}
      className={cn(
        "flex gap-3 rounded-xl border p-3 transition-colors",
        active ? "border-primary/60 bg-primary/5" : "border-transparent",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold tabular-nums",
          value.trim()
            ? "bg-primary text-primary-foreground"
            : "border border-border text-muted-foreground",
        )}
        aria-hidden="true"
      >
        {question.number}
      </span>

      <div className="min-w-0 flex-1 space-y-2">
        {showAsset && question.asset && (
          <MapAsset asset={question.asset} label={`Map for question ${question.number}`} />
        )}

        {isLetterQuestion ? (
          <LetterAnswer
            question={question}
            options={letters}
            value={value}
            onChange={onChange}
            readOnly={readOnly}
            onFocus={onFocus}
          />
        ) : (
          <TextAnswer
            question={question}
            value={value}
            onChange={onChange}
            readOnly={readOnly}
            onFocus={onFocus}
          />
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- text answers ---

interface AnswerProps {
  question: ListeningQuestion;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  onFocus?: () => void;
}

function TextAnswer({ question, value, onChange, readOnly, onFocus }: AnswerProps) {
  const limit = question.word_limit;
  const words = countWords(value);
  const over = Boolean(limit && words > limit);

  const field = (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      readOnly={readOnly}
      aria-label={`Answer for question ${question.number}`}
      aria-invalid={over || undefined}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      className={cn(
        "h-8 max-w-[18rem] font-medium",
        over && "border-warning focus-visible:ring-warning",
        readOnly && "bg-muted/60 text-muted-foreground",
      )}
    />
  );

  // Emphasis is authoring syntax, never learner-facing: an unstripped prompt shows
  // "**1**" on screen. Shared blocks are drawn by SharedBlock; what reaches here is a
  // prompt that belongs to this question alone.
  const prompt = stripEmphasis(question.prompt ?? "");
  // One input per question: the field lands in the FIRST gap only; any further
  // blanks in the same prompt stay drawn as blanks (they belong to other numbers).
  const slot: GapSlot = { used: false };

  return (
    <div className="space-y-1.5">
      {isMarkdownTable(prompt) ? (
        <TablePrompt prompt={prompt} field={field} slot={slot} />
      ) : GAP_RE.test(prompt) ? (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm leading-relaxed">
          {interleaveGap(prompt, field, slot)}
        </p>
      ) : (
        <div className="space-y-1.5">
          {prompt && <p className="text-sm leading-relaxed">{prompt}</p>}
          {field}
        </div>
      )}

      <p
        className={cn(
          "text-[11px]",
          over ? "font-medium text-warning" : "text-muted-foreground",
        )}
      >
        {over
          ? `${words} words — over the limit of ${limit}, so this would be marked wrong.`
          : (wordLimitLabel(limit) ?? "Type exactly what you hear.")}
      </p>
    </div>
  );
}

/** Tracks whether this question's single input has already been placed. */
interface GapSlot {
  used: boolean;
}

/** Split a gapped prompt around its blank and drop the input into the hole. */
function interleaveGap(prompt: string, field: ReactNode, slot: GapSlot): ReactNode[] {
  const pieces = prompt.split(GAP_RE);
  const out: ReactNode[] = [];
  pieces.forEach((piece, index) => {
    if (piece) out.push(<span key={`t-${index}`}>{piece}</span>);
    if (index < pieces.length - 1) {
      if (slot.used) {
        out.push(
          <span key={`b-${index}`} className="text-muted-foreground" aria-hidden="true">
            ______
          </span>,
        );
      } else {
        slot.used = true;
        out.push(
          <span key={`f-${index}`} className="inline-flex">
            {field}
          </span>,
        );
      }
    }
  });
  return out;
}

function TablePrompt({
  prompt,
  field,
  slot,
}: {
  prompt: string;
  field: ReactNode;
  slot: GapSlot;
}) {
  const { header, rows } = parseMarkdownTable(prompt);
  const lead = prompt
    .split("\n")
    .filter((line) => !line.includes("|"))
    .join(" ")
    .trim();

  return (
    <div className="space-y-2">
      {lead && <p className="text-sm leading-relaxed">{lead}</p>}
      <div className="scrollbar-thin overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          {header.length > 0 && (
            <thead>
              <tr className="bg-muted/60">
                {header.map((cell, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="border-b border-border px-3 py-2 text-left text-[12px] font-semibold"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-b border-border last:border-0">
                {row.map((cell, c) => (
                  <td key={c} className="px-3 py-2 align-middle">
                    {GAP_RE.test(cell) ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        {interleaveGap(cell, field, slot)}
                      </span>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!slot.used && field}
    </div>
  );
}

// ------------------------------------------------------------- letter answers ---

function LetterAnswer({
  question,
  options,
  value,
  onChange,
  readOnly,
  onFocus,
}: AnswerProps & { options: [string, string][] }) {
  const want = letterCount(question);
  const chosen = splitLetters(value);

  const toggle = useCallback(
    (letter: string) => {
      if (readOnly) return;
      if (want === 1) {
        onChange(chosen[0] === letter ? "" : letter);
        return;
      }
      if (chosen.includes(letter)) {
        onChange(joinLetters(chosen.filter((l) => l !== letter)));
      } else {
        const next = [...chosen, letter].slice(-want);
        onChange(joinLetters(next));
      }
    },
    [chosen, onChange, readOnly, want],
  );

  // "…also accept typing the letter" (07 §6): any A–Z key inside the group picks it.
  const onKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toUpperCase();
    if (key.length !== 1 || !/[A-Z]/.test(key)) return;
    if (!options.some(([letter]) => letter.toUpperCase() === key)) return;
    event.preventDefault();
    toggle(key);
  };

  return (
    <fieldset
      className="space-y-2"
      role={want > 1 ? "group" : "radiogroup"}
      aria-label={`Question ${question.number}`}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      <legend className="text-sm leading-relaxed">
        {stripEmphasis(question.prompt ?? "") || `Question ${question.number}`}
      </legend>
      {want > 1 && (
        <Badge tone="primary">
          Choose {want === 2 ? "TWO" : want === 3 ? "THREE" : want} letters
        </Badge>
      )}
      <div className="space-y-1">
        {options.map(([letter, text]) => {
          const selected = chosen.includes(letter.toUpperCase());
          return (
            <button
              key={letter}
              type="button"
              role={want > 1 ? "checkbox" : "radio"}
              aria-checked={selected}
              disabled={readOnly}
              onClick={() => toggle(letter.toUpperCase())}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border hover:bg-accent",
                readOnly && "cursor-default opacity-70 hover:bg-transparent",
              )}
            >
              <span
                className={cn(
                  "mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground",
                )}
              >
                {letter}
              </span>
              <span className="min-w-0 flex-1">{text}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
