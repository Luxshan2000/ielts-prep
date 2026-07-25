import { useCallback, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "./Badge";

export interface TabItem<T extends string = string> {
  value: T;
  label: string;
  /** Small count/status chip on the right of the label. */
  badge?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  items: TabItem<T>[];
  className?: string;
  "aria-label"?: string;
}

/** Underlined tab strip. Arrow keys move between tabs (WAI-ARIA tab pattern). */
export function Tabs<T extends string = string>({
  value,
  onChange,
  items,
  className,
  "aria-label": ariaLabel = "Sections",
}: TabsProps<T>) {
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const enabled = items.filter((i) => !i.disabled);
      const idx = enabled.findIndex((i) => i.value === value);
      if (idx < 0) return;
      const next = e.key === "ArrowRight" ? (idx + 1) % enabled.length : (idx - 1 + enabled.length) % enabled.length;
      e.preventDefault();
      onChange(enabled[next].value);
    },
    [items, onChange, value],
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn("flex items-center gap-1 border-b border-border", className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
              "disabled:pointer-events-none disabled:opacity-50",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {item.badge !== undefined && typeof item.badge !== "object" ? (
              <Badge tone={active ? "primary" : "default"}>{item.badge}</Badge>
            ) : (
              item.badge
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Content panel paired with a `Tabs` strip. */
export function TabPanel({
  value,
  active,
  children,
  className,
}: {
  value: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!active) return null;
  return (
    <div role="tabpanel" aria-label={value} className={cn("animate-fade-in pt-4", className)}>
      {children}
    </div>
  );
}
