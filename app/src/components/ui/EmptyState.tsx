import type { ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon?: React.ComponentType<LucideProps>;
  /** One line, sentence case. */
  title: string;
  /** One line of concrete guidance — what to do, not why it's empty. */
  description?: string;
  /** Exactly one primary CTA (12 §9). */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center animate-fade-in",
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
          <p className="max-w-sm text-[13px] text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
