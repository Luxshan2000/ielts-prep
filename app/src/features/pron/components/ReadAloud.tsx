import { useCallback, useEffect, useState } from "react";
import { Ear, Info, RefreshCw } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { useRecorder } from "@/components/practice/useRecorder";
import { cn } from "@/lib/cn";
import { readAloud, type ReadAloudResult } from "../api";

/**
 * Read a sentence aloud and see which words the recogniser struggled to catch.
 *
 * The framing is the whole design. This method infers from ASR confidence, which falls for
 * rare words, proper nouns, background noise and — the case that decides how this screen is
 * written — speech that is accented and perfectly intelligible. So it never says a word was
 * *mispronounced*. It says the recogniser was unsure, which is true, and which turns the
 * result into a reason to listen again rather than a verdict.
 *
 * The accent notice is not decoration either: IELTS accepts every accent, and docs/09 §0
 * makes showing that a product requirement on every pronunciation screen.
 */

export interface ReadAloudProps {
  /** The sentence the learner is asked to say. */
  sentence: string;
  /** Where it came from, shown above the sentence — a word, a passage, a grammar point. */
  source?: string;
  className?: string;
}

export function ReadAloud({ sentence, source, className }: ReadAloudProps) {
  const recorder = useRecorder();
  const [result, setResult] = useState<ReadAloudResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // A new sentence means the last take is about something else. Leaving it on screen puts a
  // transcript of one sentence directly under another, which reads as a result for the
  // sentence being shown.
  useEffect(() => {
    setResult(null);
    setFailure(null);
  }, [sentence]);

  const run = useCallback(async () => {
    setResult(null);
    setFailure(null);
    const audio = await recorder.record(15);
    if (!audio) return;
    setBusy(true);
    try {
      setResult(await readAloud(audio, sentence));
    } catch (err) {
      setFailure(
        err instanceof Error && /503|speech_unavailable|unavailable/i.test(err.message)
          ? "Speech-to-text is not set up on this machine yet. You can turn it on in Settings."
          : "That recording could not be checked. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [recorder, sentence]);

  const recording = recorder.state === "recording";
  const unsure = result?.words_the_recogniser_was_unsure_of ?? [];
  /**
   * Whether speech-to-text ran at all. `recognised === false` means it did not, and the
   * result below is empty rather than perfect — saying "every word came through" there
   * would be praise for a recording nothing ever listened to.
   */
  const heard = result != null && result.recognised !== false;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ear className="h-4 w-4 text-primary" aria-hidden="true" />
          Read it aloud
        </CardTitle>
        {source && <p className="mt-0.5 text-[13px] text-muted-foreground">{source}</p>}
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="rounded-xl border border-border bg-muted/40 p-3 text-[15px] leading-relaxed">
          {sentence}
        </p>

        {/* Said before the learner speaks, not after. A learner who records first and
            reads the caveat afterwards has already spent the thirty seconds believing
            they were about to be marked. */}
        {!result && (
          <p className="flex items-start gap-1.5 rounded-lg bg-muted/50 p-2.5 text-[12px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Say it in your own accent, up to fifteen seconds. All this can tell you afterwards is
              which words the speech recogniser hesitated over. It does not score your
              pronunciation, and an accent is not a mistake.
            </span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => (recording ? recorder.stop() : void run())}
            disabled={busy}
            variant={recording ? "outline" : "primary"}
          >
            {recording ? `Stop${recorder.remaining != null ? ` (${recorder.remaining}s)` : ""}` : busy ? "Listening back…" : "Record"}
          </Button>
          {result && (
            <Button variant="ghost" size="sm" onClick={() => void run()} disabled={busy}>
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          )}
          {recording && (
            <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" aria-hidden="true" />
              Recording
            </span>
          )}
        </div>

        {(recorder.error || failure) && (
          <p className="text-[13px] text-warning" role="status">
            {failure ?? recorder.error}
          </p>
        )}

        {result && !heard && (
          <p className="rounded-lg border border-border bg-muted/50 p-2.5 text-[13px] leading-relaxed">
            {result.method_note ||
              "Your recording was saved, but this computer could not turn it into text yet."}
          </p>
        )}

        {result && heard && (
          <div className="space-y-2">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                What was heard
              </p>
              <p className="mt-0.5 text-[14px]">{result.transcript || "(nothing)"}</p>
            </div>

            {unsure.length > 0 ? (
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Words worth listening to again
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {unsure.map((word) => (
                    <Badge key={word.word} tone="outline" className="font-medium">
                      {word.word}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                The recogniser caught every word without hesitating.
              </p>
            )}

            {/* Says what the method can and cannot claim, in the learner's words. */}
            <p className="flex items-start gap-1.5 rounded-lg bg-muted/50 p-2.5 text-[12px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {result.method_note}
                {result.accent_notice ? ` ${result.accent_notice}` : ""}
              </span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Compact variant for embedding beside a vocabulary card or a grammar point. */
export function ReadAloudInline({ sentence, className }: { sentence: string; className?: string }) {
  return <ReadAloud sentence={sentence} className={cn("border-0 shadow-none", className)} />;
}
