import { useId } from "react";
import { cn } from "@/lib/cn";
import { wordLimitState } from "../qtypes";
import type { WordLimit } from "../types";

export interface AnswerInputProps {
  value: string;
  onChange: (value: string) => void;
  wordLimit?: WordLimit | number | null;
  /** Accessible name — always the question number plus its prompt. */
  ariaLabel: string;
  /** Renders at gap size inside a sentence/summary/table instead of full width. */
  inline?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  onFocus?: () => void;
}

/**
 * The free-text answer control: a live IELTS word counter that WARNS but never
 * blocks (06 §2.1 — an over-limit answer is wrong, and the learner is told so
 * before they submit, not prevented from typing it).
 */
export function AnswerInput({
  value,
  onChange,
  wordLimit,
  ariaLabel,
  inline = false,
  disabled,
  placeholder,
  className,
  onFocus,
}: AnswerInputProps) {
  const id = useId();
  const state = wordLimitState(value, wordLimit);
  const hintId = `${id}-hint`;
  const width = state ? Math.min(28, Math.max(10, state.limit.max_words * 8 + 4)) : 16;

  return (
    <span className={cn(inline ? "inline-flex items-baseline gap-1.5" : "flex flex-col gap-1", className)}>
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-describedby={state ? hintId : undefined}
        aria-invalid={state?.over || undefined}
        autoComplete="off"
        spellCheck={false}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
        style={inline ? { width: `${width}ch` } : undefined}
        className={cn(
          "h-9 rounded-lg border bg-background px-3 text-sm text-foreground",
          "placeholder:text-muted-foreground transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
          inline ? "h-8 py-0 text-[13px]" : "w-full",
          state?.over ? "border-warning ring-1 ring-warning/40" : "border-input",
        )}
      />
      {state && (
        <span
          id={hintId}
          className={cn(
            "text-[11px] tabular",
            state.over ? "font-medium text-warning" : "text-muted-foreground",
          )}
        >
          {state.over ? `${state.caption}, over the limit` : state.caption}
        </span>
      )}
    </span>
  );
}
