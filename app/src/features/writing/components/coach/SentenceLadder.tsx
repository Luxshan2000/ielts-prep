/**
 * The sentence ladder — one idea, four renderings, bands 5 to 8.
 *
 * This is where band 5 lives. A full band-5 model answer is the least imitable text
 * we could ship and the 5→6 difference is accuracy, which is legible in a single
 * sentence; so the floor of the ladder is one sentence rather than 170 words. The
 * step between each rung is labelled, because the whole point is that the content
 * never changes: 5→6 is accuracy, 6→7 is specificity and a more flexible structure,
 * 7→8 is density of relevant detail and consideration for the reader.
 */

import { ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { rungStep } from "./labels";
import { SectionHead } from "./primitives";
import type { SentenceLadder as SentenceLadderPayload } from "./types";

export function SentenceLadder({
  ladder,
  className,
}: {
  ladder: SentenceLadderPayload;
  className?: string;
}) {
  const rungs = (ladder.rungs ?? []).slice().sort((a, b) => a.band - b.band);
  if (rungs.length === 0) return null;

  return (
    <section className={cn("space-y-3", className)}>
      <SectionHead
        title="One idea, four bands"
        hint={
          ladder.idea
            ? `Every rung says the same thing: ${ladder.idea}`
            : "Every rung says the same thing. Only the language moves."
        }
      />
      <ol className="space-y-1">
        {rungs.map((rung, i) => (
          <li key={rung.band}>
            <div className="rounded-xl border border-border bg-card p-3.5">
              <Badge tone={rung.band >= 7 ? "primary" : "default"}>Band {rung.band}</Badge>
              <p className="mt-1.5 text-[14px] leading-7 text-foreground">{rung.text}</p>
            </div>
            {i < rungs.length - 1 && (
              <p className="flex items-center gap-2 py-1.5 pl-3.5 text-[12px] text-muted-foreground">
                <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  <span className="font-semibold text-foreground">
                    {rung.band} → {rungs[i + 1].band}:
                  </span>{" "}
                  {rungStep(rung.band)}
                </span>
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
