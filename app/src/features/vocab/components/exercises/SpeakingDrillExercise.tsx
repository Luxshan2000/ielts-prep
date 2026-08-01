import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Mic } from "lucide-react";
import { Badge } from "@/components/ui";
import { WordAudioButton } from "../WordAudioButton";
import { ReadAloud } from "@/features/pron/components/ReadAloud";
import { ChipList, Section, type ExerciseBodyProps } from "./shared";
import type { SpeakingDrillPayload } from "../../types";

/**
 * §5.2.6 speaking drill: say the word in a full sentence, out loud, before you
 * rate yourself. Nothing is recorded here — the same word is also handed to the
 * live examiner as a prompt hint, which is what `payload.injection` is for.
 */
export function SpeakingDrillExercise({ item, revealed, onCommit }: ExerciseBodyProps) {
  const payload = item.exercise.payload as SpeakingDrillPayload;
  const committed = useRef(false);
  // The authored context sentence if there is one, else the first example. Both are written
  // to show the word doing its job, which is what makes them worth saying.
  const modelSentence =
    item.entry.own_context_sentence?.trim() || item.entry.example_sentences[0]?.trim() || null;

  useEffect(() => {
    if (!revealed || committed.current) return;
    committed.current = true;
    onCommit({
      correct: null,
      suggestedRating: null,
      detail: "Rate how fluent that felt — nothing was recorded.",
    });
  }, [revealed, onCommit]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-2xl font-semibold tracking-tight">{payload.headword}</p>
          <p className="text-[13px] text-muted-foreground">
            {payload.definition || "No definition yet."}
          </p>
        </div>
        <WordAudioButton mediaPath={item.entry.audio_url} text={payload.headword} />
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-4">
        <Mic className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Say one full sentence using it, out loud.</p>
          <p className="text-[12px] text-muted-foreground">
            You still rate yourself — a recogniser cannot tell you whether the sentence was a
            good one.{" "}
            <Link
              to="/speaking"
              className="text-primary underline decoration-primary/40 hover:decoration-primary"
            >
              Start a Speaking session
            </Link>{" "}
            for feedback on a whole answer.
          </p>
        </div>
      </div>

      {/* A model sentence to read first, and a recorder for it.
          The bank already holds 2,709 authored context sentences and this exercise was
          showing them only after the reveal, as reference. Read one aloud before producing
          your own and the target is concrete rather than remembered — which is the whole
          difference between "use it in a sentence" and knowing what that sounds like. */}
      {modelSentence && (
        <div className="space-y-2">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Start by reading this one aloud
          </p>
          <ReadAloud sentence={modelSentence} />
        </div>
      )}

      {revealed && (
        <div className="space-y-4 border-t border-border pt-4">
          {item.entry.collocations.length > 0 && (
            <Section title="Natural combinations">
              <ChipList items={item.entry.collocations.slice(0, 5)} />
            </Section>
          )}
          {item.entry.example_sentences.length > 0 && (
            <Section title="Compare with">
              <ul className="space-y-1 text-[13px] text-muted-foreground">
                {item.entry.example_sentences
                  .filter((example) => example.trim() !== modelSentence)
                  .slice(0, 2)
                  .map((example) => (
                  <li key={example} className="leading-relaxed">
                    {example}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {item.entry.cefr_level && (
            <div>
              <Badge tone="outline">{item.entry.cefr_level}</Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
