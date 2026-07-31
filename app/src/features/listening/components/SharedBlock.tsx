import { type ReactNode } from "react";
import { Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  GAP_RE,
  countWords,
  isMarkdownTable,
  parseMarkdownTable,
  stripEmphasis,
  wordLimitLabel,
} from "../qtypes";
import type { ListeningQuestion } from "../types";

/**
 * A form, note or table completion block, drawn ONCE for the whole group.
 *
 * These prompts are authored once per group and copied onto every question in it, with
 * `**n**` marking which gap belongs to which number. Rendering one `QuestionBlock` per
 * question therefore drew the entire form once per gap — six questions meant six copies of
 * the same form — and printed the markers literally, so the learner saw a wall of repeated
 * text studded with `**1**`. That is what a real form completion never looks like: the form
 * appears once, and the numbered gaps are filled in place.
 *
 * So the group renders the block a single time and drops a field into each gap, bound to
 * the question that gap's preceding marker names. A gap whose number has no question (or a
 * block with no markers at all) still renders as a blank, because the text has to keep its
 * shape either way.
 */

const MARKER_SPLIT = /(\*\*\d+\*\*)/;
const MARKER_ONLY = /^\*\*(\d+)\*\*$/;

export interface SharedBlockProps {
  questions: ListeningQuestion[];
  answers: Record<string, string>;
  onAnswer: (number: number, value: string) => void;
  readOnly?: boolean;
  activeNumber: number;
  onActive: (number: number) => void;
  registerRef?: (number: number, el: HTMLDivElement | null) => void;
}

/** True when this group is one shared block rather than a list of separate questions. */
export function isSharedBlock(questions: ListeningQuestion[]): boolean {
  if (questions.length < 2) return false;
  const first = (questions[0].prompt ?? "").trim();
  if (!first || !/\*\*\d+\*\*/.test(first)) return false;
  return questions.every((q) => (q.prompt ?? "").trim() === first);
}

export function SharedBlock({
  questions,
  answers,
  onAnswer,
  readOnly = false,
  activeNumber,
  onActive,
  registerRef,
}: SharedBlockProps) {
  const prompt = (questions[0]?.prompt ?? "").trim();
  const byNumber = new Map(questions.map((q) => [q.number, q]));

  const field = (number: number): ReactNode => {
    const question = byNumber.get(number);
    if (!question) return <Blank key={`blank-${number}`} />;
    const value = answers[String(number)] ?? "";
    const limit = question.word_limit;
    const over = Boolean(limit && countWords(value) > limit);
    return (
      <span
        key={`f-${number}`}
        ref={(el) => registerRef?.(number, el as unknown as HTMLDivElement | null)}
        id={`listening-q-${number}`}
        data-question={number}
        className="inline-flex items-center gap-1.5 align-middle"
      >
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold tabular-nums",
            value.trim()
              ? "bg-primary text-primary-foreground"
              : "border border-border text-muted-foreground",
          )}
          aria-hidden="true"
        >
          {number}
        </span>
        <Input
          value={value}
          onChange={(e) => onAnswer(number, e.target.value)}
          onFocus={() => onActive(number)}
          readOnly={readOnly}
          aria-label={`Answer for question ${number}`}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className={cn(
            "h-8 w-[11rem] font-medium",
            activeNumber === number && "border-primary/60 ring-1 ring-primary/30",
            over && "border-warning focus-visible:ring-warning",
            readOnly && "bg-muted/60 text-muted-foreground",
          )}
        />
      </span>
    );
  };

  const limit = questions[0]?.word_limit ?? null;
  const overs = questions.filter(
    (q) => q.word_limit && countWords(answers[String(q.number)] ?? "") > q.word_limit,
  );

  return (
    <div className="space-y-2">
      {isMarkdownTable(prompt) ? (
        <TableBlock prompt={prompt} field={field} />
      ) : (
        <div className="space-y-1.5 rounded-xl border border-border bg-card/40 p-3">
          {splitLines(prompt).map((line, index) => (
            <p
              key={index}
              className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm leading-relaxed"
            >
              {renderLine(line, field)}
            </p>
          ))}
        </div>
      )}
      <p
        className={cn(
          "text-[11px]",
          overs.length ? "font-medium text-warning" : "text-muted-foreground",
        )}
      >
        {overs.length
          ? `${overs.map((q) => q.number).join(", ")} — over the word limit, so ${
              overs.length === 1 ? "it" : "they"
            } would be marked wrong.`
          : (wordLimitLabel(limit) ?? "Type exactly what you hear.")}
      </p>
    </div>
  );
}

function Blank() {
  return (
    <span className="text-muted-foreground" aria-hidden="true">
      ______
    </span>
  );
}

function splitLines(prompt: string): string[] {
  return prompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Walk one line, dropping a field into each gap.
 *
 * The number in play is whatever the most recent `**n**` marker named, so `Surname: **1**
 * ______` puts question 1's field where the blank is and never prints the marker.
 */
function renderLine(line: string, field: (n: number) => ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  let current: number | null = null;

  line.split(MARKER_SPLIT).forEach((chunk, chunkIndex) => {
    if (!chunk) return;
    const marker = chunk.match(MARKER_ONLY);
    if (marker) {
      current = Number(marker[1]);
      return;
    }
    const pieces = chunk.split(GAP_RE);
    pieces.forEach((piece, index) => {
      const text = stripEmphasis(piece);
      if (text) out.push(<span key={`t-${chunkIndex}-${index}`}>{text}</span>);
      if (index < pieces.length - 1) {
        if (current == null) {
          out.push(<Blank key={`b-${chunkIndex}-${index}`} />);
        } else {
          out.push(field(current));
          current = null; // one field per marker; a second gap is somebody else's
        }
      }
    });
  });

  return out;
}

function TableBlock({
  prompt,
  field,
}: {
  prompt: string;
  field: (n: number) => ReactNode;
}) {
  const { header, rows } = parseMarkdownTable(prompt);
  const lead = prompt
    .split("\n")
    .filter((line) => !line.includes("|"))
    .map((line) => stripEmphasis(line).trim())
    .filter(Boolean)
    .join(" ");

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
                    {stripEmphasis(cell)}
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
                    <span className="flex flex-wrap items-center gap-1.5">
                      {renderLine(cell, field)}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
