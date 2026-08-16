/**
 * The five items where the answer is a choice — and the heart of the module.
 *
 * `choose_form` is the one the owner asked for twice: two options that are both
 * correct English, a situation that makes only one of them true, and feedback
 * that says what the other one *would have meant* rather than "incorrect". Its
 * chrome is deliberately bare — a context, a stem, two chips, nothing else. No
 * tip box, no metalanguage on the front of the card (DESIGN §6 F3).
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Cue } from "../primitives";
import { ContextBlock, OptionList, Stem, StemWithBlank, optionList, type ItemViewProps } from "./shared";

/** The chosen index for a one-shot choice item, reset whenever the item changes. */
function useChoice(itemId: string): [number | null, (n: number | null) => void] {
  const [chosen, setChosen] = useState<number | null>(null);
  useEffect(() => setChosen(null), [itemId]);
  return [chosen, setChosen];
}

// ------------------------------------------------------------- interpret ----

/**
 * Form → meaning. The cheapest item in the module and the one most likely to be
 * cut by someone who thinks it looks too easy: it is the only kind that tests
 * whether the learner has attached a *meaning* to the shape at all.
 */
export function InterpretItem({ item, attempt, disabled, onAnswer }: ItemViewProps) {
  const [chosen, setChosen] = useChoice(item.id);
  const payload = item.payload;
  const options = payload.mode === "timeline" ? (payload.slots ?? []) : optionList(payload);
  const keyIndex =
    attempt.revealed && typeof attempt.reveal?.key === "number" ? attempt.reveal.key : null;

  return (
    <div className="space-y-4">
      <Stem className="font-medium">
        <Cue text={payload.sentence ?? ""} cue={attempt.revealed ? attempt.reveal?.decision_cue : null} />
      </Stem>
      {payload.question && <p className="text-sm text-muted-foreground">{payload.question}</p>}
      <OptionList
        options={options}
        chosen={chosen}
        keyIndex={keyIndex}
        disabled={disabled}
        stacked={options.length > 3 || options.some((o) => o.length > 28)}
        dimmed={attempt.signalled ? chosen : null}
        ariaLabel={payload.question ?? "Options"}
        onChoose={(i) => {
          setChosen(i);
          onAnswer(i);
        }}
      />
    </div>
  );
}

// ----------------------------------------------------------- choose_form ----

export function ChooseFormItem({ item, attempt, disabled, onAnswer }: ItemViewProps) {
  const [chosen, setChosen] = useChoice(item.id);
  const payload = item.payload;
  const revealedOptions = attempt.revealed ? attempt.reveal?.options ?? null : null;
  const keyIndex =
    attempt.revealed && typeof attempt.reveal?.key === "number" ? attempt.reveal.key : null;
  const options = optionList(payload);
  // The cue highlights on the signal beat as well as on the reveal — that beat's
  // whole job is to point at the words that decide it without giving the answer.
  const showCue =
    attempt.revealed || attempt.signalled ? attempt.reveal?.decision_cue ?? item.decision_cue ?? null : null;

  return (
    <div className="space-y-4">
      {payload.context && (
        <ContextBlock>
          <Cue text={payload.context} cue={showCue} />
        </ContextBlock>
      )}
      {payload.stem && (
        <StemWithBlank
          stem={payload.stem}
          filled={attempt.revealed && keyIndex !== null ? options[keyIndex] : null}
        />
      )}
      <OptionList
        options={options.map((text, i) => (
          <span key={i} className="block">
            <span className="font-medium text-foreground">{text}</span>
            {revealedOptions?.[i]?.why_this_means && (
              <span className="mt-1 block text-[12px] leading-relaxed text-muted-foreground">
                {revealedOptions[i].why_this_means}
              </span>
            )}
          </span>
        ))}
        chosen={chosen}
        keyIndex={keyIndex}
        disabled={disabled}
        dimmed={attempt.signalled ? chosen : null}
        onChoose={(i) => {
          setChosen(i);
          onAnswer(i);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- judge ----

/**
 * Two taps: acceptable or not, then — only on "not" — the reason, from a closed
 * list. That second tap is what turns a coin flip into a diagnosis, and it is
 * the skill that actually runs during a timed exam (DESIGN §6 F12).
 */
export function JudgeItem({ item, attempt, disabled, onAnswer }: ItemViewProps) {
  const payload = item.payload;
  const [verdict, setVerdict] = useState<"ok" | "not" | null>(null);
  const [reason, setReason] = useState<number | null>(null);
  useEffect(() => {
    setVerdict(null);
    setReason(null);
  }, [item.id]);

  const reasons = payload.reasons ?? [];
  const keyIndex =
    attempt.revealed && typeof attempt.reveal?.key === "number" ? attempt.reveal.key : null;

  return (
    <div className="space-y-4">
      {payload.context && <ContextBlock>{payload.context}</ContextBlock>}
      <Stem className="font-medium">
        <Cue text={payload.sentence ?? ""} cue={attempt.revealed ? attempt.reveal?.decision_cue : null} />
      </Stem>

      {verdict === null && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setVerdict("ok");
              // "Nothing wrong" is the last reason in the authored list, so a
              // learner who accepts a sentence answers the same question the
              // rejecters do — one taxonomy, one key.
              onAnswer(Math.max(0, reasons.length - 1));
            }}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            This is fine
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setVerdict("not")}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Something is wrong with it
          </button>
        </div>
      )}

      {(verdict === "not" || attempt.revealed) && reasons.length > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] text-muted-foreground">What is wrong with it?</p>
          <OptionList
            options={reasons}
            chosen={reason}
            keyIndex={keyIndex}
            disabled={disabled}
            dimmed={attempt.signalled ? reason : null}
            ariaLabel="What is wrong with it"
            onChoose={(i) => {
              setReason(i);
              onAnswer(i);
            }}
          />
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------- both_ok ----

/**
 * The honesty item. Both options are correct and they mean different things —
 * without these the module would be teaching that English grammar is a series of
 * right/wrong gates, which is the opposite of what "when to use which" means.
 *
 * One round trip: picking "both are fine" opens the follow-up, and the two
 * answers are submitted together.
 */
export function BothOkItem({ item, attempt, disabled, onAnswer }: ItemViewProps) {
  const payload = item.payload;
  const options = optionList(payload);
  const [stage, setStage] = useState<"main" | "follow">("main");
  const [chosen, setChosen] = useState<number | null>(null);
  const [follow, setFollow] = useState<number | null>(null);
  useEffect(() => {
    setStage("main");
    setChosen(null);
    setFollow(null);
  }, [item.id]);

  const revealedOptions = attempt.revealed ? attempt.reveal?.options ?? null : null;
  const bothIndex = options.length;
  const mainOptions = [
    ...options.map((text, i) => (
      <span key={i} className="block">
        <span className="font-medium text-foreground">Only “{text}” works here</span>
        {revealedOptions?.[i]?.why_this_means && (
          <span className="mt-1 block text-[12px] leading-relaxed text-muted-foreground">
            {revealedOptions[i].why_this_means}
          </span>
        )}
      </span>
    )),
    <span key="both" className="font-medium text-foreground">
      Both are correct, and they say different things
    </span>,
  ];

  return (
    <div className="space-y-4">
      {payload.context && <ContextBlock>{payload.context}</ContextBlock>}
      {payload.stem && <StemWithBlank stem={payload.stem} />}

      {stage === "main" && (
        <OptionList
          options={mainOptions}
          chosen={chosen}
          keyIndex={attempt.revealed ? bothIndex : null}
          disabled={disabled}
          dimmed={attempt.signalled ? chosen : null}
          onChoose={(i) => {
            setChosen(i);
            if (i === bothIndex && payload.follow_up) {
              setStage("follow");
              return;
            }
            onAnswer(i === bothIndex ? "both" : i);
          }}
        />
      )}

      {stage === "follow" && payload.follow_up && (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/8 p-3">
          <p className="text-[13px] font-medium text-foreground">{payload.follow_up.question}</p>
          <OptionList
            options={options}
            chosen={follow}
            keyIndex={
              attempt.revealed && typeof attempt.reveal?.follow_up_key === "number"
                ? attempt.reveal.follow_up_key
                : null
            }
            disabled={disabled}
            ariaLabel={payload.follow_up.question}
            onChoose={(i) => {
              setFollow(i);
              onAnswer("both", i);
            }}
          />
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------- contrast_pair ----

/**
 * Assign the meanings — the purest test of the form→meaning link we can build.
 * The learner picks which meaning belongs to each sentence, in order.
 */
export function ContrastPairItem({ item, attempt, disabled, onAnswer }: ItemViewProps) {
  const payload = item.payload;
  const sentences = payload.sentences ?? [];
  const meanings = payload.meanings ?? [];
  const [picks, setPicks] = useState<(number | null)[]>([]);
  useEffect(() => setPicks(sentences.map(() => null)), [item.id, sentences.length]);

  const key = attempt.revealed && Array.isArray(attempt.reveal?.key) ? (attempt.reveal?.key as number[]) : null;

  const choose = (sentenceIndex: number, meaningIndex: number) => {
    const next = [...picks];
    next[sentenceIndex] = meaningIndex;
    setPicks(next);
    if (next.length === sentences.length && next.every((p) => p !== null)) {
      onAnswer(next as number[]);
    }
  };

  return (
    <div className="space-y-4">
      {payload.context && <ContextBlock>{payload.context}</ContextBlock>}
      <div className="space-y-3">
        {sentences.map((sentence, si) => (
          <div key={si} className="rounded-lg border border-border p-3">
            <Stem className="mb-2 text-[15px] font-medium">
              <Cue text={sentence} cue={attempt.revealed ? attempt.reveal?.decision_cue : null} />
            </Stem>
            <div className="grid gap-2">
              {meanings.map((meaning, mi) => {
                const picked = picks[si] === mi;
                const isKey = key ? key[si] === mi : false;
                return (
                  <button
                    key={mi}
                    type="button"
                    disabled={disabled}
                    aria-pressed={picked}
                    onClick={() => choose(si, mi)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-[13px] leading-relaxed transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      attempt.revealed && isKey && "border-success bg-success/12",
                      attempt.revealed && !isKey && picked && "border-warning bg-warning/12",
                      !attempt.revealed && picked && "border-primary bg-primary/8",
                      !attempt.revealed && !picked && "border-border hover:border-primary/50 hover:bg-accent",
                    )}
                  >
                    {meaning}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
