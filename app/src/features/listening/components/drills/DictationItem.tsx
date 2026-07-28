import { useEffect, useRef } from "react";
import { Badge, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ClipPlayer } from "./ClipPlayer";
import { BUCKET_TONE, TONE_CLASS } from "./labels";
import type { DiffEntry, DrillItem, Marking } from "./types";

/**
 * One line to transcribe: a clip, a box, and nothing to read.
 *
 * There is deliberately no prompt, no context sentence and no first letter. Dictation is
 * the one exercise in the module with *no* comprehension component — the task is to hear
 * the words — and every scaffold added to it turns some of the decoding into guessing.
 * The only hint offered is how many words the line has, because "count the words before you
 * write them" is itself the technique being trained: a learner who hears four words in a
 * seven-word chunk has a segmentation problem, and the number makes that visible.
 */
export function DictationItem({
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
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!disabled) boxRef.current?.focus();
  }, [item.item_id, disabled]);

  const typed = value.trim() ? value.trim().split(/\s+/).length : 0;
  const expected = item.words ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {item.speaker?.name && <Badge tone="outline">{item.speaker.name}</Badge>}
        {expected > 0 && (
          <span className="text-[13px] text-muted-foreground">
            {expected} words in this line
          </span>
        )}
      </div>

      <ClipPlayer
        mediaPath={item.audio?.media_path}
        clip={item.clip}
        resetKey={item.item_id}
        onReplay={onReplay}
        autoPlay
        label="Play the line"
        disabled={disabled}
      />

      <div className="space-y-1.5">
        <label htmlFor={`dictation-${item.item_id}`} className="block text-[13px] font-medium">
          Type every word you heard
        </label>
        <Textarea
          id={`dictation-${item.item_id}`}
          ref={boxRef}
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder="Punctuation is not marked — just the words."
          className="font-mono text-[14px]"
          // Autocorrect would silently fix exactly the misspellings the report is built to
          // find, so the box has to be dumber than the browser wants it to be.
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
        <p className="text-[12px] text-muted-foreground">
          {typed > 0 && expected > 0 ? (
            <>
              You have written {typed} of {expected}.{" "}
              {typed < expected
                ? "Play it again and listen for the small words — they are the ones that vanish."
                : "Read it back against the audio before you commit."}
            </>
          ) : (
            "Replay it as many times as you like. This is decoding practice, not a memory test."
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * The word-level diff, colour-coded by diagnosis.
 *
 * Displaying the *reference* line rather than what the learner typed is the whole design:
 * the learner needs to see the sentence that was actually said, with their own losses marked
 * on it in place. A misspelling is drawn as a warning rather than an error, because they
 * heard it — the exam zero is stated in words underneath instead of implied by the colour.
 */
export function DictationDiff({ marking }: { marking: Marking }) {
  const diff = marking.diff ?? [];
  if (diff.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="font-mono text-[14px] leading-7">
        {diff.map((entry, index) => (
          <DiffToken key={`${entry.op}-${entry.index}-${index}`} entry={entry} />
        ))}
      </p>
      <p className="text-[13px] font-medium">{marking.headline}</p>
      {(marking.heard ?? 0) > (marking.exact ?? 0) && (
        <p className="text-[13px] text-warning">
          {(marking.heard ?? 0) - (marking.exact ?? 0)} of those you heard correctly and
          spelled wrongly. On the answer sheet that is worth the same as not hearing it at
          all — and it is an orthography fix, not a listening one.
        </p>
      )}
    </div>
  );
}

function DiffToken({ entry }: { entry: DiffEntry }) {
  const tone = entry.bucket ? BUCKET_TONE[entry.bucket] : "ok";
  if (entry.op === "equal") {
    return <span className="text-foreground">{entry.reference} </span>;
  }
  if (entry.op === "ins") {
    return (
      <span className={cn(TONE_CLASS.extra)} title="You wrote this; it is not in the recording">
        {entry.given}{" "}
      </span>
    );
  }
  if (entry.op === "del") {
    return (
      <span className={cn(TONE_CLASS[tone ?? "miss"])} title="You did not write this">
        {entry.reference}{" "}
      </span>
    );
  }
  return (
    <span className={cn(TONE_CLASS[tone ?? "miss"])} title={`You wrote “${entry.given}”`}>
      {entry.reference}{" "}
    </span>
  );
}
