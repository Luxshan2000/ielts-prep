import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Headphones, Mic, PenLine, SkipForward, Volume2 } from "lucide-react";
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
  const docByNumber = new Map<number, { q: DocQuestion; groupOptions: DocQuestion["options"] }>();
  for (const group of content.passage?.question_groups ?? []) {
    for (const question of group.questions ?? []) {
      const number = question.number ?? question.n;
      if (typeof number === "number") {
        docByNumber.set(number, { q: question, groupOptions: group.options ?? null });
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
    };
  });
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
    if (!listening || !path) {
      setAudioUrl(null);
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
                  This passage shipped without body text. Skip the section — your self-rating
                  will be used for Reading.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <ol className="space-y-4">
        {questions.map((question) => (
          <li key={question.id} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="tabular text-[13px] font-semibold text-muted-foreground">
                {question.number}.
              </span>
              <span className="min-w-0 flex-1 text-[13px] text-foreground">
                {question.prompt}
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
              ? "General Training Task 1 — letter"
              : content.task_type === "ac_task1"
                ? "Academic Task 1 — describe the data"
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
            Aim for {min}–{max} words. This is a sampler, not a full Task 1 — length is not
            scored against you.
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
            ? "The timer is a guide — nothing submits automatically."
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
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
            {canRecord === false
              ? "Type your answers here — speech is not set up yet"
              : "Say your answers out loud, or type them"}
          </p>
          <p className="text-muted-foreground">
            {canRecord === false
              ? "Speech-to-text is not available in this build, so this sampler reads what you write. Set speech up in Settings and the Speaking room will listen properly."
              : "Speak each answer as you would in the exam and it is written down for you, or type it if that is easier. Either way you can correct what appears before you move on."}
          </p>
          <p className="text-muted-foreground">
            Either way, this sampler scores the language you produce — your words and your
            grammar — against the Fluency, Lexical Resource and Grammar descriptors. It does not
            judge your accent or your delivery. That happens in the Speaking room once your
            microphone and voice models are set up.
          </p>
          <p className="text-muted-foreground">
            {content.skip_hint ??
              "No time for this? Skip it — your self-rating is used for Speaking instead."}
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
          This card shipped without questions. Skip the section — your self-rating will be used
          for Speaking.
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

/** The placement sitting — one step at a time, every section individually skippable. */
export function PlacementRunner() {
  const { step, progress, estimatedMinutes, error, submitting, clearError, skipStep } =
    useOnboardingStore();

  if (!step) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-16">
        <EmptyState
          icon={AlertCircle}
          title="Scoring your placement…"
          description="Your writing and speaking samples are being scored against the band descriptors. This takes a few seconds."
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
              — self-rated bands will be used for those.
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
              title={`No ${SKILL_LABELS[step.skill].toLowerCase()} content is installed`}
              description="This build has no content pack for that section, so it cannot be sampled. Your self-rating will be used for this skill."
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
