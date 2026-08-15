import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui";
import { levelLabel } from "../../labels";
import { WordAudioButton } from "../WordAudioButton";
import { ChipList, Headword, Section, type ExerciseBodyProps } from "./shared";
import type { FlipPayload } from "../../types";

/**
 * §5.2.1 recall card: headword → meaning. Nothing is auto-checked, so the
 * rating stays entirely the learner's judgement.
 */
export function FlipExercise({ item, revealed, onCommit }: ExerciseBodyProps) {
  const payload = item.exercise.payload as FlipPayload;
  const committed = useRef(false);

  useEffect(() => {
    if (!revealed || committed.current) return;
    committed.current = true;
    onCommit({ correct: null, suggestedRating: null, detail: "Rate how well you knew it." });
  }, [revealed, onCommit]);

  const { front, back } = payload;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <Headword headword={front.headword} ipa={front.ipa} pos={front.pos} />
        <WordAudioButton mediaPath={front.audio_url} text={front.headword} />
      </div>

      {!revealed && (
        <p className="text-[13px] text-muted-foreground">
          Say the meaning out loud, then show the answer to check yourself.
        </p>
      )}

      {revealed && (
        <div className="space-y-4 border-t border-border pt-4">
          <Section title="Meaning">
            <p className="text-[15px] leading-relaxed">{back.definition || "No definition yet."}</p>
          </Section>

          {back.own_context_sentence && (
            <Section title={back.context_note ? `Your sentence ${back.context_note}` : "Your sentence"}>
              <p className="rounded-lg bg-muted/60 p-3 text-[13px] italic leading-relaxed">
                {back.own_context_sentence}
              </p>
            </Section>
          )}

          {back.collocations.length > 0 && (
            <Section title="Collocations">
              <ChipList items={back.collocations} />
            </Section>
          )}

          {back.example_sentences.length > 0 && (
            <Section title="Examples">
              <ul className="space-y-1 text-[13px] text-muted-foreground">
                {back.example_sentences.map((example) => (
                  <li key={example} className="leading-relaxed">
                    {example}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {levelLabel(back.cefr_level) && (
            <div>
              <Badge tone="outline" title={`Common European Framework level ${back.cefr_level}`}>
                {levelLabel(back.cefr_level)}
              </Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
