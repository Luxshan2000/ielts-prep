import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Lightbulb, OctagonAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { FeatureIcon } from "@/lib/featureRoute";

/**
 * The one advisory row: a fact the learner needs before or during the thing they are doing.
 *
 * The audit counted fifty-five hand-rolled versions of this shape across the ten screens —
 * `rounded-xl border border-warning/40 bg-warning/8 p-3` with an icon and a paragraph — and
 * they had drifted apart in every dimension that matters: three background opacities (/8, /10,
 * /12), body text in `text-foreground` on one screen and `text-muted-foreground` on the next,
 * `role="alert"` on some and not others, an icon that was `aria-hidden` here and announced as
 * "alert triangle" there. A learner meeting the fourth one has no reason to read it as the same
 * kind of thing as the first.
 *
 * The washes here are the plurality ones already in the codebase (`/8` over `/10`, `bg-muted/50`
 * for a neutral) and match `reading/components/coach/primitives.tsx`'s `Callout`, which is the
 * most refined of the fifty-five — so adopting this is a deletion for the reading coach, not a
 * restyle.
 *
 * `Notice` is for a message the learner can act on or must know. It is NOT for a failure that
 * replaced content — that is `ErrorState`, which classifies the throw and offers the retry.
 */
export type NoticeTone = "info" | "teach" | "warning" | "danger" | "success";

const TONES: Record<NoticeTone, { box: string; icon: string; fallback: FeatureIcon }> = {
  info: { box: "border-border bg-muted/50", icon: "text-muted-foreground", fallback: Info },
  // A point being taught rather than a problem being reported — the coach's own voice.
  teach: { box: "border-primary/40 bg-primary/8", icon: "text-primary", fallback: Lightbulb },
  warning: { box: "border-warning/40 bg-warning/8", icon: "text-warning", fallback: AlertTriangle },
  danger: {
    box: "border-destructive/40 bg-destructive/8",
    icon: "text-destructive",
    fallback: OctagonAlert,
  },
  success: { box: "border-success/40 bg-success/8", icon: "text-success", fallback: CheckCircle2 },
};

export interface NoticeProps {
  tone?: NoticeTone;
  /** Optional bold lead, e.g. "Spelling is marked." Say the fact, not the category. */
  title?: string;
  /** The body: what this means for the learner, and what to do about it. */
  children: ReactNode;
  /** Overrides the tone's icon when a specific one says more (a plug, a clock, a speaker). */
  icon?: FeatureIcon;
  /** Buttons for the way out — a retry, an "Open Settings". Kept right of the text. */
  actions?: ReactNode;
  /** Renders a close control. Omit for a notice the learner is not allowed to lose. */
  onDismiss?: () => void;
  /** Accessible name for the close control, e.g. "Dismiss the spelling notice". */
  dismissLabel?: string;
  /**
   * Whether a screen reader is interrupted when this appears. Default: yes for `warning` and
   * `danger` (they nearly always appear because something just failed), politely for `success`,
   * never for `info` or `teach`. Pass `false` for a permanent advisory that is part of the page
   * rather than a response to an action — announcing "spelling is marked" on every mount is noise.
   */
  announce?: boolean;
  className?: string;
}

export function Notice({
  tone = "info",
  title,
  children,
  icon,
  actions,
  onDismiss,
  dismissLabel = "Dismiss this notice",
  announce,
  className,
}: NoticeProps) {
  const style = TONES[tone];
  const Icon = icon ?? style.fallback;
  const live = announce ?? (tone !== "info" && tone !== "teach");
  const role = live ? (tone === "success" ? "status" : "alert") : undefined;

  return (
    <div
      role={role}
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border p-3",
        style.box,
        className,
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-[13px] leading-6">
        {title && <p className="font-semibold text-foreground">{title}</p>}
        <div className={cn("text-muted-foreground", title && "mt-0.5")}>{children}</div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className={cn(
            "-m-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default Notice;
