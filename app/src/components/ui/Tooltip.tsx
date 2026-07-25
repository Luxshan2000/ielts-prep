import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TooltipProps {
  /** Tooltip body. When empty the trigger renders bare. */
  content: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  children: ReactNode;
}

const sides = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
  left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
  right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
} as const;

/**
 * CSS-only hover/focus tooltip — no portal, no positioning library. Used for
 * chart points, annotation notes and palette hints. For anything interactive
 * inside the popup, use `Drawer`/`Modal` instead.
 */
export function Tooltip({ content, side = "top", className, children }: TooltipProps) {
  const id = useId();
  if (!content) return <>{children}</>;

  return (
    <span className="group/tooltip relative inline-flex">
      <span aria-describedby={id} className="inline-flex">
        {children}
      </span>
      <span
        role="tooltip"
        id={id}
        className={cn(
          "pointer-events-none absolute z-50 w-max max-w-[16rem] rounded-md border border-border bg-card",
          "px-2 py-1 text-[11px] leading-snug text-foreground shadow-xl",
          "opacity-0 transition-opacity duration-100",
          "group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100",
          sides[side],
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
