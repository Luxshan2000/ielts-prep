import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { Badge, Button, ErrorState, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { CHOICE_TYPES, LETTER_TYPES, choiceValues, qtypeLabel } from "../../qtypes";
import { AnswerInput } from "../AnswerInput";
import { LetterSelect, RadioChoices, SegmentedChoices } from "../Options";
import { errorText } from "../../store";
import { buildSet, gradeSet, type RunnerParams } from "./api";
import { JudgementItem, type JudgementAnswer } from "./JudgementItem";
import { ParaphraseItem, type ParaphraseAnswer } from "./ParaphraseItem";
import { SelfDiagnose } from "./SelfDiagnose";
import { SkimWindow } from "./SkimWindow";
import { SolutionCard } from "./SolutionCard";
import { DrillReportView } from "./DrillReport";
import { ExplainBackBox } from "./ExplainBackBox";
import { FORM_TRAP_LABEL } from "./labels";
import type { DrillItem, DrillReport, DrillResponse, DrillSet, ItemResult } from "./types";
import { StepCount } from "@/components/practice/StepCount";

type Phase = "loading" | "window" | "answer" | "reveal" | "report" | "error";

interface Answer {
  given: string;
  stageOne: string;
  device: string;
  selfTrap: string | null;
  startedAt: number;
  timeMs: number | null;
}

const EMPTY: Answer = {
  given: "",
  stageOne: "",
  device: "",
  selfTrap: null,
  startedAt: 0,
  timeMs: null,
};

/**
 * One drill, start to finish: answer an item, see what it was testing, move on.
 *
 * **The loop is the design.** A test you do not review is a measurement, not practice, so
 * the reveal is not an appendix at the end of the set — it fires after every single item,
 * before the next one is shown. The self-diagnosis picker sits *under the answer and above
 * the reveal*, which is the one sequencing decision the error-log research is unambiguous
 * about: a learner who commits to "I think I invented a comparison" and is then shown the
 * authored trap is checking themselves; a learner shown the trap first is reading.
 *
 * **How it talks to the server.** A set is a pure function of `(filters, seed)` and the
 * sidecar stores nothing between calls, so each item is marked by re-posting the responses
 * so far with `record: false` — deterministic, local, and no drill row written. Only the
 * last call, carrying every response and the elapsed time, records the result. That is why
 * one set produces exactly one `drill_results` row however many items it had.
 *
 * A skim drill inserts a `window` phase first, and closes the passage when the clock runs
 * out. Everything after that is the same loop.
 */
export function DrillRunner({
  params,
  onExit,
  onRestart,
}: {
  params: RunnerParams;
  onExit?: () => void;
  onRestart?: (params: RunnerParams) => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [set, setSet] = useState<DrillSet | null>(null);
  /** A build failure kills the whole runner; a grading failure is an inline retry. */
  const [fatal, setFatal] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [results, setResults] = useState<Record<string, ItemResult>>({});
  const [report, setReport] = useState<DrillReport | null>(null);
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(Date.now());

  useEffect(() => {
    let live = true;
    setPhase("loading");
    setFatal(null);
    setError(null);
    setCursor(0);
    setAnswers({});
    setResults({});
    setReport(null);
    startedRef.current = Date.now();
    buildSet(params)
      .then((built) => {
        if (!live) return;
        setSet(built);
        setPhase(built.kind === "skim" && built.window ? "window" : "answer");
      })
      .catch((err) => {
        if (!live) return;
        setFatal(err);
        setPhase("error");
      });
    return () => {
      live = false;
    };
    // `params` is a plain object rebuilt by the launcher only when a filter changes.
  }, [params]);

  const items = set?.items ?? [];
  const item = items[cursor] ?? null;

  // The clock on an item starts when it is first shown, not when the set was built.
  useEffect(() => {
    if (!item || phase !== "answer") return;
    setAnswers((current) =>
      current[item.item_id]?.startedAt
        ? current
        : { ...current, [item.item_id]: { ...EMPTY, startedAt: Date.now() } },
    );
  }, [item, phase]);

  const answer = item ? (answers[item.item_id] ?? EMPTY) : EMPTY;

  const responsesFor = useCallback(
    (upto: number): DrillResponse[] =>
      items.slice(0, upto + 1).map((entry) => {
        const value = answers[entry.item_id] ?? EMPTY;
        return {
          item_id: entry.item_id,
          given: value.given || null,
          stage_one: value.stageOne || null,
          device_choice: value.device || null,
          self_trap: value.selfTrap,
          time_ms: value.timeMs,
        };
      }),
    [items, answers],
  );

  const patch = (next: Partial<Answer>) => {
    if (!item) return;
    setAnswers((current) => ({
      ...current,
      [item.item_id]: { ...(current[item.item_id] ?? EMPTY), ...next },
    }));
  };

  async function check() {
    if (!set || !item) return;
    setBusy(true);
    setError(null);
    const elapsed = answer.startedAt ? Date.now() - answer.startedAt : null;
    const responses = responsesFor(cursor).map((entry) =>
      entry.item_id === item.item_id ? { ...entry, time_ms: elapsed } : entry,
    );
    try {
      const graded = await gradeSet(params, set.seed, responses, { record: false });
      const mine = graded.results.find((row) => row.item_id === item.item_id);
      if (mine) setResults((current) => ({ ...current, [item.item_id]: mine }));
      patch({ timeMs: elapsed });
      setPhase("reveal");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    if (!set) return;
    if (cursor + 1 < items.length) {
      setCursor(cursor + 1);
      setPhase("answer");
      return;
    }
    setBusy(true);
    try {
      const finished = await gradeSet(params, set.seed, responsesFor(items.length - 1), {
        record: true,
        durationS: (Date.now() - startedRef.current) / 1000,
      });
      setReport(finished);
      setPhase("report");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const answered = useMemo(() => {
    if (!item) return false;
    if (item.kind === "paraphrase") return Boolean(answer.given);
    if (item.two_stage) {
      return answer.stageOne === item.two_stage.not_given_label
        ? true
        : Boolean(answer.stageOne && answer.given);
    }
    return Boolean(answer.given.trim());
  }, [item, answer]);

  if (phase === "loading") {
    return (
      <div className="flex items-center gap-2 p-8 text-[13px] text-muted-foreground">
        <Spinner /> Building the set…
      </div>
    );
  }

  if (phase === "error" || !set) {
    return (
      <ErrorState
        error={fatal}
        title="This drill could not be built"
        fallback="Nothing in the bank matches those filters yet."
        onRetry={onExit}
        retryLabel="Back to drills"
      />
    );
  }

  if (phase === "window" && set.window) {
    return <SkimWindow set={set} plan={set.window} onDone={() => setPhase("answer")} />;
  }

  if (phase === "report" && report) {
    return (
      <DrillReportView
        report={report}
        params={params}
        onExit={onExit}
        onRestart={onRestart}
      />
    );
  }

  if (!item) {
    return (
      <ErrorState
        error={null}
        title="Nothing to answer"
        fallback="This set came back empty. Try a different filter."
        onRetry={onExit}
        retryLabel="Back to drills"
      />
    );
  }

  const result = results[item.item_id];
  const showing = phase === "reveal" && result;

  return (
    <div className="space-y-4">
      <Progress
        set={set}
        index={cursor}
        total={items.length}
        correct={Object.values(results).filter((r) => r.correct).length}
        onExit={onExit}
      />

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{qtypeLabel(item.qtype)}</Badge>
          {item.strategy?.order_badge && (
            <Badge tone="outline">{item.strategy.order_badge}</Badge>
          )}
          {item.passage_title && (
            <span className="text-[11px] text-muted-foreground">
              from &ldquo;{item.passage_title}&rdquo;
            </span>
          )}
          {item.difficulty && <Badge tone="outline">{item.difficulty}</Badge>}
        </div>

        {item.instructions && (
          <p className="text-[13px] font-medium">{item.instructions}</p>
        )}

        <ItemContext item={item} />

        {item.kind !== "paraphrase" && (
          <p className="text-[14px] font-medium leading-relaxed">{item.prompt}</p>
        )}

        <ItemControl
          item={item}
          answer={answer}
          disabled={Boolean(showing) || busy}
          onChange={patch}
        />
      </section>

      {!showing && (
        <SelfDiagnose
          options={item.self_diagnosis_options ?? []}
          value={answer.selfTrap}
          disabled={busy}
          onChange={(slug) => patch({ selfTrap: slug })}
        />
      )}

      {showing && result && (
        <>
          <Outcome result={result} />
          <SolutionCard
            reveal={result.reveal}
            given={result.marking.given}
            diagnosis={result.self_diagnosis}
            twoStage={result.two_stage}
          />
          {result.question_id && result.reveal.decision_rule && (
            <ExplainBackBox
              questionId={result.question_id}
              selfTrap={result.self_diagnosis.picked}
            />
          )}
        </>
      )}

      {error && <p className="text-[12px] text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {!showing ? (
          <Button onClick={check} loading={busy} disabled={!answered || busy}>
            Check
          </Button>
        ) : (
          <Button onClick={advance} loading={busy} disabled={busy}>
            {cursor + 1 < items.length ? "Next question" : "Finish and record"}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
        {onExit && (
          <Button variant="ghost" onClick={onExit} disabled={busy}>
            Leave
          </Button>
        )}
      </div>
    </div>
  );
}

function Progress({
  set,
  index,
  total,
  correct,
  onExit,
}: {
  set: DrillSet;
  index: number;
  total: number;
  correct: number;
  /** A drill mid-flight had no way out but the sidebar; Listening's runner has had one. */
  onExit?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <StepCount index={index} total={total} />
        <span className="text-[13px] font-medium">
          {set.trap_info ? set.trap_info.name : (set.qtype ? qtypeLabel(set.qtype) : null)}
          {!set.trap_info && !set.qtype && "Practice"}
        </span>
        {set.bounded && <Badge tone="outline">Bounded search</Badge>}
        {set.two_stage && <Badge tone="outline">Two-stage</Badge>}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground tabular">
          {correct} right so far
        </span>
        {onExit && (
          <Button variant="ghost" size="sm" onClick={onExit}>
            Stop
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The text an item is allowed to show. `band` is bounded search — the stretch the answer
 * must lie in rather than the paragraph it is in — and it is labelled as such, because a
 * learner who thinks they were handed the anchor learns the wrong lesson from finding it.
 */
function ItemContext({ item }: { item: DrillItem }) {
  const context = item.context;
  if (!context || context.kind === "none") {
    return context?.note ? (
      <p className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
        {context.note}
      </p>
    ) : null;
  }
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      {context.kind === "band" && (
        <p className="text-[11px] font-medium text-primary">
          Bounded search: paragraphs {context.paragraph_ids.join("-")}
        </p>
      )}
      {(context.paragraphs ?? []).map((para) => (
        <div key={para.id} className="flex gap-2.5">
          <span className="w-5 shrink-0 text-[13px] font-bold tabular text-primary">
            {para.id}
          </span>
          <p className="min-w-0 text-[13px] leading-relaxed">{para.text}</p>
        </div>
      ))}
      {context.note && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{context.note}</p>
      )}
    </div>
  );
}

function ItemControl({
  item,
  answer,
  disabled,
  onChange,
}: {
  item: DrillItem;
  answer: Answer;
  disabled?: boolean;
  onChange: (next: Partial<Answer>) => void;
}) {
  const label = `Question ${item.index}: ${item.prompt}`;

  if (item.kind === "paraphrase") {
    const value: ParaphraseAnswer = { given: answer.given, device: answer.device };
    return (
      <ParaphraseItem
        item={item}
        value={value}
        disabled={disabled}
        onChange={(next) => onChange({ given: next.given, device: next.device })}
      />
    );
  }

  if (CHOICE_TYPES.has(item.qtype)) {
    const value: JudgementAnswer = { given: answer.given, stageOne: answer.stageOne };
    return (
      <JudgementItem
        item={item}
        value={value}
        disabled={disabled}
        onChange={(next) => onChange({ given: next.given, stageOne: next.stageOne })}
      />
    );
  }

  const options = item.options ?? [];
  if (item.qtype === "multiple_choice" && options.length > 0) {
    return (
      <RadioChoices
        name={`drill-${item.item_id}`}
        ariaLabel={label}
        options={options}
        value={answer.given}
        onChange={(next) => onChange({ given: next })}
      />
    );
  }
  if (LETTER_TYPES.has(item.qtype) && options.length > 0) {
    return (
      <LetterSelect
        ariaLabel={label}
        options={options}
        value={answer.given}
        onChange={(next) => onChange({ given: next })}
      />
    );
  }
  if (CHOICE_TYPES.has(item.qtype)) {
    return (
      <SegmentedChoices
        name={`drill-${item.item_id}`}
        ariaLabel={label}
        values={choiceValues(item.qtype)}
        value={answer.given}
        onChange={(next) => onChange({ given: next })}
      />
    );
  }
  return (
    <AnswerInput
      ariaLabel={label}
      value={answer.given}
      wordLimit={item.word_limit}
      disabled={disabled}
      onChange={(next) => onChange({ given: next })}
    />
  );
}

/**
 * Right or wrong, said in one line — and where a form or pacing failure is what happened,
 * it is named as one. An over-limit answer and a missed contradiction are different
 * problems with different fixes, and a bare "wrong" hides which you had.
 */
function Outcome({ result }: { result: ItemResult }) {
  const form = result.marking.form_trap;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2",
        result.correct
          ? "border-success/50 bg-success/5"
          : "border-destructive/50 bg-destructive/5",
      )}
    >
      {result.correct ? (
        <Check className="h-4 w-4 text-success" aria-hidden="true" />
      ) : (
        <X className="h-4 w-4 text-destructive" aria-hidden="true" />
      )}
      <span className="text-[13px] font-medium">
        {result.correct ? "Correct" : "Not this time"}
      </span>
      {!result.correct && result.marking.given && (
        <span className="text-[12px] text-muted-foreground">
          you wrote &ldquo;{result.marking.given}&rdquo;
        </span>
      )}
      {form && FORM_TRAP_LABEL[form] && (
        <Badge tone="warning" title={FORM_TRAP_LABEL[form]}>
          {FORM_TRAP_LABEL[form]}
        </Badge>
      )}
    </div>
  );
}
