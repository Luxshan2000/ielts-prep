import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { FeatureIcon } from "@/lib/featureRoute";

/**
 * The app-wide strip under the title bar: something is wrong with the whole app, not with the
 * screen you happen to be on.
 *
 * There are exactly two of these — the sidecar is not answering, and no model provider is
 * reachable — and they had already drifted a little from each other. They are the first thing a
 * learner sees when an install is half-finished, so they get one shape: full-bleed, one line of
 * what happened, one line of what still works, and the control that fixes the cause.
 *
 * `aria-live="polite"` rather than `role="alert"`: these appear while the learner is mid-task,
 * and interrupting a listening test to say the app is reconnecting on its own would be worse
 * than saying it a moment later.
 */
export interface StatusStripProps {
  tone: "warning" | "success";
  icon: FeatureIcon;
  /** What happened, in the learner's terms: "BandReady's local service isn't responding". */
  title: string;
  /** What it means for their work and what still functions. Optional for a one-line success. */
  detail?: ReactNode;
  /** The way out — retry, Open Settings — plus any dismiss control. */
  actions?: ReactNode;
  className?: string;
}

const TONES = {
  warning: { box: "border-warning/40 bg-warning/10", icon: "text-warning" },
  success: { box: "border-success/40 bg-success/10", icon: "text-success" },
} as const;

export function StatusStrip({
  tone,
  icon: Icon,
  title,
  detail,
  actions,
  className,
}: StatusStripProps) {
  const style = TONES[tone];
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2",
        style.box,
        className,
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", style.icon)} aria-hidden="true" />
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {detail && (
        <p className="min-w-0 flex-1 break-words text-xs text-muted-foreground">{detail}</p>
      )}
      {actions}
    </div>
  );
}

export default StatusStrip;
