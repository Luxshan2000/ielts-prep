import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Badge, Button, ErrorState, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { PrepareAudioPanel } from "../PrepareAudioPanel";
import {
  MockInProgressError,
  NeedsAudioError,
  NoContentError,
  buildSet,
  gradeSet,
  type RunnerParams,
} from "./api";
import { DictationItem } from "./DictationItem";
import { DrillReportView } from "./DrillReport";
import { KIND_LABEL, modeLabel } from "./labels";
import { NumbersItem } from "./NumbersItem";
import { PredictionItem } from "./PredictionItem";
import { RevealCard } from "./RevealCard";
import { SignpostItem } from "./SignpostItem";
import type { DrillReport, DrillResponse, DrillSet, ItemResult } from "./types";
import { StepCount } from "@/components/practice/StepCount";

type Phase = "loading" | "answer" | "reveal" | "report" | "error" | "needs-audio";

interface Answer {
  given: string;
  replays: number;
  startedAt: number;
  timeMs: number | null;
}

const EMPTY: Answer = { given: "", replays: 0, startedAt: 0, timeMs: null };

/**
 * One drill, start to finish: answer an item, hear what you missed, move on.
 *
 * **The loop is the design.** The reveal is not an appendix at the end of the set — it fires
 * after every single item, before the next one is shown, and it always contains the audio
 * again. A listening learner who is told what the answer was has been given a fact; a
 * listening learner who hears the three seconds it lived in has been given the lesson, which
 * is what that phrase sounds like at speed.
 *
 * **How it talks to the server.** A set is a pure function of `(filters, seed)` and the
 * sidecar stores nothing between calls, so each item is marked by re-posting the responses
 * so far with `record: false`. Only the final call, carrying every response and the elapsed
 * time, records the result — which is why one set produces exactly one `drill_results` row
 * however many items it had.
 *
 * **The unrendered-part case is a first-class state, not an error.** Three of the four kinds
 * need the recording, and a pack that has never been synthesized is one click from being
 * ready, so a 409 of that shape puts the existing render panel on screen instead of an
 * apology.
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
  const [fatal, setFatal] = useState<unknown>(null);
  const [needsAudio, setNeedsAudio] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [results, setResults] = useState<Record<string, ItemResult>>({});
  const [report, setReport] = useState<DrillReport | null>(null);
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(Date.now());
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    setPhase("loading");
    setNeedsAudio(null);
    startedRef.current = Date.now();
    buildSet(params)
      .then((built) => {
        if (!live) return;
        setSet(built);
        setAnswers(
          Object.fromEntries(
            built.items.map((item) => [item.item_id, { ...EMPTY, startedAt: Date.now() }]),
          ),
        );
        setCursor(0);
        setResults({});
        setReport(null);
        setPhase("answer");
      })
      .catch((err: unknown) => {
        if (!live) return;
        if (err instanceof NeedsAudioError) {
          setNeedsAudio(err.message);
          setPhase("needs-audio");
          return;
        }
        setFatal(err);
        setPhase("error");
      });
    return () => {
      live = false;
    };
  }, [params, reload]);

  const item = set?.items[cursor] ?? null;
  const answer = item ? (answers[item.item_id] ?? EMPTY) : EMPTY;
  const result = item ? results[item.item_id] : undefined;

  const responses: DrillResponse[] = useMemo(() => {
    const collected: DrillResponse[] = [];
    for (const entry of set?.items ?? []) {
      const value = answers[entry.item_id];
      // Unanswered items are omitted rather than sent blank. The server marks a missing
      // response as a blank anyway, and sending one would claim the learner had reached an
      // item they have not seen yet.
      if (!value?.given) continue;
      collected.push({
        item_id: entry.item_id,
        given: value.given,
        time_ms: value.timeMs,
        replays: value.replays,
      });
    }
    return collected;
  }, [set, answers]);

  const setGiven = useCallback(
    (next: string) => {
      if (!item) return;
      setAnswers((current) => ({
        ...current,
        [item.item_id]: { ...(current[item.item_id] ?? EMPTY), given: next },
      }));
    },
    [item],
  );

  const setReplays = useCallback(
    (count: number) => {
      if (!item) return;
      setAnswers((current) => ({
        ...current,
        [item.item_id]: { ...(current[item.item_id] ?? EMPTY), replays: count },
      }));
    },
    [item],
  );

  const submitItem = useCallback(async () => {
    if (!set || !item) return;
    const elapsed = Date.now() - (answer.startedAt || Date.now());
    const withTime = responses.map((entry) =>
      entry.item_id === item.item_id ? { ...entry, time_ms: elapsed } : entry,
    );
    setBusy(true);
    setError(null);
    try {
      // `record: false` — this call exists only to open one reveal. The drill row is
      // written by the single call at the end of the set.
      const marked = await gradeSet(params, set.seed, withTime, { record: false });
      setResults(Object.fromEntries(marked.results.map((entry) => [entry.item_id, entry])));
      setPhase("reveal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "that could not be marked");
    } finally {
      setBusy(false);
    }
  }, [set, item, answer.startedAt, responses, params]);

  const advance = useCallback(async () => {
    if (!set) return;
    if (cursor + 1 < set.items.length) {
      const next = set.items[cursor + 1];
      setAnswers((current) => ({
        ...current,
        [next.item_id]: { ...(current[next.item_id] ?? EMPTY), startedAt: Date.now() },
      }));
      setCursor(cursor + 1);
      setPhase("answer");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const finished = await gradeSet(params, set.seed, responses, {
        durationS: (Date.now() - startedRef.current) / 1000,
        record: true,
      });
      setReport(finished);
      setPhase("report");
    } catch (err) {
      setError(err instanceof Error ? err.message : "the set could not be recorded");
    } finally {
      setBusy(false);
    }
  }, [set, cursor, params, responses]);

  if (phase === "loading") {
    return (
      <div className="flex items-center gap-2 p-8 text-[13px] text-muted-foreground">
        <Spinner /> Building the set…
      </div>
    );
  }

  if (phase === "needs-audio") {
    return (
      <div className="space-y-4 rounded-xl border border-border p-4">
        <p className="text-[13px] leading-relaxed">{needsAudio}</p>
        {params.script_id && (
          <PrepareAudioPanel
            targetId={params.script_id}
            kind="script"
            ready={false}
            onDone={() => setReload((n) => n + 1)}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            Try again
          </Button>
          {onExit && (
            <Button variant="ghost" onClick={onExit}>
              Back to drills
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => onRestart?.({ ...params, kind: "prediction", mode: null })}
          >
            Do the no-audio drill instead
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "error" || !set) {
    return (
      <ErrorState
        error={fatal}
        title={
          fatal instanceof MockInProgressError
            ? "Drills are shut while a mock is running"
            : fatal instanceof NoContentError
              ? "Nothing here to drill yet"
              : "That drill could not be built"
        }
        fallback="The sidecar could not build the set."
      />
    );
  }

  if (phase === "report" && report) {
    return (
      <DrillReportView
        report={report}
        onAgain={() => onRestart?.(params)}
        onExit={onExit}
      />
    );
  }

  if (!item) return null;

  const answered = Boolean(answer.given && answer.given.trim());
  const mode = modeLabel(set.mode);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StepCount index={cursor} total={set.items.length} />
          <Badge tone="primary">{KIND_LABEL[set.kind]}</Badge>
          {mode && <Badge tone="outline">{mode}</Badge>}
        </div>
        {onExit && (
          <Button variant="ghost" onClick={onExit}>
            Stop
          </Button>
        )}
      </div>

      <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${((cursor + (phase === "reveal" ? 1 : 0)) / set.items.length) * 100}%` }}
        />
      </div>

      <div className={cn(phase === "reveal" && "opacity-70")}>
        {set.kind === "dictation" && (
          <DictationItem
            item={item}
            value={answer.given}
            onChange={setGiven}
            onReplay={setReplays}
            disabled={phase === "reveal"}
          />
        )}
        {set.kind === "numbers" && (
          <NumbersItem
            item={item}
            value={answer.given}
            onChange={setGiven}
            onReplay={setReplays}
            disabled={phase === "reveal"}
          />
        )}
        {set.kind === "signpost" && (
          <SignpostItem
            item={item}
            value={answer.given}
            onChange={setGiven}
            onReplay={setReplays}
            disabled={phase === "reveal"}
          />
        )}
        {set.kind === "prediction" && (
          <PredictionItem
            item={item}
            value={answer.given}
            onChange={setGiven}
            disabled={phase === "reveal"}
          />
        )}
      </div>

      {error && (
        <p role="alert" className="text-[13px] font-medium text-destructive">
          {error}
        </p>
      )}

      {phase === "answer" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void submitItem()} loading={busy} disabled={!answered}>
            Check it
          </Button>
          {!answered && (
            <span className="text-[12px] text-muted-foreground">
              {set.kind === "dictation"
                ? "Write what you can. A blank teaches nothing; a wrong guess is diagnostic."
                : "Commit to something. Guessing is free and blanks are not."}
            </span>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {result && <RevealCard result={result} mediaPath={set.script.audio.media_path} />}
          <Button onClick={() => void advance()} loading={busy}>
            {cursor + 1 < set.items.length ? "Next" : "Finish the set"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
