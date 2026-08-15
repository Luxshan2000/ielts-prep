import type { ReactNode } from "react";
import { ChevronRight, Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import type { FeatureIcon } from "@/lib/featureRoute";

/**
 * The way into a practice room — the coach, the mock, the drills.
 *
 * Every skill ships two or three of these and every skill drew them differently: Reading as a
 * strip of truncated links above its own title, Listening as two body cards with a button each,
 * Speaking as a banner plus a radio plus a primary button for the same mock. A learner moving
 * from Reading to Listening has to re-learn what a room looks like, and at 820px Reading's strip
 * truncated exactly the half that says how the two rooms differ.
 *
 * So: one card per room, one target you can click anywhere, the description allowed to wrap
 * because it is the only thing that tells "Mock paper" apart from "Full tests", and `meta` for
 * the facts that used to be buried in that sentence. `RoomGrid` stacks them below `md`, which is
 * where two columns of prose stop being readable.
 */
export interface RoomCardProps {
  /** Route this room lives at, e.g. "/reading/mock". */
  to?: string;
  /** Used instead of `to` when entering the room is a state change rather than a route change. */
  onClick?: () => void;
  icon?: FeatureIcon;
  title: string;
  /** What happens in this room, in one or two sentences. Never truncated. */
  description: string;
  /** Short facts: "40 questions", "60 minutes", "no help of any kind". */
  meta?: string[];
  /** Overrides the plain chevron with a worded affordance, e.g. "Sit a mock paper". */
  cta?: string;
  /**
   * `exam` marks a room that is timed, scored and shut off from the coach. It is a different
   * commitment from a study room, and the learner should be able to see that before entering.
   */
  tone?: "study" | "exam";
  /** Why this room cannot be entered yet, in a sentence a learner can act on. */
  disabledReason?: string;
  className?: string;
}

export function RoomCard({
  to,
  onClick,
  icon: Icon,
  title,
  description,
  meta,
  cta,
  tone = "study",
  disabledReason,
  className,
}: RoomCardProps) {
  const accent = tone === "exam" ? "text-warning" : "text-primary";
  const body = (
    <>
      <span className="flex items-start gap-3">
        {Icon && (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              tone === "exam" ? "bg-warning/12" : "bg-primary/10",
            )}
          >
            <Icon className={cn("h-4 w-4", accent)} aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {title}
            {disabledReason && (
              <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            )}
          </span>
          <span className="block text-[13px] leading-6 text-muted-foreground">{description}</span>
        </span>
        {!cta && !disabledReason && (
          <ChevronRight
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </span>

      {meta && meta.length > 0 && (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
          {meta.map((fact, i) => (
            <span key={fact} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden="true">·</span>}
              {fact}
            </span>
          ))}
        </span>
      )}

      {disabledReason ? (
        <span className="text-[12px] text-muted-foreground">{disabledReason}</span>
      ) : (
        cta && (
          <span
            className={cn(
              "inline-flex h-8 w-fit items-center gap-1.5 rounded-lg border border-input px-3 text-[13px] font-medium text-foreground",
              "transition-colors group-hover:bg-accent",
            )}
          >
            {cta}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        )
      )}
    </>
  );

  const shell = cn(
    "group flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left",
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    disabledReason ? "opacity-70" : "hover:bg-accent/50",
    className,
  );

  // One interactive element per card: the whole card is the target, so `cta` is a styled span
  // rather than a nested button. Two focus stops for one destination is how a keyboard user
  // ends up tabbing through a grid twice.
  if (disabledReason) {
    return (
      <div className={shell} aria-disabled="true">
        {body}
      </div>
    );
  }

  if (to && !onClick) {
    return (
      <a href={`#${to}`} className={shell}>
        {body}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        if (to && typeof window !== "undefined") window.location.hash = `#${to}`;
      }}
      className={shell}
    >
      {body}
    </button>
  );
}

/**
 * Rooms side by side above `md`, stacked below it. Two columns of two-line prose at 820px is
 * what forced Reading to truncate its descriptions in the first place.
 */
export function RoomGrid({
  children,
  className,
  "aria-label": ariaLabel = "Practice rooms",
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className={cn("grid gap-3 md:grid-cols-2", className)}>
      {children}
    </nav>
  );
}

export default RoomCard;
