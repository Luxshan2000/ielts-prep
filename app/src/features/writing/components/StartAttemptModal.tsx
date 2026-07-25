/**
 * Prompt preview + mode choice. Mode is fixed at attempt creation (05 §3) and the
 * difference is real, so it is spelled out here rather than buried in a toggle.
 */

import { useState } from "react";
import { GraduationCap, PenLine } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { cn } from "@/lib/cn";
import { TASK_LABELS, type AttemptMode, type WritingPrompt } from "../store";
import { PromptPanel } from "./PromptPanel";

export interface StartAttemptModalProps {
  prompt: WritingPrompt | null;
  starting: boolean;
  error?: string | null;
  onClose: () => void;
  onStart: (mode: AttemptMode) => void;
}

const MODES: {
  value: AttemptMode;
  label: string;
  icon: typeof PenLine;
  points: string[];
}[] = [
  {
    value: "practice",
    label: "Practice",
    icon: PenLine,
    points: [
      "Counts up, no time limit",
      "Spellcheck on, phrase help available",
      "Marked the same way",
    ],
  },
  {
    value: "exam",
    label: "Exam conditions",
    icon: GraduationCap,
    points: [
      "Counts down; overtime is recorded",
      "No spellcheck, no phrase help",
      "What the curriculum counts for mastery",
    ],
  },
];

export function StartAttemptModal({
  prompt,
  starting,
  error,
  onClose,
  onStart,
}: StartAttemptModalProps) {
  const [mode, setMode] = useState<AttemptMode>("practice");
  const minutes = prompt?.time_limit_s ? Math.round(prompt.time_limit_s / 60) : null;

  return (
    <Modal
      open={prompt !== null}
      onClose={onClose}
      size="xl"
      title={prompt ? TASK_LABELS[prompt.task_type] : "Start writing"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={starting}>
            Cancel
          </Button>
          <Button loading={starting} onClick={() => onStart(mode)}>
            Start {mode === "exam" ? "under exam conditions" : "practice"}
          </Button>
        </>
      }
    >
      {prompt && (
        <div className="space-y-5 p-5">
          <PromptPanel prompt={prompt} />

          <fieldset className="space-y-2">
            <legend className="mb-2 text-[13px] font-medium text-foreground">How do you want to write it?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODES.map((option) => {
                const Icon = option.icon;
                const active = mode === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "cursor-pointer rounded-xl border p-3.5 transition-colors",
                      "focus-within:ring-2 focus-within:ring-ring",
                      active ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="writing-mode"
                        value={option.value}
                        checked={active}
                        onChange={() => setMode(option.value)}
                        className="sr-only"
                      />
                      <Icon
                        className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")}
                        aria-hidden="true"
                      />
                      <span className="text-[13px] font-semibold text-foreground">{option.label}</span>
                      {option.value === "exam" && minutes && (
                        <span className="ml-auto text-[11px] text-muted-foreground">{minutes} min</span>
                      )}
                    </span>
                    <ul className="mt-2 space-y-1">
                      {option.points.map((point) => (
                        <li key={point} className="text-[12px] leading-5 text-muted-foreground">
                          {point}
                        </li>
                      ))}
                    </ul>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
