import type { ReactNode } from "react";
import { AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

interface Props {
  stepIndex: number;
  stepCount: number;
  stepNames: readonly string[];
  title: string;
  description?: string;
  error?: string | null;
  onDismissError?: () => void;
  /** Rendered bottom-left, e.g. "Set up later". */
  escapeHatch?: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  /** Replaces the default Continue button entirely. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Full-screen, modal-free wizard chrome (10 §2): progress dots top-centre,
 * Back/Continue at the bottom. Not inside `PageShell` — onboarding deliberately
 * fills the pane so the sidebar is the only chrome around it.
 */
export function WizardChrome({
  stepIndex,
  stepCount,
  stepNames,
  title,
  description,
  error,
  onDismissError,
  escapeHatch,
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
  nextLoading = false,
  footer,
  children,
}: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col animate-fade-in">
      <header className="shrink-0 border-b border-border px-6 py-4">
        <div className="mx-auto w-full max-w-2xl">
          <ol className="flex items-center justify-center gap-2" aria-label="Setup progress">
            {Array.from({ length: stepCount }, (_, i) => (
              <li key={i}>
                <span
                  className={cn(
                    "block h-1.5 rounded-full transition-all",
                    i === stepIndex
                      ? "w-6 bg-primary"
                      : i < stepIndex
                        ? "w-1.5 bg-primary/50"
                        : "w-1.5 bg-muted",
                  )}
                  aria-current={i === stepIndex ? "step" : undefined}
                />
                <span className="sr-only">
                  {`Step ${i + 1} of ${stepCount}: ${stepNames[i] ?? ""}`}
                  {i === stepIndex ? " (current)" : ""}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-6 py-8">
          <h1 className="text-xl font-semibold">{title}</h1>
          {description && (
            <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/[0.06] px-3 py-2.5">
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <p className="min-w-0 flex-1 text-[13px] text-foreground">{error}</p>
              {onDismissError && (
                <Button variant="ghost" size="sm" onClick={onDismissError}>
                  Dismiss
                </Button>
              )}
            </div>
          )}

          <div className="mt-6">{children}</div>
        </div>
      </div>

      <footer className="shrink-0 border-t border-border px-6 py-3">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back
            </Button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {escapeHatch}
            {footer ??
              (onNext && (
                <Button onClick={onNext} disabled={nextDisabled} loading={nextLoading}>
                  {nextLabel}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Selectable card used by the exam-format, level and time-budget steps. */
export function ChoiceCard({
  selected,
  title,
  description,
  onSelect,
  name,
}: {
  selected: boolean;
  title: string;
  description?: string;
  onSelect: () => void;
  name: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors",
        selected ? "border-primary bg-primary/[0.06]" : "border-border hover:bg-accent",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={selected}
        onChange={onSelect}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))] focus:outline-none"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        {description && (
          <span className="mt-0.5 block text-[13px] text-muted-foreground">{description}</span>
        )}
      </span>
    </label>
  );
}
