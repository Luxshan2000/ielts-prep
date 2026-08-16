/**
 * The coach layers' tinted advisory box: an icon, an optional bold lead and a
 * body, in one of three tones — `info` (context), `warn` (a trap) and `teach`
 * (the rule being taught).
 *
 * ## Why this is one component rather than four
 *
 * Reading, listening, writing and speaking each carried a copy of this, and the
 * function body, the `CALLOUT_STYLE` table and the `CALLOUT_ICON` map were
 * character-for-character identical in all four — one file pasted four times, not
 * four variants that happened to converge. The tone table is the thing worth
 * sharing: `warn` means "this is where marks are lost" on every coach screen, and
 * a build where one room's warnings are a different colour from another's teaches
 * the learner that the colour means nothing.
 *
 * ## Why this is not an alias over `Notice`
 *
 * `Notice` is the right end state and this is deliberately not it yet. Their tone
 * tables agree but their markup does not: `Notice`'s root is
 * `flex flex-wrap items-start gap-x-3 gap-y-2` against this one's
 * `flex items-start gap-2.5`, its body sits at `mt-0.5` under a title where this
 * uses `space-y-1`, and it stamps `role="alert"` on the warning tone — which would
 * add a screen-reader interruption to every `warn` callout in the coach. Merging
 * the two restyles four surfaces and is a design decision; this file is the
 * extraction that changes no pixels. Converge them in their own commit.
 */

import { type ReactNode } from "react";
import { AlertTriangle, Info, Lightbulb } from "lucide-react";
import { cn } from "@/lib/cn";

export type CalloutTone = "info" | "warn" | "teach";

const CALLOUT_STYLE: Record<CalloutTone, { box: string; icon: string }> = {
  info: { box: "border-border bg-muted/50", icon: "text-muted-foreground" },
  warn: { box: "border-warning/40 bg-warning/8", icon: "text-warning" },
  teach: { box: "border-primary/40 bg-primary/8", icon: "text-primary" },
};

const CALLOUT_ICON = { info: Info, warn: AlertTriangle, teach: Lightbulb } as const;

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const style = CALLOUT_STYLE[tone];
  const Icon = CALLOUT_ICON[tone];
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border p-3", style.box, className)}>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.icon)} aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        {title && <p className="text-[13px] font-semibold text-foreground">{title}</p>}
        <div className="text-[13px] leading-6 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
