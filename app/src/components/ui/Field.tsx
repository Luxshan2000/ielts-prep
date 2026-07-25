import { useId, type LabelHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[13px] font-medium text-foreground", className)} {...props} />;
}

export interface FieldProps {
  label: string;
  hint?: string;
  /** Renders below the control in destructive tone and sets aria-invalid wiring. */
  error?: string;
  required?: boolean;
  className?: string;
  /** Either plain nodes, or a render-prop receiving the generated control id. */
  children: ReactNode | ((props: { id: string; describedBy?: string }) => ReactNode);
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-1 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {typeof children === "function" ? children({ id, describedBy }) : children}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
