/**
 * The visible/announced text alternative for a chart.
 *
 * One DOM node serves both audiences. Collapsed it is `sr-only` — off screen but
 * fully present in the accessibility tree, which is what `aria-describedby` on
 * the graphic points at, so a screen-reader candidate gets every figure without
 * pressing anything. Expanded it becomes an ordinary panel, which is what a
 * low-vision candidate, a candidate on a small screen and anyone checking a
 * figure they cannot read off the marks actually wants.
 *
 * Rendering it twice (once hidden, once visible) would read every number twice;
 * hiding it with `display:none` until expanded would remove it from the
 * accessibility tree and make the task unanswerable. Hence exactly this shape.
 */

import type { ChartDescription } from "./describe";

export interface ChartTextAlternativeProps {
  id: string;
  description: ChartDescription;
  expanded: boolean;
}

export function ChartTextAlternative({ id, description, expanded }: ChartTextAlternativeProps) {
  return (
    <div
      id={id}
      className={
        expanded
          ? "mt-3 space-y-3 rounded-xl border border-border bg-muted/40 p-3.5 text-[13px] leading-6"
          : "sr-only"
      }
    >
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        Text description of this visual
      </p>
      {description.blocks.map((block, index) => (
        <div key={index}>
          {block.heading && (
            <p className="font-semibold text-foreground">{block.heading}</p>
          )}
          {block.lines.length === 1 ? (
            <p className="text-muted-foreground">{block.lines[0]}</p>
          ) : (
            <ul className="ml-4 list-disc space-y-0.5 text-muted-foreground marker:text-border">
              {block.lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
