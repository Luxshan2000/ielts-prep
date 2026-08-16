import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ClipPlayer } from "./ClipPlayer";
import { DictationDiff } from "./DictationItem";
import { VERDICT_LABEL, formatMs } from "./labels";
import type { ItemResult } from "./types";

/**
 * What opens once the answer is in — and never before.
 *
 * Nothing on this card exists in the item the learner answered: the sidecar assembles the
 * whole payload at grading time, so there is no flag a client could flip to read the key
 * early. That is the same standard the mock is held to, applied to the drills.
 *
 * **Every reveal ends with the sound, not with the sentence.** The rule the review research
 * is clearest about is that a learner must never leave a wrong answer without hearing the
 * moment again: reading an explanation of what was said converts an unanalysable failure
 * into a *believed* explanation, which is not the same thing. So each card carries a replay
 * of the exact window the answer lived in, and the text sits underneath it.
 */
export function RevealCard({ result, mediaPath }: { result: ItemResult; mediaPath?: string | null }) {
  const { marking, reveal } = result;
  const correct = result.correct;

  return (
    <div
      className={cn(
        "space-y-4 rounded-xl border p-4",
        correct ? "border-success/40 bg-success/8" : "border-border bg-muted/20",
      )}
    >
      <div className="flex items-center gap-2">
        {correct ? (
          <Check className="h-4 w-4 text-success" aria-hidden="true" />
        ) : (
          <X className="h-4 w-4 text-destructive" aria-hidden="true" />
        )}
        <span className="text-[13px] font-semibold">
          {headline(result)}
        </span>
      </div>

      {result.kind === "dictation" && <DictationDiff marking={marking} />}

      {result.kind === "numbers" && <NumbersReveal result={result} />}

      {result.kind === "signpost" && <SignpostReveal result={result} />}

      {result.kind === "prediction" && <PredictionReveal result={result} />}

      {reveal.replay && mediaPath && (
        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
            Hear it again
          </p>
          <ClipPlayer
            mediaPath={mediaPath}
            clip={reveal.replay}
            resetKey={`${result.item_id}-reveal`}
            label="Play that moment"
          />
        </div>
      )}
    </div>
  );
}

function headline(result: ItemResult): string {
  if (result.kind === "dictation") {
    const { heard = 0, total = 0 } = result.marking;
    return `${heard} of ${total} words`;
  }
  if (result.kind === "signpost" && result.mode === "cue") {
    return VERDICT_LABEL[result.marking.verdict ?? "no_press"] ?? "Marked";
  }
  return result.correct ? "Correct" : "Not this time";
}

function NumbersReveal({ result }: { result: ItemResult }) {
  const { marking, reveal } = result;
  return (
    <div className="space-y-3 text-[13px]">
      <p>
        <span className="text-muted-foreground">You wrote</span>{" "}
        <span className="font-mono">{String(marking.given || "nothing")}</span>
        {"  ·  "}
        <span className="text-muted-foreground">The answer is</span>{" "}
        <span className="font-mono font-semibold">{String(marking.key ?? "-")}</span>
      </p>
      {marking.near_miss_spelling && (
        <p className="text-warning">
          You heard it. One or two letters out is still zero marks on the sheet. This is a
          spelling fix, and no amount of listening practice will close it.
        </p>
      )}
      {marking.over_limit && (
        <p className="text-warning">
          Too many words for the instruction. The content was right and the mark is gone.
        </p>
      )}
      {reveal.quote && (
        <p>
          <span className="text-muted-foreground">The speaker said</span>{" "}
          <span className="italic">"{reveal.quote}"</span>
        </p>
      )}
      {reveal.form?.note && (
        <p className="rounded-md bg-background/60 p-2">
          <Badge tone="warning" className="mr-2">
            Form
          </Badge>
          {reveal.form.note}
        </p>
      )}
      {reveal.distraction && (
        <p className="rounded-md bg-background/60 p-2">
          <Badge tone="destructive" className="mr-2">
            Decoy
          </Badge>
          The audio also offered <span className="font-mono">{reveal.distraction.decoy}</span>,
          signalled by "{reveal.distraction.signal}". {reveal.distraction.note}
        </p>
      )}
      {reveal.explanation && <p className="text-muted-foreground">{reveal.explanation}</p>}
    </div>
  );
}

function SignpostReveal({ result }: { result: ItemResult }) {
  const { marking, reveal } = result;
  const cue = result.mode === "cue";
  return (
    <div className="space-y-3 text-[13px]">
      {reveal.phrase && (
        <p>
          <span className="text-muted-foreground">The marker was</span>{" "}
          <span className="font-semibold">"{reveal.phrase}"</span>
        </p>
      )}
      {reveal.kind_info && (
        <p>
          <Badge className="mr-2">{reveal.kind_info.name}</Badge>
          {reveal.kind_info.prompt}
        </p>
      )}
      {cue && marking.offset_ms != null && (
        <p className={marking.correct ? "text-success" : "text-destructive"}>
          Your press landed {formatMs(marking.offset_ms)} from the moment the answer began.
        </p>
      )}
      {marking.note && <p className="text-muted-foreground">{marking.note}</p>}
      {reveal.line_text && (
        <p className="rounded-md bg-background/60 p-2 italic">"{reveal.line_text}"</p>
      )}
    </div>
  );
}

function PredictionReveal({ result }: { result: ItemResult }) {
  const { marking, reveal } = result;
  return (
    <div className="space-y-3 text-[13px]">
      <p>
        <span className="text-muted-foreground">You said</span>{" "}
        <span className="font-medium">{marking.chosen_info?.name ?? "nothing"}</span>
        {"  ·  "}
        <span className="text-muted-foreground">It is</span>{" "}
        <span className="font-semibold">{marking.key_info?.name ?? "-"}</span>
      </p>
      {reveal.cue && (
        <p>
          <span className="text-muted-foreground">The word that decides it:</span>{" "}
          <span className="rounded bg-primary/12 px-1 font-mono text-primary">{reveal.cue}</span>
          {reveal.range && (
            <>
              {"  ·  "}
              <span className="text-muted-foreground">plausible range</span>{" "}
              <span className="font-mono">{reveal.range}</span>
            </>
          )}
        </p>
      )}
      {reveal.note && <p className="font-medium">{reveal.note}</p>}
      {marking.note && <p className="text-muted-foreground">{marking.note}</p>}
      {marking.key_info?.hazard && (
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Where this one goes wrong: </span>
          {marking.key_info.hazard}
        </p>
      )}
      {reveal.paraphrase_link && (
        <p className="rounded-md bg-background/60 p-2">
          <Badge tone="primary" className="mr-2">
            Paraphrase
          </Badge>
          The page says "{reveal.paraphrase_link.printed}". The speaker said "
          {reveal.paraphrase_link.audio}". In listening the printed question is the
          paraphrase and the audio is the original. Waiting for the printed word is how an
          answer goes past with no feeling of difficulty at all.
        </p>
      )}
      {reveal.form?.note && (
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Form: </span>
          {reveal.form.note}
        </p>
      )}
    </div>
  );
}
