import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "destructive"
  | "outline";

const tones: Record<BadgeTone, string> = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary/12 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/12 text-destructive",
  outline: "border border-border text-muted-foreground",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ className, tone = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium leading-none",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
