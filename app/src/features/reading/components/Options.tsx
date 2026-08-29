import { Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { choiceGlossary } from "../qtypes";
import type { QuestionOption } from "../types";

/**
 * The TRUE / FALSE / NOT GIVEN (or YES / NO / NOT GIVEN) rubric, printed above the
 * buttons the way the real paper prints it. Renders nothing for any other type.
 */
export function ChoiceGlossary({ qtype, className }: { qtype: string; className?: string }) {
  const rows = choiceGlossary(qtype);
  if (rows.length === 0) return null;
  return (
    <dl
      className={cn(
        "space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-[13px] leading-snug",
        className,
      )}
    >
      {rows.map((row) => (
        <div key={row.value} className="flex gap-2">
          <dt className="w-24 shrink-0 font-semibold">{row.value}</dt>
          <dd className="min-w-0 text-muted-foreground">if {row.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

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
  disabled,
}: {
  name: string;
  options: QuestionOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  onFocus?: () => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="space-y-1">
      {options.map((option) => {
        const checked = value.toUpperCase() === option.key.toUpperCase();
        return (
          <label
            key={option.key}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors",
              "focus-within:ring-2 focus-within:ring-ring",
              disabled ? "cursor-default opacity-70" : "cursor-pointer",
              checked
                ? "border-primary bg-primary/10 text-foreground"
                : cn("border-border", !disabled && "hover:bg-accent"),
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.key}
              checked={checked}
              disabled={disabled}
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
  disabled,
}: {
  name: string;
  values: string[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  onFocus?: () => void;
  disabled?: boolean;
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
              // `relative` is load-bearing. The input below is `sr-only`, which is
              // `position: absolute`, so its containing block is the nearest positioned
              // ancestor. Without this that ancestor is the app shell, far outside the
              // scrolling question pane — the label scrolls with the pane and the input
              // stays pinned where the label used to be. Clicking then focuses an input
              // that really is hundreds of pixels below the viewport, the browser scrolls
              // the shell to reveal it, and because the shell is `overflow-hidden` there
              // is no scrollbar to come back with: the whole app slides away and the
              // learner is looking at nothing. Making the label the containing block
              // keeps the input inside its own button, where it looks like it already is.
              "relative rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
              "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring",
              disabled ? "cursor-default opacity-70" : "cursor-pointer",
              checked
                ? "border-primary bg-primary text-primary-foreground"
                : cn(
                    "border-border text-muted-foreground",
                    !disabled && "hover:bg-accent hover:text-foreground",
                  ),
            )}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={checked}
              disabled={disabled}
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
  disabled,
}: {
  options: QuestionOption[];
  selected: string[];
  onToggle: (key: string) => void;
  max: number;
  ariaLabel: string;
  onFocus?: () => void;
  disabled?: boolean;
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
              "flex items-start gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors",
              "focus-within:ring-2 focus-within:ring-ring",
              disabled ? "cursor-default opacity-70" : "cursor-pointer",
              checked
                ? "border-primary bg-primary/10 text-foreground"
                : cn("border-border", !disabled && "hover:bg-accent"),
              !checked && full && "opacity-60",
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
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
        {full ? ". Clear one to change your mind." : ""}
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
  disabled,
}: {
  options: QuestionOption[];
  value: string;
  onChange: (value: string) => void;
  disabledKeys?: Set<string>;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const current = value.trim().toUpperCase();
  return (
    <Select
      aria-label={ariaLabel}
      className={cn("w-28", className)}
      value={current || ""}
      disabled={disabled}
      onChange={onChange}
      placeholder="-"
      options={[
        { value: "", label: "Clear" },
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
