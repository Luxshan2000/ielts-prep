import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Mic, Square } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { useRecorder } from "@/components/practice/useRecorder";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

/**
 * One placement answer, spoken or typed.
 *
 * The section is called Speaking and used to hand the learner a text box, explaining in a
 * card *underneath* that it scores language rather than delivery. That reads as a bait: you
 * are told to speak and given somewhere to type, and the reason arrives after the confusion.
 *
 * So the microphone is offered first when it can work, and when it cannot the screen says why
 * in one line before the box, rather than justifying itself afterwards. A transcript lands in
 * the same textarea and stays editable — the recogniser is the likeliest thing to be wrong,
 * and a learner who can see and fix what it heard is not at its mercy.
 *
 * Typing is never removed. At placement the microphone and the voice models are usually not
 * set up yet — that is what onboarding is for — so a spoken-only step would be a wall across
 * the one flow that must not have one.
 */

export interface SpokenAnswerFieldProps {
  question: string;
  index: number;
  value: string;
  onChange: (next: string) => void;
  /** Null while unknown, so the button is not drawn and then withdrawn. */
  canRecord: boolean | null;
  disabled?: boolean;
}

export function SpokenAnswerField({
  question,
  index,
  value,
  onChange,
  canRecord,
  disabled = false,
}: SpokenAnswerFieldProps) {
  const recorder = useRecorder();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const speak = useCallback(async () => {
    setFailure(null);
    const audio = await recorder.record(45);
    if (!audio) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("wav", audio, "answer.webm");
      const heard = await api.post<{ transcript: string; gradeable: boolean; refusal: string | null }>(
        "/api/v1/speech/transcribe",
        form,
      );
      if (!heard.gradeable) {
        setFailure(heard.refusal ?? "Nothing was picked up. Try again, or type your answer.");
        return;
      }
      // Appended rather than replacing: somebody who spoke twice should keep both takes.
      onChange(value.trim() ? `${value.trim()} ${heard.transcript}` : heard.transcript);
    } catch {
      setFailure("That recording could not be read. Type your answer instead.");
    } finally {
      setBusy(false);
    }
  }, [recorder, onChange, value]);

  const recording = recorder.state === "recording";

  return (
    <li className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="tabular text-[13px] font-semibold text-muted-foreground">{index + 1}.</span>
        <span className="min-w-0 flex-1 text-[13px] text-foreground">{question}</span>
      </div>

      <div className="ml-6 w-[calc(100%-1.5rem)] space-y-2">
        {canRecord && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={recording ? "outline" : "secondary"}
              disabled={disabled || busy}
              onClick={() => (recording ? recorder.stop() : void speak())}
            >
              {recording ? (
                <>
                  <Square className="h-4 w-4" />
                  Stop{recorder.remaining != null ? ` (${recorder.remaining}s)` : ""}
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" />
                  {busy ? "Writing it down…" : value.trim() ? "Say more" : "Answer out loud"}
                </>
              )}
            </Button>
            {recording && (
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" aria-hidden="true" />
                Listening
              </span>
            )}
            <span className="text-[12px] text-muted-foreground">or type below</span>
          </div>
        )}

        <Textarea
          className="min-h-[80px]"
          aria-label={`Your answer to question ${index + 1}`}
          placeholder={canRecord ? "Speak, or write two or three sentences…" : "Two or three sentences…"}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />

        {(recorder.error || failure) && (
          <p className={cn("flex items-start gap-1.5 text-[13px] text-warning")} role="status">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {failure ?? recorder.error}
          </p>
        )}
      </div>
    </li>
  );
}

/** Whether this machine can turn speech into text, asked once per sitting. */
export function useCanRecord(): boolean | null {
  const [can, setCan] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ transcription: boolean }>("/api/v1/speech/capabilities")
      .then((r) => !cancelled && setCan(Boolean(r.transcription)))
      .catch(() => !cancelled && setCan(false));
    return () => {
      cancelled = true;
    };
  }, []);
  return can;
}
