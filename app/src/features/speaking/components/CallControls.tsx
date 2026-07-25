/**
 * The live call's primary controls: one large round hang-up/connect target plus the
 * mute toggle. Both are real buttons with labels, so the whole call is operable from
 * the keyboard (12 §11).
 */

import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface CallControlsProps {
  /** "connecting" locks the control; "live" turns it into hang-up. */
  state: "idle" | "connecting" | "live" | "ending";
  micEnabled: boolean;
  onToggleMic: () => void;
  onConnect: () => void;
  onEnd: () => void;
  /** Copy for the button under the round control ("End test" vs "End chat"). */
  endLabel?: string;
  className?: string;
}

export function CallControls({
  state,
  micEnabled,
  onToggleMic,
  onConnect,
  onEnd,
  endLabel = "End session",
  className,
}: CallControlsProps) {
  const busy = state === "connecting" || state === "ending";
  const live = state === "live";

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <button
        type="button"
        onClick={live ? onEnd : onConnect}
        disabled={busy}
        aria-label={live ? endLabel : "Connect to the examiner"}
        className={cn(
          "flex h-24 w-24 items-center justify-center rounded-full shadow-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-70",
          live
            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {busy ? (
          <Spinner className="h-7 w-7" />
        ) : live ? (
          <PhoneOff className="h-8 w-8" aria-hidden="true" />
        ) : (
          <Phone className="h-8 w-8" aria-hidden="true" />
        )}
      </button>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant={micEnabled ? "outline" : "destructive"}
          size="sm"
          onClick={onToggleMic}
          disabled={!live}
          aria-pressed={!micEnabled}
        >
          {micEnabled ? (
            <>
              <Mic className="h-4 w-4" />
              Mute
            </>
          ) : (
            <>
              <MicOff className="h-4 w-4" />
              Unmute
            </>
          )}
        </Button>
        {live && (
          <Button variant="ghost" size="sm" onClick={onEnd}>
            {endLabel}
          </Button>
        )}
      </div>

      <p className="text-[12px] text-muted-foreground">
        {state === "connecting"
          ? "Connecting to your examiner…"
          : state === "ending"
            ? "Ending the session…"
            : live
              ? "Speak normally. The examiner takes over when you stop."
              : "Press connect to join the examiner."}
      </p>
    </div>
  );
}
