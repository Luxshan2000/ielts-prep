import { useEffect, useRef } from "react";
import { Badge, Input } from "@/components/ui";
import { ClipPlayer } from "./ClipPlayer";
import type { DrillItem } from "./types";

/**
 * The answers that are pure transcription: a spelled name, a price, a date, a code.
 *
 * Two modes, and the second one is the interesting half.
 *
 * `transcribe` plays the line the answer was spoken in and asks for the answer. That is the
 * exam task, compressed to five seconds.
 *
 * `form` plays nothing. It shows what the speaker *said* — "eighty-five pounds fifty for the
 * day" — and asks what goes in the box. This is the half of the mark that hearing does not
 * cover: the learner who writes `eighty-five pounds fifty` into a gap with `£` printed in
 * front of it has understood everything and scored zero. It also costs no audio at all, so
 * it works on a part that has never been rendered.
 *
 * The printed question frame is shown in both modes because the frame is where the
 * constraint lives — the unit already on the page, the word limit, the determiner. Removing
 * it would make the drill harder than the exam in a way that teaches nothing.
 */
export function NumbersItem({
  item,
  value,
  onChange,
  onReplay,
  disabled,
}: {
  item: DrillItem;
  value: string;
  onChange: (next: string) => void;
  onReplay?: (count: number) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [item.item_id, disabled]);

  const isForm = item.mode === "form";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="outline">Question {item.number}</Badge>
        {item.slot_info && <Badge>{item.slot_info.name}</Badge>}
        {item.spelled && <Badge tone="warning">Spelled out loud</Badge>}
      </div>

      {item.prompt && (
        <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 font-sans text-[13px] leading-relaxed">
          {item.prompt}
        </pre>
      )}

      {isForm ? (
        <div className="rounded-lg border border-border p-3">
          <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
            What the speaker said
          </p>
          <p className="mt-1 text-[15px] italic">“{item.quote}”</p>
        </div>
      ) : (
        <ClipPlayer
          mediaPath={item.audio?.media_path}
          clip={item.clip}
          resetKey={item.item_id}
          onReplay={onReplay}
          autoPlay
          label="Play the answer line"
          disabled={disabled}
        />
      )}

      <div className="space-y-1.5">
        <label htmlFor={`numbers-${item.item_id}`} className="block text-[13px] font-medium">
          {isForm ? "Write what goes in the box" : "Write the answer"}
        </label>
        <Input
          id={`numbers-${item.item_id}`}
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="max-w-sm font-mono"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          placeholder={item.instruction ?? ""}
        />
        <p className="text-[12px] text-muted-foreground">
          {item.instruction}
          {" — "}
          spelling is marked exactly here, exactly as it is in the test. Capitals are not.
        </p>
      </div>
    </div>
  );
}
