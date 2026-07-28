import { useCallback, useEffect, useRef, useState } from "react";
import { Hand } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ClipPlayer, type ClipPlayerHandle } from "./ClipPlayer";
import type { DrillItem } from "./types";

/**
 * Signposts: the words that announce an answer is coming.
 *
 * `recognise` plays the marker and asks what kind of thing follows it. Four options, all of
 * them kinds this same recording really uses, so the choice is between things that plausibly
 * happen here rather than between one plausible answer and three absurdities.
 *
 * `cue` is the one that trains the reflex rather than the label. A longer stretch plays, and
 * the learner presses a single button the instant they think the answer is starting to
 * arrive. There is no undo and no scrubber, because the whole skill is committing under
 * time — the press is scored against where the answer really began, with a window that is
 * forgiving early and tight late. Pressing early means you heard the marker and got ready,
 * which is the behaviour; pressing late means you reacted to the answer itself, which is the
 * behaviour that also loses the next question.
 *
 * The marker is never shown as text before the answer. A signpost you can read is a reading
 * exercise, and the server does not send it.
 */
export function SignpostItem({
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
  const playerRef = useRef<ClipPlayerHandle | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [pressed, setPressed] = useState<number | null>(null);
  const isCue = item.mode === "cue";

  useEffect(() => {
    setPressed(null);
    setElapsed(0);
  }, [item.item_id]);

  const press = useCallback(() => {
    if (disabled || !item.clip) return;
    const position = playerRef.current?.position();
    if (position == null) return;
    // The press is reported in absolute file milliseconds, because that is the frame the
    // authored signpost position lives in; the clip's own offset is added back here rather
    // than being something the server has to guess at.
    const absolute = Math.round(item.clip.start_ms + position);
    setPressed(absolute);
    onChange(String(absolute));
  }, [disabled, item.clip, onChange]);

  // Space is the natural key for "now", and a learner watching the progress bar should not
  // have to move a mouse to hit a moment.
  useEffect(() => {
    if (!isCue || disabled) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "BUTTON"].includes(target.tagName)) return;
      event.preventDefault();
      press();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isCue, disabled, press]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="outline">Part {item.part}</Badge>
        {item.question_number != null && (
          <Badge tone="outline">Around question {item.question_number}</Badge>
        )}
      </div>

      <p className="text-[13px] text-muted-foreground">
        {isCue
          ? "Listen, and press the moment you think an answer is starting to arrive. Early is fine — that means you heard the marker."
          : "Listen to the marker. What kind of thing is the speaker about to do?"}
      </p>

      <ClipPlayer
        ref={playerRef}
        mediaPath={item.audio?.media_path}
        clip={item.clip}
        resetKey={item.item_id}
        onReplay={onReplay}
        onTick={setElapsed}
        autoPlay
        label={isCue ? "Play the stretch" : "Play the marker"}
        disabled={disabled}
      />

      {isCue ? (
        <div className="space-y-2">
          <Button
            type="button"
            variant={pressed == null ? "primary" : "outline"}
            onClick={press}
            disabled={disabled}
            className="w-full sm:w-auto"
          >
            <Hand className="h-4 w-4" />
            {pressed == null ? "Now — the answer is coming" : "Move my mark"}
          </Button>
          <p className="text-[12px] text-muted-foreground">
            {pressed == null ? (
              <>
                Press the button (or the space bar) while it is playing.{" "}
                {elapsed > 0 && <span className="tabular-nums">{(elapsed / 1000).toFixed(1)}s in</span>}
              </>
            ) : (
              <>
                Marked at {((pressed - (item.clip?.start_ms ?? 0)) / 1000).toFixed(1)}s into
                the clip. Play it again to move your mark.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {(item.options ?? []).map((option) => (
            <button
              key={option.slug}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.slug)}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                value === option.slug
                  ? "border-primary bg-primary/8 font-medium"
                  : "border-border hover:bg-muted/40",
                disabled && "opacity-60",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
