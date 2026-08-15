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
  /**
   * `md` fills a screen or a whole tab. `sm` is for an empty panel inside a screen that has
   * other content — a chart with no history, one card in a grid of four. Panels were writing
   * their own two-paragraph version of this, which is why an empty Progress reads as four
   * different components; same copy, same shape, less vertical space.
   */
  size?: "sm" | "md";
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  size = "md",
  className,
}: EmptyStateProps) {
  const sm = size === "sm";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center animate-fade-in",
        sm ? "px-4 py-8" : "px-6 py-14",
        className,
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-muted",
          sm ? "h-9 w-9" : "h-12 w-12",
        )}
      >
        <Icon
          className={cn("text-muted-foreground", sm ? "h-4 w-4" : "h-5 w-5")}
          aria-hidden="true"
        />
      </span>
      <div className="space-y-1">
        <p className={cn("font-semibold text-foreground", sm ? "text-[13px]" : "text-sm")}>
          {title}
        </p>
        {description && (
          <p className="max-w-sm text-[13px] text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
