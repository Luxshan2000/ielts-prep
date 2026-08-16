/**
 * The accordion row the coach screens use: a real `<button>` carrying
 * `aria-expanded` and `aria-controls`, a `useId`-generated pair of ids, and
 * children mounted only while the panel is open.
 *
 * ## Why this is one component rather than four
 *
 * It is an accessibility primitive, and accessibility primitives are exactly the
 * things that must not exist four times. Reading, listening, writing and speaking
 * each shipped a byte-identical copy of this; a keyboard or ARIA fix applied to
 * one of them and not the other three is a silent regression in three rooms that
 * nobody will notice until a screen-reader user does. The four feature copies
 * differed only in whether the props were hoisted into an interface and whether
 * the setState argument was called `value` or `v` — which is to say they did not
 * differ at all.
 *
 * The heading level is deliberate and part of the contract: the trigger sits
 * inside an `<h3>` because the coach panels put `SectionHead`'s `<h2>` above it,
 * so the document outline reads the same in every skill.
 */

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface DisclosureProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned chip in the header row. */
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function Disclosure({
  title,
  subtitle,
  meta,
  defaultOpen = false,
  children,
  className,
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const buttonId = useId();

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <h3 className="m-0">
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
            "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-ring focus-visible:ring-inset",
          )}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-foreground">{title}</span>
            {subtitle && (
              <span className="mt-0.5 block text-[12px] text-muted-foreground">{subtitle}</span>
            )}
          </span>
          {meta && <span className="shrink-0">{meta}</span>}
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className="border-t border-border px-4 py-4"
      >
        {open && children}
      </div>
    </div>
  );
}
