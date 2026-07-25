import { useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useWordAudio } from "./useWordAudio";

export interface WordAudioButtonProps {
  /** Sidecar-relative media path, e.g. `/api/v1/media/vocab/ve_x.wav`. */
  mediaPath: string | null;
  /** Spoken when no rendered file exists. */
  text: string;
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "outline" | "secondary";
  label?: string;
  /** Play once as soon as the button mounts (audio-recall exercise). */
  autoPlay?: boolean;
  className?: string;
}

/**
 * Plays a headword. Falls back to the platform voice, and says so plainly when
 * neither is possible — never a button that silently does nothing.
 */
export function WordAudioButton({
  mediaPath,
  text,
  size = "md",
  variant = "outline",
  label,
  autoPlay = false,
  className,
}: WordAudioButtonProps) {
  const { status, play } = useWordAudio(mediaPath, text);

  useEffect(() => {
    if (!autoPlay) return;
    void play();
  }, [autoPlay, play]);

  const unavailable = status === "unavailable";
  const tip = unavailable
    ? "This computer has no speech voice installed, so the word cannot be played."
    : label
      ? undefined
      : "Play the word";

  const button = (
    <Button
      type="button"
      variant={unavailable ? "ghost" : variant}
      size={label ? (size === "lg" ? "lg" : "sm") : "icon"}
      onClick={() => void play()}
      disabled={status === "loading" || unavailable}
      aria-label={label ?? "Play the word"}
      className={cn(status === "playing" && "text-primary", className)}
    >
      {unavailable ? (
        <VolumeX className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Volume2 className={cn("h-4 w-4", status === "playing" && "animate-pulse")} aria-hidden="true" />
      )}
      {label}
    </Button>
  );

  return tip ? (
    <Tooltip content={tip}>
      <span className="inline-flex">{button}</span>
    </Tooltip>
  ) : (
    button
  );
}
