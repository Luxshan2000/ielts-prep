import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Headphones, Mic, PenLine, SkipForward, Undo2, Volume2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CircularTimer,
  EmptyState,
  Input,
  Progress,
  Select,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { countWords } from "@/lib/format";
// The placement is where a learner meets IELTS question types for the first time, so it
// borrows the practice rooms' controls rather than inventing plainer ones: a True / False /
// Not Given item has to look and behave the same in both places or the sampler is teaching
// the wrong thing on the first screen.
import { SegmentedChoices } from "@/features/reading/components/Options";
import { CHOICE_TYPES, choiceValues, instructionFor, splitGaps } from "@/features/reading/qtypes";
import { useOnboardingStore } from "../store";
import { SpokenAnswerField, useCanRecord } from "./SpokenAnswerField";
import {
  SKILL_LABELS,
  type DocQuestion,
  type ListeningContent,
  type PlacementStep,
  type ReadingContent,
  type SpeakingContent,
  type WritingContent,
} from "../types";

interface RenderedQuestion {
  id: string;
  number: number;
  qtype: string;
  prompt: string;
  options: { key: string; text: string }[] | null;
  wordLimit: number | null;
  /** The group's rubric — "Do the following statements agree…", "Write NO MORE THAN…". */
  instruction: string | null;
}

/**
 * What TRUE / FALSE / NOT GIVEN actually mean.
 *
 * Every placement in this build opens on four of these, and until now they were four
 * empty text boxes labelled "Type your answer". Somebody who has never sat IELTS has no
 * way to know the three words are the whole answer space, let alone that "the passage
 * doesn't say" is a different verdict from "the passage disagrees". Getting that wrong
 * costs four marks on the first screen, and those four marks set the Reading estimate the
 * entire study plan is built from.
 */
const CHOICE_RUBRIC: Record<string, string> = {
  true_false_not_given:
    "TRUE means the passage says this. FALSE means the passage says the opposite. NOT GIVEN means the passage does not say either way.",
  yes_no_not_given:
    "YES means the writer thinks this. NO means the writer thinks the opposite. NOT GIVEN means the writer does not say either way.",
};

/**
 * Packs mark a blank as `{{gap}}` or `{{7}}`. Shown raw — and it was — a learner reads
 * "an open channel can be {{gap}}, and the ground beside it…" and reasonably concludes
 * the app is broken.
 */
function PromptText({ text }: { text: string }) {
  return (
    <>
      {splitGaps(text).map((token, i) =>
        token.kind === "gap" ? (
          <span
            key={i}
            className="mx-0.5 inline-block min-w-[3.5rem] border-b border-dashed border-muted-foreground/70 align-baseline"
            aria-label="blank"
          >
            &nbsp;
          </span>
        ) : (
          <span key={i}>{token.value}</span>
        ),
      )}
    </>
  );
}

function optionList(
  raw: DocQuestion["options"] | { key?: string; text?: string }[] | null | undefined,
): { key: string; text: string }[] | null {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return null;
  return raw.map((option, i) => {
    if (typeof option === "string") {
      return { key: String.fromCharCode(65 + i), text: option };
    }
    return {
      key: option.key ?? String.fromCharCode(65 + i),
      text: option.text ?? String(option.key ?? ""),
    };
  });
}

/** Join the id/number/qtype rows with the prompt text carried in the pack document. */
function readingQuestions(content: ReadingContent): RenderedQuestion[] {
  const docByNumber = new Map<
    number,
    { q: DocQuestion; groupOptions: DocQuestion["options"]; groupInstruction: string | null }
  >();
  for (const group of content.passage?.question_groups ?? []) {
    for (const question of group.questions ?? []) {
      const number = question.number ?? question.n;
      if (typeof number === "number") {
        docByNumber.set(number, {
          q: question,
          groupOptions: group.options ?? null,
          groupInstruction: group.instructions_extra ?? group.instructions ?? null,
        });
      }
    }
  }
  return (content.questions ?? []).map((meta) => {
    const found = docByNumber.get(meta.number);
    return {
      id: meta.id,
      number: meta.number,
      qtype: meta.qtype,
      prompt: found?.q.prompt ?? found?.q.text ?? `Question ${meta.number}`,
      options: optionList(found?.q.options ?? found?.groupOptions ?? null),
      wordLimit: meta.word_limit,
      instruction: rubricFor(meta.qtype, found?.groupInstruction ?? null, meta.word_limit),
    };
  });
}

function listeningQuestions(content: ListeningContent): RenderedQuestion[] {
  const docByNumber = new Map<number, DocQuestion>();
  for (const question of content.script?.questions ?? []) {
    const number = question.number ?? question.n;
    if (typeof number === "number") docByNumber.set(number, question);
  }
  return (content.questions ?? []).map((meta) => {
    const found = docByNumber.get(meta.number);
    return {
      id: meta.id,
      number: meta.number,
      qtype: meta.qtype,
      prompt: found?.prompt ?? found?.text ?? `Question ${meta.number}`,
      options: optionList(found?.options ?? null),
      wordLimit: meta.word_limit,
      instruction: rubricFor(meta.qtype, found?.instruction ?? null, meta.word_limit),
    };
  });
}

/**
 * The line above a run of questions. The pack's own rubric wins; a word limit with no
 * rubric gets the standard sentence rather than a bare number in a placeholder, because
 * "No more than 2 words" in grey inside an empty box is not an instruction anyone reads.
 */
function rubricFor(qtype: string, authored: string | null, wordLimit: number | null): string | null {
  const parts: (string | null)[] = [authored?.trim() || null];
  if (CHOICE_TYPES.has(qtype)) {
    // The pack asks "Do the following statements agree with the passage?" and stops. On a
    // real paper the next sentence defines the three verdicts, and that sentence is the
    // one a first-timer needs.
    parts.push(CHOICE_RUBRIC[qtype] ?? null);
  } else if (!authored) {
    parts.push(instructionFor(wordLimit) || null);
  }
  return parts.filter(Boolean).join(" ") || null;
}

function AnswerControl({
  question,
  value,
  onChange,
}: {
  question: RenderedQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  if (CHOICE_TYPES.has(question.qtype)) {
    return (
      <SegmentedChoices
        name={`placement-${question.id}`}
        ariaLabel={`Answer for question ${question.number}`}
        values={choiceValues(question.qtype)}
        value={value}
        // Clicking the chosen verdict again clears it, so a guess can be taken back.
        onChange={(next) => onChange(next === value ? "" : next)}
      />
    );
  }
  if (question.options) {
    return (
      <Select
        className="max-w-md"
        aria-label={`Answer for question ${question.number}`}
        value={value || null}
        placeholder="Choose an answer…"
        options={question.options.map((option) => ({
          value: option.key,
          label: `${option.key}. ${option.text}`,
        }))}
        onChange={onChange}
      />
    );
  }
  return (
    <Input
      className="max-w-md"
      aria-label={`Answer for question ${question.number}`}
      value={value}
      placeholder={
        question.wordLimit
          ? `No more than ${question.wordLimit} word${question.wordLimit === 1 ? "" : "s"}`
          : "Type your answer"
      }
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Reading and Listening samplers — objective, graded server-side. */
function ObjectiveStep({ step }: { step: PlacementStep }) {
  const { submitting, answerStep, skipStep } = useOnboardingStore();
  const listening = step.skill === "listening";
  const content = step.content as ReadingContent & ListeningContent;
  const questions = useMemo(
    () => (listening ? listeningQuestions(content) : readingQuestions(content)),
    [content, listening],
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const path = (content as ListeningContent).audio_path;
    setAudioUrl(null);
    setAudioError(null);
    if (!listening) return;
    if (!path) {
      // A fresh install has the scripts but not the rendered speech — the examiner voice is
      // a model download, and at placement it usually has not happened yet. This branch used
      // to fall through to "Preparing the audio…" and sit there forever, which is the app
      // telling a learner to wait for something that is never coming.
      setAudioError(
        "There is no recording for this part yet. The examiner voice is downloaded after setup. Skip Listening and your self-rating will be used for it.",
      );
      return;
    }
    void api
      .mediaUrl(path)
      .then((url) => {
        if (!cancelled) setAudioUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setAudioError(
            "The audio for this part has not been rendered yet. Answer what you can, or skip this section.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [content, listening]);

  const answered = questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;

  return (
    <div className="space-y-5">
      {listening ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Headphones className="h-4 w-4 shrink-0" aria-hidden="true" />
              {content.title ?? "Listening part"}
              {content.part ? ` · Part ${content.part}` : ""}
            </p>
            {content.script?.scenario && (
              <p className="text-[13px] text-muted-foreground">{content.script.scenario}</p>
            )}
            {audioUrl ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio controls src={audioUrl} className="w-full" preload="metadata">
                Your browser cannot play this audio.
              </audio>
            ) : (
              <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
                <Volume2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {audioError ?? "Preparing the audio…"}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-medium text-foreground">
              {content.title ?? content.passage?.title ?? "Reading passage"}
            </p>
            <div className="scrollbar-thin max-h-[40vh] space-y-3 overflow-y-auto pr-2 text-[13px] leading-relaxed text-foreground">
              {(content.passage?.texts ?? []).map((block, bi) => (
                <div key={block.id ?? bi} className="space-y-2">
                  {block.heading && (
                    <p className="font-medium text-foreground">{block.heading}</p>
                  )}
                  {(block.paragraphs ?? []).map((paragraph, pi) => (
                    <p key={paragraph.id ?? pi}>{paragraph.text}</p>
                  ))}
                </div>
              ))}
              {(content.passage?.texts ?? []).length === 0 && (
                <p className="text-muted-foreground">
                  This passage shipped without body text. Skip the section and your
                  self-rating will be used for Reading.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <ol className="space-y-4">
        {questions.map((question, i) => (
          <li key={question.id} className="space-y-2">
            {/* Printed once above the run it governs, as on the paper — repeating the same
                sentence over five statements reads as noise and gets skipped. */}
            {question.instruction && question.instruction !== questions[i - 1]?.instruction && (
              <p className="rounded-md bg-muted/50 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
                {question.instruction}
              </p>
            )}
            <div className="flex items-baseline gap-2">
              <span className="tabular text-[13px] font-semibold text-muted-foreground">
                {question.number}.
              </span>
              <span className="min-w-0 flex-1 whitespace-pre-line text-[13px] leading-relaxed text-foreground">
                <PromptText text={question.prompt} />
              </span>
            </div>
            <div className="pl-6">
              <AnswerControl
                question={question}
                value={answers[question.id] ?? ""}
                onChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
              />
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-muted-foreground">
          {answered} of {questions.length} answered
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => void skipStep()} disabled={submitting}>
            <SkipForward className="h-4 w-4" aria-hidden="true" />
            Skip {SKILL_LABELS[step.skill]}
          </Button>
          <Button loading={submitting} onClick={() => void answerStep({ answers })}>
            Submit and continue
          </Button>
        </span>
      </div>
    </div>
  );
}

function WritingStep({ step }: { step: PlacementStep }) {
  const { submitting, answerStep, skipStep } = useOnboardingStore();
  const content = step.content as WritingContent;
  const [text, setText] = useState("");
  const totalSec = (step.minutes ?? 10) * 60;
  const [remaining, setRemaining] = useState(totalSec);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setRemaining(Math.max(0, totalSec - Math.floor((Date.now() - startedAt.current) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [totalSec]);

  const words = countWords(text);
  const [min, max] = (content.word_target as number[] | undefined) ?? [100, 150];
  const enough = words >= min;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <PenLine className="h-4 w-4 shrink-0" aria-hidden="true" />
            {content.task_type === "gt_task1"
              ? "General Training Task 1: letter"
              : content.task_type === "ac_task1"
                ? "Academic Task 1: describe the data"
                : "Writing task"}
          </p>
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground">
            {content.prompt_text}
          </p>
          {content.letter_bullets && content.letter_bullets.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
              {content.letter_bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
          {content.chart_spec && (
            <p className="text-[13px] text-muted-foreground">
              Chart data: {JSON.stringify(content.chart_spec)}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Aim for {min} to {max} words. This is a sampler, not a full Task 1, so length is
            not scored against you.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <CircularTimer
          totalSec={totalSec}
          remainingSec={remaining}
          label="Placement writing task"
        />
        <p className="text-[13px] text-muted-foreground">
          {remaining > 0
            ? "The timer is a guide. Nothing submits automatically."
            : "Time is up, but you can still finish your sentence and submit."}
        </p>
      </div>

      <div className="space-y-1.5">
        <Textarea
          className="min-h-[240px]"
          aria-label="Your writing response"
          placeholder="Write your response here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex items-center justify-between text-[11px]">
          <span className={cn("tabular", enough ? "text-muted-foreground" : "text-warning")}>
            {words} words{enough ? "" : ` · ${min - words} to go`}
          </span>
          <Progress
            className="ml-4 max-w-[10rem]"
            value={Math.min(100, Math.round((words / Math.max(1, min)) * 100))}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => void skipStep()} disabled={submitting}>
          <SkipForward className="h-4 w-4" aria-hidden="true" />
          Skip Writing
        </Button>
        <Button
          loading={submitting}
          disabled={text.trim().length === 0}
          onClick={() =>
            void answerStep({
              essay_text: text,
              seconds_elapsed: totalSec - remaining,
            })
          }
        >
          Submit and continue
        </Button>
      </div>
    </div>
  );
}

function SpeakingStep({ step }: { step: PlacementStep }) {
  const { submitting, answerStep, skipStep } = useOnboardingStore();
  const content = step.content as SpeakingContent;
  const questions = (content.questions ?? []).map((q, i) =>
    typeof q === "string" ? q : (q.prompt ?? q.text ?? `Question ${i + 1}`),
  );
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const canRecord = useCanRecord();

  const transcript = answers
    .map((answer, i) => (answer.trim() ? `Q: ${questions[i]}\nA: ${answer.trim()}` : ""))
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="space-y-4">
      <Card className="border-primary/40 bg-primary/[0.05]">
        <CardContent className="space-y-1.5 p-4 text-[13px]">
          {/* This card used to explain, underneath a text box, why a section called Speaking
              was asking the learner to type. The reason arrived after the confusion it was
              meant to prevent. Lead with what will actually happen instead. */}
          {/* Three states, not two. While the capability check is still in flight the
              heading used to promise "say your answers out loud" and then take it back a
              moment later — the same drawn-and-withdrawn problem the mic button avoids. */}
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
            {canRecord === false
              ? "Type your answers here. Speech is not set up yet"
              : canRecord === true
                ? "Say your answers out loud, or type them"
                : "Answer these questions in your own words"}
          </p>
          <p className="text-muted-foreground">
            {canRecord === false
              ? "Speech-to-text is not available in this build, so this sampler reads what you write. Set speech up in Settings and the Speaking room will listen properly."
              : canRecord === true
                ? "Speak each answer as you would in the exam and it is written down for you, or type it if that is easier. Either way you can correct what appears before you move on."
                : "You can type every answer. We are checking whether this machine can also take them spoken; if it can, a microphone button appears next to each question."}
          </p>
          <p className="text-muted-foreground">
            Either way, this sampler scores the language you produce, your words and your
            grammar, against the Fluency, Lexical Resource and Grammar descriptors. It does not
            judge your accent or your delivery. That happens in the Speaking room once your
            microphone and voice models are set up.
          </p>
          <p className="text-muted-foreground">
            {content.skip_hint ??
              "No time for this? Skip it and your self-rating is used for Speaking instead."}
          </p>
        </CardContent>
      </Card>

      <ol className="space-y-4">
        {questions.map((question, i) => (
          <SpokenAnswerField
            key={`${question}-${i}`}
            question={question}
            index={i}
            value={answers[i]}
            canRecord={canRecord}
            disabled={submitting}
            onChange={(next) => setAnswers((prev) => prev.map((a, j) => (j === i ? next : a)))}
          />
        ))}
      </ol>

      {questions.length === 0 && (
        <p className="text-[13px] text-muted-foreground">
          This card shipped without questions. Skip the section and your self-rating will be
          used for Speaking.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => void skipStep()} disabled={submitting}>
          <SkipForward className="h-4 w-4" aria-hidden="true" />
          Skip Speaking
        </Button>
        <Button
          loading={submitting}
          disabled={transcript.length === 0}
          onClick={() => void answerStep({ transcript })}
        >
          Submit and continue
        </Button>
      </div>
    </div>
  );
}

/**
 * Why a section could not be run. "No content pack is installed" was the only answer on
 * offer, and it is the wrong one for the commonest case by far: the pack is installed and
 * it is the *examiner voice* that has not been downloaded yet. Telling a learner their
 * content is missing sends them looking for a fix in the wrong place.
 */
function unavailableTitle(step: PlacementStep): string {
  const reason = (step.content as { reason?: string }).reason;
  if (reason === "no_listening_audio") return "There is no recording to listen to yet";
  return `No ${SKILL_LABELS[step.skill].toLowerCase()} content is installed`;
}

function unavailableDescription(step: PlacementStep): string {
  const reason = (step.content as { reason?: string }).reason;
  if (reason === "no_listening_audio") {
    return "The questions are here, but the examiner voice that reads them aloud has not been downloaded yet, so this section cannot be sampled honestly. Your self-rating will be used for Listening, and you can practise it properly once the voice is set up.";
  }
  return "This build has no content pack for that section, so it cannot be sampled. Your self-rating will be used for this skill.";
}

/** The placement sitting — one step at a time, every section individually skippable. */
export function PlacementRunner() {
  const {
    step,
    progress,
    estimatedMinutes,
    error,
    submitting,
    resuming,
    clearError,
    skipStep,
    resumePlacement,
    completePlacement,
  } = useOnboardingStore();

  if (!step) {
    // Two ways to arrive here with an error and nothing to answer, and both used to leave
    // the learner watching "Scoring your placement…" forever with no button on the screen:
    // the reopen could not reach the sidecar (no progress yet), or the last section went in
    // and the marking call failed. Neither loses anything — the sitting is on disk — so
    // both get the same offer, another go, worded for what actually happened.
    if (error && !resuming) {
      const reopening = progress === null;
      return (
        <div className="mx-auto w-full max-w-2xl px-6 py-16">
          <EmptyState
            icon={AlertCircle}
            title={
              reopening
                ? "Your placement test could not be reopened just yet"
                : "Your answers could not be scored just yet"
            }
            description={`${error} Nothing has been lost. Everything you answered is saved.`}
            action={
              <Button
                loading={submitting}
                onClick={() => void (reopening ? resumePlacement() : completePlacement())}
              >
                Try again
              </Button>
            }
          />
        </div>
      );
    }
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-16">
        <EmptyState
          icon={resuming ? Undo2 : AlertCircle}
          title={resuming ? "Picking up where you left off…" : "Scoring your placement…"}
          description={
            resuming
              ? "Your placement test was saved as you went. The section you stopped on is loading now, and nothing you already answered has been lost."
              : "Your writing and speaking samples are being scored against the band descriptors. This takes a few seconds."
          }
        />
      </div>
    );
  }

  const done = progress ? progress.step_index : 0;
  const total = progress ? progress.step_count : 1;

  return (
    <div className="flex h-full min-h-0 flex-col animate-fade-in">
      <header className="shrink-0 border-b border-border px-6 py-4">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-lg font-semibold">
              Placement · {SKILL_LABELS[step.skill]}
              {step.half ? ` (part ${step.half} of 2)` : ""}
            </h1>
            <span className="text-[13px] text-muted-foreground">
              Section {Math.min(done + 1, total)} of {total}
              {estimatedMinutes ? ` · about ${estimatedMinutes} minutes in total` : ""}
            </span>
          </div>
          <Progress value={Math.round((done / Math.max(1, total)) * 100)} />
          {progress && progress.skipped.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              Skipped so far:
              {progress.skipped.map((skill) => (
                <Badge key={skill} tone="outline">
                  {SKILL_LABELS[skill as keyof typeof SKILL_LABELS] ?? skill}
                </Badge>
              ))}
              · self-rated bands will be used for those.
            </p>
          )}
        </div>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/[0.06] px-3 py-2.5">
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <p className="min-w-0 flex-1 text-[13px] text-foreground">{error}</p>
              <Button variant="ghost" size="sm" onClick={clearError}>
                Dismiss
              </Button>
            </div>
          )}

          {step.unavailable ? (
            <EmptyState
              icon={AlertCircle}
              title={unavailableTitle(step)}
              description={unavailableDescription(step)}
              action={
                <Button loading={submitting} onClick={() => void skipStep()}>
                  Continue
                </Button>
              }
            />
          ) : step.skill === "writing" ? (
            <WritingStep step={step} />
          ) : step.skill === "speaking" ? (
            <SpeakingStep step={step} />
          ) : (
            <ObjectiveStep step={step} />
          )}
        </div>
      </div>
    </div>
  );
}
