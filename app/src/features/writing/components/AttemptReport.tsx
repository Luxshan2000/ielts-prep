/**
 * The evaluation report (05 §6–§8): bands with evidence, the answer with inline
 * highlights, structure, vocabulary upgrades, a model answer, and — when this
 * attempt is a rewrite — the diff and band delta against its parent.
 */

import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { FeatureIcon } from "@/lib/featureRoute";
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardPaste,
  Clock,
  RefreshCw,
  Repeat2,
} from "lucide-react";
import { Badge, BandScore, Button, Card, CardContent, Tabs, TabPanel } from "@/components/ui";
import { formatDate, formatDuration } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  TASK_LABELS,
  genreLabel,
  useWritingStore,
  type WritingAttempt,
  type WritingEvaluation,
} from "../store";
import { AnnotatedEssay } from "./AnnotatedEssay";
import { BandDeltaStrip, DiffView, ResolvedErrors } from "./DiffView";
import { CriterionCards } from "./CriterionCards";
import { ModelAnswerPanel } from "./ModelAnswerPanel";
import { PromptPanel } from "./PromptPanel";
import { StructurePanel } from "./StructurePanel";
import { VocabUpgrades } from "./VocabUpgrades";

type TabValue = "feedback" | "answer" | "improve" | "rewrite";

function Stat({
  icon: Icon,
  children,
}: {
  icon?: FeatureIcon;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function AttemptReport({
  attempt,
  evaluation,
}: {
  attempt: WritingAttempt;
  evaluation: WritingEvaluation;
}) {
  const navigate = useNavigate();
  const rewriteAttempt = useWritingStore((s) => s.rewriteAttempt);
  const [tab, setTab] = useState<TabValue>("feedback");
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);

  const prompt = attempt.prompt;
  const parent = attempt.parent;

  const startRewrite = async (prefill: boolean) => {
    setRewriting(true);
    setRewriteError(null);
    const childId = await rewriteAttempt(attempt.id, { prefill, mode: "practice" });
    setRewriting(false);
    if (childId) navigate(`/writing/attempt/${childId}`);
    else setRewriteError(useWritingStore.getState().attemptError ?? "Couldn't open a rewrite.");
  };

  return (
    <div className="scrollbar-thin h-full min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-5 px-6 py-6">
        {/* header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/writing")} className="-ml-3">
              <ArrowLeft className="h-4 w-4" />
              Writing
            </Button>
            <h1 className="text-lg font-semibold text-foreground">
              {prompt ? TASK_LABELS[prompt.task_type] : "Writing attempt"}
            </h1>
            <div className="flex flex-wrap items-center gap-1.5">
              {prompt && <Badge tone="outline">{genreLabel(prompt.genre)}</Badge>}
              <Badge tone={attempt.mode === "exam" ? "primary" : "default"}>
                {attempt.mode === "exam" ? "Exam conditions" : "Practice"}
              </Badge>
              {parent && <Badge tone="warning">Rewrite</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Stat>{attempt.word_count} words</Stat>
              <Stat icon={Clock}>
                {formatDuration(attempt.seconds_elapsed)}
                {attempt.overtime_seconds > 0
                  ? ` (+${formatDuration(attempt.overtime_seconds)} over the limit)`
                  : ""}
              </Stat>
              {attempt.submitted_at && <Stat>submitted {formatDate(attempt.submitted_at)}</Stat>}
              {attempt.paste_events > 0 && (
                <Stat icon={ClipboardPaste}>
                  {attempt.paste_events} paste{attempt.paste_events === 1 ? "" : "s"}
                </Stat>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <BandScore band={evaluation.overall_band} size="lg" label="Overall" reveal />
            <div className="space-y-2">
              <Button loading={rewriting} onClick={() => void startRewrite(true)}>
                <Repeat2 className="h-4 w-4" />
                Rewrite with feedback
              </Button>
              <Button variant="outline" disabled={rewriting} onClick={() => void startRewrite(false)}>
                Start again from blank
              </Button>
            </div>
          </div>
        </div>

        {rewriteError && (
          <p role="alert" className="text-[13px] text-destructive">
            {rewriteError}
          </p>
        )}

        {attempt.integrity_flag === "pasted" && (
          <p className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3 text-[13px] text-muted-foreground">
            <ClipboardPaste className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            A large block was pasted into this attempt. That is recorded, not penalised — but the band
            below only means something if the words are yours.
          </p>
        )}

        {evaluation.prechecks.some((check) => check.level === "warn") && (
          <ul className="space-y-2">
            {evaluation.prechecks
              .filter((check) => check.level === "warn" && check.message)
              .map((check) => (
                <li
                  key={check.id}
                  className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3 text-[13px] text-muted-foreground"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  {check.message}
                </li>
              ))}
          </ul>
        )}

        {/* criterion strip */}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-around gap-4 p-4">
            {(["ta", "cc", "lr", "gra"] as const).map((key) => (
              <BandScore
                key={key}
                band={evaluation.bands[key]}
                size="sm"
                label={
                  key === "ta"
                    ? prompt?.task_type === "task2"
                      ? "Task Response"
                      : "Task Achievement"
                    : key === "cc"
                      ? "Coherence"
                      : key === "lr"
                        ? "Lexis"
                        : "Grammar"
                }
              />
            ))}
          </CardContent>
        </Card>

        <Tabs
          aria-label="Report sections"
          value={tab}
          onChange={(value) => setTab(value as TabValue)}
          items={[
            { value: "feedback", label: "Feedback" },
            { value: "answer", label: "Your answer", badge: evaluation.annotations.length || undefined },
            { value: "improve", label: "Improve" },
            ...(parent ? [{ value: "rewrite" as const, label: "Since last time" }] : []),
          ]}
        />

        <TabPanel value="feedback" active={tab === "feedback"}>
          <div className="space-y-4">
            <CriterionCards
              criteria={evaluation.criteria}
              bands={evaluation.bands}
              taskType={prompt?.task_type ?? null}
            />
            <StructurePanel analysis={evaluation.structure_analysis} />
          </div>
        </TabPanel>

        <TabPanel value="answer" active={tab === "answer"}>
          <div className="space-y-4">
            {prompt && (
              <Card>
                <CardContent className="p-4">
                  <button
                    type="button"
                    onClick={() => setPromptOpen((v) => !v)}
                    aria-expanded={promptOpen}
                    className={cn(
                      "text-[13px] font-medium text-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    {promptOpen ? "Hide the prompt" : "Show the prompt you answered"}
                  </button>
                  {promptOpen && (
                    <div className="mt-4">
                      <PromptPanel prompt={prompt} bare />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            <AnnotatedEssay
              text={attempt.essay_text}
              annotations={evaluation.annotations}
              unanchored={evaluation.unanchored}
            />
          </div>
        </TabPanel>

        <TabPanel value="improve" active={tab === "improve"}>
          <div className="space-y-4">
            <VocabUpgrades submissionId={attempt.id} suggestions={evaluation.vocab_suggestions} />
            <ModelAnswerPanel attemptId={attempt.id} outline={evaluation.model_answer_outline} />
          </div>
        </TabPanel>

        {parent && (
          <TabPanel value="rewrite" active={tab === "rewrite"}>
            <div className="space-y-4">
              <BandDeltaStrip
                before={parent.bands}
                after={evaluation.bands}
                overallBefore={parent.overall_band}
                overallAfter={evaluation.overall_band}
                taskType={prompt?.task_type ?? null}
              />
              <DiffView parent={parent} text={attempt.essay_text} />
              <ResolvedErrors parentAnnotations={parent.annotations ?? []} text={attempt.essay_text} />
            </div>
          </TabPanel>
        )}

        {attempt.evaluations.length > 1 && (
          <p className="flex items-center gap-2 pb-6 text-[12px] text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            This attempt has been marked {attempt.evaluations.length} times; you are seeing the latest.
          </p>
        )}
      </div>
    </div>
  );
}
