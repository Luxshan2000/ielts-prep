/**
 * Collapsible planning pad (05 §3). Persisted with the draft as `outline_text`,
 * excluded from the word count, and passed to the evaluator only so it can say
 * whether the plan was executed — never scored on its own.
 */

import { useId } from "react";
import { ChevronDown, NotebookPen } from "lucide-react";
import { Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface OutlineScratchpadProps {
  value: string;
  onChange: (value: string) => void;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function OutlineScratchpad({
  value,
  onChange,
  open,
  onToggle,
  disabled = false,
}: OutlineScratchpadProps) {
  const id = useId();
  const lines = value.trim() ? value.trim().split(/\n+/).length : 0;

  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-left text-[13px] font-medium text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <NotebookPen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1">Outline scratchpad</span>
        {lines > 0 && !open && (
          <span className="text-[11px] text-muted-foreground">
            {lines} {lines === 1 ? "line" : "lines"}
          </span>
        )}
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={id} className="px-3.5 pb-3.5">
          <Textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            spellCheck={false}
            rows={6}
            placeholder={"Intro: paraphrase + position\nBody 1: …\nBody 2: …\nConclusion: …"}
            aria-label="Outline scratchpad"
            className="min-h-[120px] resize-y font-mono text-[13px] leading-6"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Planning notes are saved with your draft and never counted or scored as part of your
            answer.
          </p>
        </div>
      )}
    </section>
  );
}
