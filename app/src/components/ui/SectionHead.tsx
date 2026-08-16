/**
 * The heading row a coach panel puts above its content: an `<h2>`, an optional
 * hint line under it, and a right-hand slot for a control, all baseline-aligned
 * so the title and whatever sits opposite it share one line.
 *
 * ## Why this is one component rather than three
 *
 * The reading, listening and writing copies were byte-identical, down to the
 * `flex flex-wrap items-baseline justify-between gap-2` wrapper and the
 * `mt-0.5 text-[12px] leading-5` hint. More to the point, this is the `<h2>` level
 * of the coach screens' heading outline — `Disclosure` puts its trigger in an
 * `<h3>` underneath it. A change to that level has to land in all three or the
 * document outline stops agreeing between skills, and a heading outline that
 * disagrees per room is a navigation bug for anyone reading by headings.
 *
 * Speaking's teaching layer has no copy of this and gains nothing from it; it is
 * deliberately not adopted there.
 */

import { type ReactNode } from "react";

export function SectionHead({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {hint && <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
