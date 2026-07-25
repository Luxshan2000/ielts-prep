import { Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { QuestionOption } from "../types";

/**
 * The letter/heading bank shown once above a matching or bank-completion group.
 * Options already used are dimmed and struck through when the group forbids
 * reuse (06 §2 type 4); when reuse is allowed the NB line says so instead.
 */
export function OptionBank({
  options,
  used,
  allowReuse,
  title,
}: {
  options: QuestionOption[];
  used: Set<string>;
  allowReuse: boolean;
  title?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      {title && (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
      )}
      <ul className="space-y-1.5">
        {options.map((option) => {
          const spent = !allowReuse && used.has(option.key.toUpperCase());
          return (
            <li
              key={option.key}
              className={cn(
                "flex gap-2 text-[13px] leading-snug",
                spent ? "text-muted-foreground line-through" : "text-foreground",
              )}
            >
              <span className="w-8 shrink-0 font-semibold tabular">{option.key}</span>
              <span className="min-w-0">{option.text}</span>
            </li>
          );
        })}
      </ul>
      {allowReuse && (
        <p className="mt-2 text-[11px] italic text-muted-foreground">
          NB You may use any letter more than once.
        </p>
      )}
    </div>
  );
}

/** Vertical radio list — multiple choice, where the option text is the answer. */
export function RadioChoices({
  name,
  options,
  value,
  onChange,
  ariaLabel,
  onFocus,
}: {
  name: string;
  options: QuestionOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  onFocus?: () => void;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="space-y-1">
      {options.map((option) => {
        const checked = value.toUpperCase() === option.key.toUpperCase();
        return (
          <label
            key={option.key}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors",
              "focus-within:ring-2 focus-within:ring-ring",
              checked
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border hover:bg-accent",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.key}
              checked={checked}
              onFocus={onFocus}
              onChange={() => onChange(option.key)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
            />
            <span className="w-4 shrink-0 font-semibold tabular">{option.key}</span>
            <span className="min-w-0">{option.text}</span>
          </label>
        );
      })}
    </div>
  );
}

/** Segmented three-way judgement control (TRUE/FALSE/NOT GIVEN, YES/NO/NOT GIVEN). */
export function SegmentedChoices({
  name,
  values,
  value,
  onChange,
  ariaLabel,
  onFocus,
}: {
  name: string;
  values: string[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  onFocus?: () => void;
}) {
  const normalized = value.trim().toUpperCase();
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {values.map((option) => {
        const checked = normalized === option;
        return (
          <label
            key={option}
            className={cn(
              "cursor-pointer rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
              "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring",
              checked
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={checked}
              onFocus={onFocus}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            {option}
          </label>
        );
      })}
    </div>
  );
}

/** Checkbox set for "Choose TWO letters" / list selection. */
export function CheckboxChoices({
  options,
  selected,
  onToggle,
  max,
  ariaLabel,
  onFocus,
}: {
  options: QuestionOption[];
  selected: string[];
  onToggle: (key: string) => void;
  max: number;
  ariaLabel: string;
  onFocus?: () => void;
}) {
  const chosen = new Set(selected.map((s) => s.toUpperCase()));
  const full = chosen.size >= max;
  return (
    <div role="group" aria-label={ariaLabel} className="space-y-1">
      {options.map((option) => {
        const key = option.key.toUpperCase();
        const checked = chosen.has(key);
        return (
          <label
            key={option.key}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors",
              "focus-within:ring-2 focus-within:ring-ring",
              checked
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border hover:bg-accent",
              !checked && full && "opacity-60",
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              onFocus={onFocus}
              onChange={() => onToggle(option.key)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
            />
            <span className="w-4 shrink-0 font-semibold tabular">{option.key}</span>
            <span className="min-w-0">{option.text}</span>
          </label>
        );
      })}
      <p className="pt-0.5 text-[11px] text-muted-foreground tabular">
        {chosen.size} of {max} selected
        {full ? " — clear one to change your mind." : ""}
      </p>
    </div>
  );
}

/** Compact letter dropdown used by the matching families. */
export function LetterSelect({
  options,
  value,
  onChange,
  disabledKeys,
  ariaLabel,
  className,
}: {
  options: QuestionOption[];
  value: string;
  onChange: (value: string) => void;
  disabledKeys?: Set<string>;
  ariaLabel: string;
  className?: string;
}) {
  const current = value.trim().toUpperCase();
  return (
    <Select
      aria-label={ariaLabel}
      className={cn("w-28", className)}
      value={current || ""}
      onChange={onChange}
      placeholder="—"
      options={[
        { value: "", label: "— clear" },
        ...options.map((option) => ({
          value: option.key.toUpperCase(),
          label: option.key,
          disabled:
            Boolean(disabledKeys?.has(option.key.toUpperCase())) &&
            current !== option.key.toUpperCase(),
        })),
      ]}
    />
  );
}
