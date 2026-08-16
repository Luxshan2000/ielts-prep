import { Ear } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Shown wherever pronunciation is discussed, in one shape, because 09 §0 makes it a product
 * rule rather than a courtesy: BandReady measures whether a learner is understood, never how
 * close they sound to any accent. For someone whose first language is Tamil, Sinhala, Hindi,
 * Arabic or Chinese, that distinction is the whole reason this module is safe to use.
 *
 * Every pronunciation response carries `accent_notice` and the notice must be on screen with
 * the result — but three screens rendered it three ways (a muted line under a drill, a sentence
 * glued onto the end of another paragraph, a `<p>` in a stack), and one of them dropped it
 * silently when the field came back empty. The rule cannot depend on a truthiness check in a
 * feature: `notice` may be missing, and this component still says it.
 */
export const ACCENT_NOTICE_FALLBACK =
  "IELTS accepts every accent. This measures how clearly each sound comes across, not how British or American you sound.";

export interface AccentNoticeProps {
  /** `accent_notice` from the sidecar. The fixed sentence stands in when it is absent. */
  notice?: string | null;
  /** `inline` drops the icon for a tight row under a single drill. */
  variant?: "block" | "inline";
  className?: string;
}

export function AccentNotice({ notice, variant = "block", className }: AccentNoticeProps) {
  const text = notice?.trim() ? notice.trim() : ACCENT_NOTICE_FALLBACK;

  if (variant === "inline") {
    return <p className={cn("text-[12px] leading-5 text-muted-foreground", className)}>{text}</p>;
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3",
        className,
      )}
    >
      <Ear className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-[13px] leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}

export default AccentNotice;
