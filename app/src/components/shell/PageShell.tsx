import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, Tooltip } from "@/components/ui";
import { BackLink, type BackLinkProps } from "@/components/ui/BackLink";

export interface PageShellProps {
  title: string;
  /** One line under the title — concrete, not marketing (12 §12). */
  description?: string;
  /**
   * Up-navigation, rendered above the title in the one slot every screen uses.
   * Pass the destination props and the shell draws the arrow and the wording:
   * `back={{ to: "/reading", label: "Reading" }}`.
   */
  back?: BackLinkProps | ReactNode;
  /**
   * The screen's PRIMARY action, and nothing else — the rightmost control in the header
   * is the thing a learner is meant to press. Reload lives in `onRefresh` and read-only
   * state lives in `status`, so this slot means the same thing on all ten screens.
   */
  actions?: ReactNode;
  /**
   * Read-only header state (a connection badge, "3 of 4 done"). Sits left of the actions
   * so it can never be mistaken for the button.
   */
  status?: ReactNode;
  /** Renders the standard reload control; three screens had spent their primary slot on one. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** What is being reloaded, e.g. "Recompute estimates". Becomes the accessible name. */
  refreshLabel?: string;
  /**
   * Tabs, filters or a mode picker. Rendered in its own band under the header, on a lighter
   * ground, because these controls change the content below rather than the title above.
   */
  toolbar?: ReactNode;
  maxWidth?: string;
  /** Drop the padded content wrapper — for full-bleed players and split panes. */
  bleed?: boolean;
  className?: string;
  children: ReactNode;
}

function isBackLinkProps(back: BackLinkProps | ReactNode): back is BackLinkProps {
  return typeof back === "object" && back !== null && "label" in back && !("type" in back);
}

export function PageShell({
  title,
  description,
  back,
  actions,
  status,
  onRefresh,
  refreshing = false,
  refreshLabel = "Reload this screen",
  toolbar,
  maxWidth = "max-w-6xl",
  bleed = false,
  className,
  children,
}: PageShellProps) {
  // Below `md` the drawer button floats over the top-left corner of this header (App.tsx
  // renders it absolutely, outside the routed screen). Reserving the gutter on whichever
  // row comes first is what stops the hamburger being drawn across the first letter of
  // the title — measured at 760px, where it covered the "R" of "Reading coach".
  const gutter = "pl-11 md:pl-0";

  return (
    <div className={cn("flex h-full min-h-0 flex-col animate-fade-in", className)}>
      <header className="shrink-0 border-b border-border bg-background/80 backdrop-blur">
        <div className={cn("mx-auto w-full space-y-4 px-6 py-4", maxWidth)}>
          {back && (
            <div className={cn("-mb-2", gutter)}>
              {isBackLinkProps(back) ? <BackLink {...back} /> : back}
            </div>
          )}
          <div className={cn("flex items-start justify-between gap-4", !back && gutter)}>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">{title}</h1>
              {description && (
                <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
              )}
            </div>
            {(actions || status || onRefresh) && (
              <div className="flex shrink-0 items-center gap-2">
                {onRefresh && (
                  <Tooltip content={refreshLabel} side="bottom">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onRefresh}
                      loading={refreshing}
                      aria-label={refreshLabel}
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </Tooltip>
                )}
                {status}
                {actions}
              </div>
            )}
          </div>
        </div>
      </header>

      {/*
        The tabs are their own band under the header, not the last row inside it.
        Sharing the header's box made the title and the mode picker read as one object, so
        it was never obvious that the tabs change what is below rather than what is above.
        The band draws NO rule of its own. Tabs already carry an underline, so a border here
        put three lines within forty pixels: the header's, the band's, and the tabs' own. The
        header rule plus a lighter ground is enough to separate the two.
      */}
      {toolbar && (
        <div className="shrink-0 bg-muted/20">
          <div className={cn("mx-auto w-full px-6 py-2.5", maxWidth)}>{toolbar}</div>
        </div>
      )}

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
