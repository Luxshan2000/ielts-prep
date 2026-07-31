/**
 * The pieces every practice item is built from.
 *
 * One contract, fourteen kinds: a renderer draws the question, owns whatever
 * local state the answer needs, and calls `onAnswer` once. It never decides
 * whether the answer was right — the sidecar does that (see `api.ts`) — and it
 * never reveals a key, because the key is not in the payload it was handed.
 *
 * Keyboard is not an afterthought here. Every option list answers to its number
 * key, every text field answers to Enter, and the runner's own "Continue" answers
 * to Enter too, so a whole session can be done without touching the mouse.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { AttemptState } from "../../store";
import type { ItemPayload, OptionSpec, SessionItem } from "../../types";

export interface ItemViewProps {
  item: SessionItem;
  attempt: AttemptState;
  /** True while a submission is in flight, or once the item is finished. */
  disabled: boolean;
  onAnswer: (answer: string | number | number[] | null, followUp?: number | null) => void;
}

/** Options arrive either as bare strings or as `{text, why_this_means}`. */
export function optionText(option: string | OptionSpec): string {
  return typeof option === "string" ? option : option.text;
}

export function optionList(payload: ItemPayload): string[] {
  return (payload.options ?? []).map(optionText);
}

// ------------------------------------------------------------- containers ----

/** The muted block a context sentence sits in. Never the answer, always the setting. */
export function ContextBlock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "rounded-lg border-l-2 border-border bg-muted/60 px-3 py-2 text-[13px] leading-relaxed text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** The sentence under test — bigger, calmer, and the thing the eye lands on. */
export function Stem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-base leading-relaxed text-foreground", className)}>{children}</p>
  );
}

/** Renders a stem with `___` turned into a visible blank. */
export function StemWithBlank({ stem, filled }: { stem: string; filled?: string | null }) {
  const parts = stem.split(/_{2,}/);
  return (
    <Stem>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <span
              className={cn(
                "mx-1 inline-block min-w-[4.5rem] rounded border-b-2 px-1 text-center align-baseline",
                filled ? "border-primary font-medium text-primary" : "border-muted-foreground/50",
              )}
            >
              {filled ?? " "}
            </span>
          )}
        </span>
      ))}
    </Stem>
  );
}

// ------------------------------------------------------------- option list ----

export interface OptionListProps {
  options: ReactNode[];
  /** The index the learner has committed to, or null. */
  chosen: number | null;
  /** The correct index, once the reveal has arrived. */
  keyIndex?: number | null;
  disabled: boolean;
  onChoose: (index: number) => void;
  /** Wider chips, one per row — for options that are whole sentences. */
  stacked?: boolean;
  /** Dim the chosen-and-wrong option but leave the rest live (F3 beat 2). */
  dimmed?: number | null;
  ariaLabel?: string;
}

export function OptionList({
  options,
  chosen,
  keyIndex = null,
  disabled,
  onChoose,
  stacked = true,
  dimmed = null,
  ariaLabel = "Options",
}: OptionListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Number keys pick an option. Bound on the container so it cannot swallow the
  // keystrokes of a text field elsewhere on the card.
  useEffect(() => {
    if (disabled) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      const n = Number(event.key);
      if (!Number.isInteger(n) || n < 1 || n > options.length) return;
      event.preventDefault();
      onChoose(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, onChoose, options.length]);

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={ariaLabel}
      className={cn("grid gap-2", stacked ? "grid-cols-1" : "sm:grid-cols-2")}
    >
      {options.map((label, i) => {
        const isChosen = chosen === i;
        const isKey = keyIndex === i;
        const revealed = keyIndex !== null;
        return (
          <button
            key={i}
            type="button"
            disabled={disabled || dimmed === i}
            aria-pressed={isChosen}
            onClick={() => onChoose(i)}
            className={cn(
              "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-[13px] leading-relaxed transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
              "disabled:cursor-not-allowed",
              !revealed && !isChosen && "border-border bg-background hover:border-primary/50 hover:bg-accent",
              !revealed && isChosen && "border-primary bg-primary/8",
              revealed && isKey && "border-success bg-success/12",
              revealed && !isKey && isChosen && "border-warning bg-warning/12",
              revealed && !isKey && !isChosen && "border-border bg-background opacity-60",
              dimmed === i && "opacity-40",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] font-medium",
                isChosen || isKey ? "border-transparent bg-primary/15 text-primary" : "border-border text-muted-foreground",
              )}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------- text entry ----

export interface AnswerFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  placeholder?: string;
  label: string;
  /** Multi-line, for free production. */
  multiline?: boolean;
  autoFocus?: boolean;
}

export function AnswerField({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  label,
  multiline = false,
  autoFocus = true,
}: AnswerFieldProps) {
  const shared = {
    value,
    disabled,
    placeholder,
    "aria-label": label,
    autoFocus,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    className: cn(
      "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground",
      "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      "disabled:opacity-60",
    ),
  };

  if (multiline) {
    return (
      <textarea
        {...shared}
        rows={3}
        onKeyDown={(e) => {
          // Enter submits, Shift+Enter breaks the line — the convention every
          // other typed answer in this app already uses.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (value.trim()) onSubmit();
          }
        }}
      />
    );
  }
  return (
    <input
      {...shared}
      type="text"
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (value.trim()) onSubmit();
        }
      }}
    />
  );
}

/** Small helper for the renderers that need a local string answer. */
export function useTypedAnswer(itemId: string): [string, (v: string) => void] {
  const [value, setValue] = useState("");
  useEffect(() => setValue(""), [itemId]);
  return [value, setValue];
}
