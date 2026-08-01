import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Self-check items whose answers are one click away.
 *
 * Three things in this app are called a "check" and only one of them is this:
 *
 * - Listening's `CheckStep` is the timed two-minute transfer window before submitting. It is
 *   an exam phase with a countdown, not a panel.
 * - Reading's `SolutionsPanel` withholds worked solutions until a real attempt exists. That
 *   gate is a product rule — seeing the answer first destroys the practice — so it stays its
 *   own component rather than becoming a `gated` prop here. A flag would invite somebody to
 *   pass `gated={false}` and quietly undo the rule.
 * - This: a reader checking whether they followed an explanation. Nothing is being assessed,
 *   nothing is recorded, and the answer is deliberately immediate. Making a reference prove
 *   itself before it explains is the opposite of what a reference is for.
 *
 * So this component is for the third case only, and its lack of gating is the point.
 */

export interface QuickCheckItem {
  /** The question as the reader meets it. */
  question: string;
  answer: string;
  /** Why that is the answer — the part that actually teaches. */
  why?: string | null;
}

export interface QuickCheckProps {
  items: QuickCheckItem[];
  /** Heading above the list. */
  title?: string;
  /** Renders each string; lets a caller resolve authoring syntax (emphasis, gaps). */
  renderText?: (text: string) => React.ReactNode;
  className?: string;
}

export function QuickCheck({
  items,
  title = "Check yourself",
  renderText,
  className,
}: QuickCheckProps) {
  const [shown, setShown] = useState<Record<number, boolean>>({});
  if (items.length === 0) return null;
  const show = (text: string) => (renderText ? renderText(text) : text);

  return (
    <div className={cn("rounded-xl border border-border bg-card p-3", className)}>
      <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        {title}
      </p>
      <ol className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="text-[14px] leading-relaxed">
            <p>{show(item.question)}</p>
            {shown[i] ? (
              <div className="mt-1 rounded-lg bg-success/10 p-2">
                <p className="font-medium">{show(item.answer)}</p>
                {item.why && (
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{show(item.why)}</p>
                )}
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-7 px-2 text-[13px]"
                onClick={() => setShown((s) => ({ ...s, [i]: true }))}
              >
                Show the answer
              </Button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
