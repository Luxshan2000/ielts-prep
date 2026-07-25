/**
 * Live transcript pane. Collapsible and hidden by default during scored modes —
 * reading your own words mid-test is not exam conditions (02 §6.3) — but never
 * removed, because captions are an accessibility requirement (12 §11).
 */

import { useEffect, useRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, TranscriptBubble } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface FeedTurn {
  id: string;
  role: "examiner" | "candidate";
  text: string;
  tMs: number;
  pending?: boolean;
}

export interface TranscriptFeedProps {
  turns: FeedTurn[];
  visible: boolean;
  onToggle: () => void;
  className?: string;
}

export function TranscriptFeed({ turns, visible, onToggle, className }: TranscriptFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns, visible]);

  return (
    <div className={cn("rounded-xl border border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">Live transcript</h2>
        <Button size="sm" variant="ghost" onClick={onToggle} aria-pressed={visible}>
          {visible ? (
            <>
              <EyeOff className="h-4 w-4" />
              Hide
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" />
              Show
            </>
          )}
        </Button>
      </div>

      {visible ? (
        <div
          ref={scrollRef}
          aria-live="polite"
          className="scrollbar-thin flex max-h-72 flex-col gap-3 overflow-y-auto p-4"
        >
          {turns.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              The transcript appears here as soon as the examiner speaks.
            </p>
          ) : (
            turns.map((turn) => (
              <TranscriptBubble
                key={turn.id}
                role={turn.role}
                text={turn.text}
                tMs={turn.tMs}
                pending={turn.pending}
              />
            ))
          )}
        </div>
      ) : (
        <p className="px-4 py-3 text-[13px] text-muted-foreground">
          Hidden so the test feels like the real thing. Everything is recorded and shown in your
          report.
        </p>
      )}
    </div>
  );
}
