/**
 * The two live tiles (12 §6.2 B / §10): the examiner tile animates its waveform while
 * the bot speaks, the candidate tile gets a pulsing mic ring while the learner speaks.
 *
 * Turn-taking is stated in words as well as motion — "Examiner is speaking" /
 * "Listening — your turn" — because colour and animation are never the only encoding.
 */

import { Ear, Mic, MicOff, User } from "lucide-react";
import { AudioWaveform, Badge } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface CallStageTilesProps {
  botSpeaking: boolean;
  botLevel: number;
  userSpeaking: boolean;
  userLevel: number;
  micEnabled: boolean;
  connected: boolean;
  className?: string;
}

export function CallStageTiles({
  botSpeaking,
  botLevel,
  userSpeaking,
  userLevel,
  micEnabled,
  connected,
  className,
}: CallStageTilesProps) {
  const turn = !connected
    ? "Waiting for the examiner"
    : botSpeaking
      ? "Examiner is speaking"
      : !micEnabled
        ? "Your microphone is muted"
        : userSpeaking
          ? "You are speaking"
          : "Listening, your turn";

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Examiner */}
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors",
            botSpeaking ? "border-primary/60 bg-primary/5" : "border-border",
          )}
        >
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              botSpeaking ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            <Ear className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">Examiner</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {botSpeaking ? "Speaking" : connected ? "Waiting for you" : "Not connected"}
            </p>
          </div>
          <AudioWaveform
            level={botLevel}
            active={botSpeaking}
            bars={5}
            status={botSpeaking ? "Examiner is speaking" : "Examiner is silent"}
          />
        </div>

        {/* Candidate */}
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors",
            userSpeaking && micEnabled ? "border-success/60 bg-success/5" : "border-border",
          )}
        >
          <span
            className={cn(
              "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              !micEnabled
                ? "bg-destructive/12 text-destructive"
                : userSpeaking
                  ? "bg-success/15 text-success"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {micEnabled ? (
              <User className="h-4 w-4" aria-hidden="true" />
            ) : (
              <MicOff className="h-4 w-4" aria-hidden="true" />
            )}
            {micEnabled && userSpeaking && (
              <span
                className="absolute inset-0 animate-recording-pulse rounded-full ring-2 ring-success"
                aria-hidden="true"
              />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">You</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {!micEnabled ? "Muted" : userSpeaking ? "Speaking" : "Microphone open"}
            </p>
          </div>
          <AudioWaveform
            level={userLevel}
            active={micEnabled && (userSpeaking || userLevel > 0.05)}
            bars={5}
            status={micEnabled ? "Your microphone is live" : "Your microphone is muted"}
          />
        </div>
      </div>

      <p className="flex items-center justify-center gap-2 text-[13px]">
        <Mic className={cn("h-3.5 w-3.5", botSpeaking ? "text-muted-foreground" : "text-primary")} aria-hidden="true" />
        <Badge tone={botSpeaking ? "default" : connected ? "primary" : "outline"}>{turn}</Badge>
      </p>
    </div>
  );
}
