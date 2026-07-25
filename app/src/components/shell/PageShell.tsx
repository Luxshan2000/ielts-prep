import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface PageShellProps {
  title: string;
  /** One line under the title — concrete, not marketing (12 §12). */
  description?: string;
  /** Right-aligned header actions. */
  actions?: ReactNode;
  /** Full-width row below the title (tabs, filters, banners). */
  toolbar?: ReactNode;
  maxWidth?: string;
  /** Drop the padded content wrapper — for full-bleed players and split panes. */
  bleed?: boolean;
  className?: string;
  children: ReactNode;
}

export function PageShell({
  title,
  description,
  actions,
  toolbar,
  maxWidth = "max-w-6xl",
  bleed = false,
  className,
  children,
}: PageShellProps) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col animate-fade-in", className)}>
      <header className="shrink-0 border-b border-border bg-background/80 backdrop-blur">
        <div className={cn("mx-auto w-full space-y-4 px-6 py-4", maxWidth)}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">{title}</h1>
              {description && (
                <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
              )}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
          {toolbar}
        </div>
      </header>

      {bleed ? (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
      ) : (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <div className={cn("mx-auto w-full px-6 py-6", maxWidth)}>{children}</div>
        </div>
      )}
    </div>
  );
}
