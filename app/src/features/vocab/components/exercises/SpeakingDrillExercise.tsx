import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Mic } from "lucide-react";
import { Badge } from "@/components/ui";
import { WordAudioButton } from "../WordAudioButton";
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
            Self-rated: BandReady does not listen here.{" "}
            <Link
              to="/speaking"
              className="text-primary underline decoration-primary/40 hover:decoration-primary"
            >
              Start a Speaking session
            </Link>{" "}
            if you want feedback on it.
          </p>
        </div>
      </div>

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
                {item.entry.example_sentences.slice(0, 2).map((example) => (
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
