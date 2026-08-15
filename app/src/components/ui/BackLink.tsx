import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * One shape for going back up.
 *
 * The audit found fourteen back controls in five shapes: ghost button with an arrow, plain
 * text with none, "Back to Reading", "Reading library", "Back to the reading library" — in
 * three different slots. Electron has no browser back button, so this control IS the app's
 * up-navigation, and a learner who cannot predict it stops trusting it.
 *
 * The settled shape: arrow, then "Back to <destination>", small and muted, top-left of the
 * screen it is leaving. Pass the destination as the learner would say it ("Reading", "the
 * mock room") — the word "Back to" belongs to the component so it can never drift.
 *
 * `to` is a hash href rather than a router `Link` for the same reason `ErrorState` uses one:
 * the app mounts a `HashRouter`, so this is still a real in-app navigation, and the component
 * stays renderable — and unit-testable — outside a `<Routes>`.
 */
export interface BackLinkProps {
  /** Route to return to, e.g. "/reading". Omit when the caller handles it with `onClick`. */
  to?: string;
  /** Where you land, as the learner would say it: "Reading", "the mock room", "drills". */
  label: string;
  /** Used instead of `to` when leaving is a state change rather than a route change. */
  onClick?: () => void;
  className?: string;
}

const SHARED =
  "inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background";

export function BackLink({ to, label, onClick, className }: BackLinkProps) {
  const body = (
    <>
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">Back to {label}</span>
    </>
  );

  if (to && !onClick) {
    return (
      <a href={`#${to}`} className={cn(SHARED, className)}>
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
      className={cn(SHARED, className)}
    >
      {body}
    </button>
  );
}

export default BackLink;
