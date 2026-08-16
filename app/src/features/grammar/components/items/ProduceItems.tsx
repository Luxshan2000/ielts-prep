/**
 * Free production — stages 4 and 5, and the reason the rest of the ladder exists.
 *
 * Three rules are visible in this file and all three are pedagogy, not styling:
 *
 * 1. **The target is stated.** Learners route around any structure they are not
 *    told to use, so the prompt says which structure it wants and the card
 *    repeats it. Hiding the target does not test the structure, it tests luck.
 *
 * 2. **The learner's sentence stays on screen, verbatim and unedited**, above
 *    whatever the grader says about it (DESIGN §6 F5).
 *
 * 3. **The seed word comes out of the vocabulary queue.** "Write a sentence about
 *    *deteriorate* using the present perfect" is one answer that reviews a
 *    grammar card and a word card at once — the owner's original ask, made
 *    concrete (DESIGN §1.5 rule 7).
 */

import { Sparkles } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { SpeakAnswer } from "@/components/practice/SpeakAnswer";
import { pluralize } from "@/lib/format";
import { speakGrammarAnswer } from "../../api";
import { AnswerField, ContextBlock, useTypedAnswer, type ItemViewProps } from "./shared";

function WordCount({ value, min, max }: { value: string; min?: number | null; max?: number | null }) {
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const short = min ? words < min : false;
  const long = max ? words > max : false;
  return (
    <span className="text-[12px] text-muted-foreground">
      {pluralize(words, "word")}
      {short && min ? `, aim for at least ${min}` : ""}
      {long && max ? `, trim to about ${max}` : ""}
    </span>
  );
}

// --------------------------------------------------------------- produce ----

export function ProduceItem({ item, attempt, disabled, onAnswer }: ItemViewProps) {
  const payload = item.payload;
  const [value, setValue] = useTypedAnswer(item.id);
  const applyToTask = payload.mode === "apply_to_task";

  return (
    <div className="space-y-4">
      {applyToTask && payload.task_ref && (
        <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
          From a real task in your practice bank
        </p>
      )}
      {payload.prompt_text && <p className="text-sm leading-relaxed text-foreground">{payload.prompt_text}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {payload.required_structure && (
          <Badge tone="primary">Use: {payload.required_structure.replace(/_/g, " ")}</Badge>
        )}
        {payload.seed_word && (
          <Badge tone="outline" className="gap-1">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            and the word “{payload.seed_word.headword}”
          </Badge>
        )}
      </div>

      {payload.seed_word?.definition && (
        <p className="text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">{payload.seed_word.headword}</span>:{" "}
          {payload.seed_word.definition}
        </p>
      )}

      {attempt.revealed ? (
        <ContextBlock className="border-l-primary/60 text-foreground">{value}</ContextBlock>
      ) : (
        <>
          <AnswerField
            value={value}
            onChange={setValue}
            onSubmit={() => onAnswer(value.trim())}
            disabled={disabled}
            multiline
            label="Your sentence"
            placeholder="Write one sentence"
          />
          {/* Speaking sits beside the typed path, never in place of it: no microphone, no
              permission, or no speech provider must still leave a working exercise. The
              transcript lands in the same field, so from here everything is identical. */}
          <SpeakAnswer
            prompt="Or say your sentence out loud. It will be checked the same way."
            disabled={disabled}
            onSubmit={async (audio) => {
              const spoken = await speakGrammarAnswer(audio, item.id);
              if (spoken.gradeable) setValue(spoken.transcript);
              return spoken;
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => onAnswer(value.trim())} disabled={disabled || !value.trim()}>
              Check my sentence
            </Button>
            <WordCount value={value} min={payload.min_words} max={payload.max_words} />
          </div>
          {item.needs_model && (
            <p className="text-[12px] text-muted-foreground">
              This one is read by the language model. If it is not running, you will be asked to rate
              yourself instead. Nothing is lost.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// --------------------------------------------------------------- combine ----

/**
 * The best-evidenced route from knowing a structure to writing better with it.
 * The short sentences render as separate cards and the field sits under them, so
 * the operation — three things becoming one — is visible rather than described.
 */
export function CombineItem({ item, attempt, disabled, onAnswer }: ItemViewProps) {
  const payload = item.payload;
  const [value, setValue] = useTypedAnswer(item.id);
  const parts = payload.parts ?? [];

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {parts.map((part, i) => (
          <p
            key={i}
            className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-[13px] leading-relaxed text-foreground"
          >
            {part}
          </p>
        ))}
      </div>

      {payload.required_device && (
        <Badge tone="primary">Join them with: {payload.required_device.replace(/_/g, " ")}</Badge>
      )}

      {attempt.revealed ? (
        <ContextBlock className="border-l-primary/60 text-foreground">{value}</ContextBlock>
      ) : (
        <>
          <AnswerField
            value={value}
            onChange={setValue}
            onSubmit={() => onAnswer(value.trim())}
            disabled={disabled}
            multiline
            label="Your combined sentence"
            placeholder="One sentence, all of it"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => onAnswer(value.trim())} disabled={disabled || !value.trim()}>
              Check my sentence
            </Button>
            <WordCount value={value} />
          </div>
        </>
      )}
    </div>
  );
}

// -------------------------------------------------------- speaking_drill ----

/**
 * The live-voice hook. The session cannot host a voice call, so this card sets
 * the target and hands off to the speaking module, which already knows how to
 * run one and how to check the transcript afterwards.
 */
export function SpeakingDrillItem({ item, attempt, disabled, onAnswer }: ItemViewProps) {
  const payload = item.payload;
  return (
    <div className="space-y-4">
      {payload.injection && <p className="text-sm leading-relaxed text-foreground">{payload.injection}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {payload.required_structure && (
          <Badge tone="primary">Use: {payload.required_structure.replace(/_/g, " ")}</Badge>
        )}
        {payload.turns ? <Badge tone="outline">{payload.turns} turns</Badge> : null}
      </div>
      <p className="text-[13px] text-muted-foreground">
        Say your answer out loud before you move on. The speaking module checks the transcript for
        this structure when you use it there; here, the honest thing is your own judgement.
      </p>
      {!attempt.revealed && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={disabled} onClick={() => onAnswer("said_it")}>
            I said it, and it came out right
          </Button>
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => onAnswer("struggled")}>
            I struggled with it
          </Button>
        </div>
      )}
    </div>
  );
}
