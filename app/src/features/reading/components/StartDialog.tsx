import { useEffect, useState } from "react";
import { Button, Field, Modal, Select } from "@/components/ui";
import { formatDuration } from "@/lib/format";

export interface StartOptions {
  examConditions: boolean;
  /** `null` means untimed practice — the player counts up and never auto-submits. */
  timerS: number | null;
}

export interface StartDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  /** The sidecar's default for this mode (3600 full, 1200 single passage). */
  defaultTimer: number;
  starting: boolean;
  error: string | null;
  onStart: (options: StartOptions) => void;
}

/**
 * Pre-flight for a timed attempt: how long, and whether exam conditions apply.
 * Exam conditions disable pausing and the dictionary popover (06 §5), so the
 * consequence is spelled out here rather than discovered mid-test.
 */
export function StartDialog({
  open,
  onClose,
  title,
  description,
  defaultTimer,
  starting,
  error,
  onStart,
}: StartDialogProps) {
  const [examConditions, setExamConditions] = useState(false);
  const [timer, setTimer] = useState<string>("standard");

  useEffect(() => {
    if (open) {
      setExamConditions(false);
      setTimer("standard");
    }
  }, [open]);

  const timerSeconds =
    timer === "untimed" ? null : timer === "extra" ? Math.round(defaultTimer * 1.25) : defaultTimer;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={starting}>
            Cancel
          </Button>
          <Button loading={starting} onClick={() => onStart({ examConditions, timerS: timerSeconds })}>
            Start
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        <p className="text-[13px] text-muted-foreground">{description}</p>

        <Field label="Time limit" hint="The attempt submits itself automatically at zero.">
          <Select
            aria-label="Time limit"
            value={timer}
            onChange={setTimer}
            options={[
              { value: "standard", label: `Exam timing — ${formatDuration(defaultTimer)}` },
              {
                value: "extra",
                label: `25% extra time — ${formatDuration(Math.round(defaultTimer * 1.25))}`,
              },
              { value: "untimed", label: "Untimed practice — count up instead" },
            ]}
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 focus-within:ring-2 focus-within:ring-ring">
          <input
            type="checkbox"
            checked={examConditions}
            onChange={(event) => setExamConditions(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-foreground">Exam conditions</span>
            <span className="block text-[11px] text-muted-foreground">
              No pausing, and the dictionary popover is switched off — words you double-click are
              queued for after you submit. Highlights and notes stay available, exactly as in
              computer-delivered IELTS.
            </span>
          </span>
        </label>

        {error && <p className="text-[13px] text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}
