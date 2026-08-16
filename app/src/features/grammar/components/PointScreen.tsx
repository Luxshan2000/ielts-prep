/**
 * One grammar point, end to end.
 *
 * The order on this screen is an argument, not a layout preference:
 *
 *   1. **what it means** — a learner who can conjugate the present perfect and
 *      cannot say when to reach for it has learned nothing usable;
 *   2. **how it is built** — cheap, and the part every book already does well, so
 *      it is compact and it is not allowed to dominate;
 *   3. **which one to use, and when** — the decision, in its own bordered panel,
 *      with the contrast pair side by side. This is what learners actually get
 *      wrong and it must never sit below a conjugation table (DESIGN §6 F2/F3);
 *   4. the mistakes this point causes, each with the plausible reasoning that
 *      produces it and the single edit that fixes it;
 *   5. where it earns marks in a real task — answered specifically, or not at all.
 *
 * One gate, matching the speaking and reading coaches: **the rule cannot be read
 * before the four-to-six meaning questions have been answered.** A rule read
 * before the learner has felt the problem is a fact to forget.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  BookmarkPlus,
  Check,
  ChevronRight,
  Lightbulb,
  Lock,
  Play,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { Badge, Button, ErrorState, Skeleton } from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { cn } from "@/lib/cn";
import {
  CRITERION_LABEL,
  REGISTER_LABEL,
  RISK_NOTE,
  ROLE_LABEL,
  STAGES,
  codeLabel,
  errorSurfaceNote,
  levelLabel,
  surfaceLabel,
} from "../labels";
import { useGrammarStore } from "../store";
import type { NoticeItem, PointDetail, Stage } from "../types";
import { DecisionPanel, WorkedPairs } from "./DecisionPanel";
import { Example, PairGrid, Section, StageBar, StateBadge } from "./primitives";
import { Visual } from "./Visual";

// ------------------------------------------------------------- meet gate ----

/**
 * The first meeting (stage 0): four to six real sentences, each with a question
 * about the *world* rather than about the grammar. Answering them is what earns
 * the rule — discovery first, explicit statement second, in that order.
 */
function MeetGate({
  notice,
  onComplete,
}: {
  notice: NoticeItem[];
  onComplete: () => void;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => notice.map(() => null));
  const answered = answers.filter((a) => a !== null).length;
  const allDone = answered === notice.length;

  return (
    <Section
      title="Meet it first"
      /* Most points carry five of these, not six, and the button underneath already
         counts them correctly — so a hardcoded "Six" made the section contradict itself. */
      hint={`${notice.length === 1 ? "One sentence" : `${notice.length} sentences`}. Say what each one tells you about the situation, not about the grammar. The rule comes after.`}
      emphasis
    >
      <ol className="space-y-4">
        {notice.map((entry, i) => {
          const chosen = answers[i];
          return (
            <li key={i} className="rounded-lg border border-border bg-background p-3">
              <p className="text-[15px] font-medium leading-relaxed text-foreground">{entry.sentence}</p>
              <p className="mt-1.5 text-[13px] text-muted-foreground">{entry.question}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {entry.options.map((option, oi) => {
                  const picked = chosen === oi;
                  const revealed = chosen !== null;
                  const isKey = entry.key === oi;
                  return (
                    <button
                      key={oi}
                      type="button"
                      disabled={revealed}
                      onClick={() => {
                        const next = [...answers];
                        next[i] = oi;
                        setAnswers(next);
                      }}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-[13px] transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        !revealed && "border-border hover:border-primary/50 hover:bg-accent",
                        revealed && isKey && "border-success bg-success/12 text-foreground",
                        revealed && !isKey && picked && "border-warning bg-warning/12 text-foreground",
                        revealed && !isKey && !picked && "border-border opacity-50",
                      )}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {chosen !== null && entry.why && (
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{entry.why}</p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={!allDone} onClick={onComplete}>
          {allDone ? "Now show me the rule" : `Answer all ${notice.length} first`}
        </Button>
        <span className="text-[12px] text-muted-foreground">
          {answered} of {notice.length} answered
        </span>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- header ----

function PointHeader({ detail }: { detail: PointDetail }) {
  const teach = detail.point_json.teach;
  const raw = Number(detail.card?.stage ?? 0);
  const stage = ((raw >= 0 && raw <= 5 ? raw : 0) as Stage);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StateBadge state={detail.state} />
        <Badge tone="outline">{ROLE_LABEL[detail.role as keyof typeof ROLE_LABEL] ?? detail.role}</Badge>
        {levelLabel(detail.cefr_level) && (
          <Badge tone="outline" title={`Common European Framework level ${detail.cefr_level}`}>
            {levelLabel(detail.cefr_level)}
          </Badge>
        )}
        {detail.point_json.register && (
          <Badge tone="outline">
            {REGISTER_LABEL[detail.point_json.register] ?? detail.point_json.register}
          </Badge>
        )}
        {detail.point_json.estimated_minutes ? (
          <Badge tone="outline">about {detail.point_json.estimated_minutes} min</Badge>
        ) : null}
      </div>

      <p className="text-[15px] font-medium leading-relaxed text-foreground">
        {teach.can_do || detail.title}
      </p>

      {teach.why_it_matters && (
        <p className="text-[13px] leading-relaxed text-muted-foreground">{teach.why_it_matters}</p>
      )}

      <div className="rounded-lg border border-border bg-card p-3">
        <StageBar stage={stage} cleared={detail.card?.cleared_stages} />
        <p className="mt-2 text-[12px] text-muted-foreground">
          You are on <span className="font-medium text-foreground">{STAGES[stage].name}</span>, where
          you{" "}
          {STAGES[stage].does.toLowerCase()}. Six rungs, and the last one is using it inside a real
          task.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- screen ----

export function PointScreen() {
  const { pointId = "" } = useParams();
  const navigate = useNavigate();
  const detail = useGrammarStore((s) => s.point);
  const loading = useGrammarStore((s) => s.pointLoading);
  const error = useGrammarStore((s) => s.pointError);
  const loadPoint = useGrammarStore((s) => s.loadPoint);
  const saveRule = useGrammarStore((s) => s.saveRule);
  const savedRules = useGrammarStore((s) => s.savedRules);

  const [gatePassed, setGatePassed] = useState(false);

  useEffect(() => {
    void loadPoint(pointId);
    setGatePassed(false);
  }, [loadPoint, pointId]);

  const teach = detail?.point_json.teach;
  const notice = useMemo(() => teach?.notice_set ?? [], [teach]);

  // A learner who has already climbed a rung has met it; only a cold point gates.
  const met = (detail?.card?.stage ?? 0) >= 1 || gatePassed;
  const gated = notice.length > 0 && !met;

  if (loading) {
    return (
      <PageShell title="Lesson" maxWidth="max-w-3xl">
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </PageShell>
    );
  }

  if (error || !detail) {
    return (
      <PageShell title="Lesson" maxWidth="max-w-3xl">
        <ErrorState
          error={error ?? "not found"}
          title="That lesson could not be opened"
          onRetry={() => void loadPoint(pointId)}
        />
      </PageShell>
    );
  }

  const pj = detail.point_json;
  const contrast = pj.contrast ?? null;
  const locked = detail.state === "locked";
  const ruleSaved = savedRules.includes(detail.id);
  const blockers = (detail.prerequisites ?? []).filter((p) => p.state === "locked" || p.state === "next");

  return (
    <PageShell
      back={{ to: "/grammar", label: "Grammar" }}
      title={detail.title}
      description={pj.grammar_name ?? undefined}
      maxWidth="max-w-3xl"
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={locked || gated}
            onClick={() => navigate(`/grammar/practice?point=${encodeURIComponent(detail.id)}`)}
          >
            <Play className="h-4 w-4" />
            {(detail.card?.stage ?? 0) > 0 ? "Practise this" : "Start practising"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pb-12">
        <PointHeader detail={detail} />

        {locked && blockers.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              This one comes later
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              It is built on something you have not done yet. Do that first and this will make sense
              the first time you read it, instead of the third.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {blockers.map((prereq) => (
                <Button
                  key={prereq.id}
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/grammar/point/${encodeURIComponent(prereq.id)}`)}
                >
                  {prereq.title}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ))}
            </div>
          </div>
        )}

        {gated ? (
          <MeetGate notice={notice} onComplete={() => setGatePassed(true)} />
        ) : (
          <>
            {/* 1 — what it means */}
            <Section title="What it means" hint="The job this form does in a sentence.">
              <p className="text-[14px] leading-relaxed text-foreground">{teach?.meaning}</p>
              {teach?.visual && <Visual visual={teach.visual} className="mt-4" />}
              {teach?.rule_line && (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-primary/8 px-3 py-2">
                  <p className="min-w-0 flex-1 text-[14px] font-medium text-foreground">
                    {teach.rule_line}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={ruleSaved}
                    onClick={() => void saveRule({ pointId: detail.id, ruleLine: teach.rule_line ?? "" })}
                  >
                    <BookmarkPlus className="h-4 w-4" />
                    {ruleSaved ? "In your rules" : "Add to my rules"}
                  </Button>
                </div>
              )}
              {teach?.false_rule && (
                <p className="mt-3 flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  <span>
                    <span className="font-medium text-foreground">You may have been told: </span>
                    {teach.false_rule}
                  </span>
                </p>
              )}
            </Section>

            {/* 2 — how it is built. Deliberately compact. */}
            {teach?.form && (
              <Section title="How it is built" hint="The cheap part. Read it once.">
                {teach.form.pattern && (
                  <p className="font-mono text-[14px] text-foreground">{teach.form.pattern}</p>
                )}
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {teach.form.negative && (
                    <p className="text-[13px] text-muted-foreground">
                      <span className="text-foreground">Negative: </span>
                      {teach.form.negative}
                    </p>
                  )}
                  {teach.form.question && (
                    <p className="text-[13px] text-muted-foreground">
                      <span className="text-foreground">Question: </span>
                      {teach.form.question}
                    </p>
                  )}
                </div>
                {teach.form.notes && teach.form.notes.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {teach.form.notes.map((note, i) => (
                      <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-muted-foreground">
                        <span aria-hidden="true">·</span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            )}

            {/* 3 — the decision. The reason this module exists. */}
            {contrast && (
              <>
                <DecisionPanel
                  contrast={contrast}
                  action={
                    contrast.board_id ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/grammar/board/${encodeURIComponent(contrast.board_id ?? "")}`)}
                      >
                        Open the board
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    ) : undefined
                  }
                />
                {contrast.worked_pairs && contrast.worked_pairs.length > 0 && (
                  <Section
                    title="Three pairs, worked"
                    hint="The span that decides each one is highlighted."
                  >
                    <WorkedPairs pairs={contrast.worked_pairs} />
                  </Section>
                )}
              </>
            )}

            {/* the narrated example — and what the other choice would have meant */}
            {teach?.worked_example && (
              <Section title="One example, narrated">
                <p className="text-[15px] font-medium leading-relaxed text-foreground">
                  {teach.worked_example.sentence}
                </p>
                <PairGrid className="mt-3">
                  {teach.worked_example.why_this_form && (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Why this form
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-foreground">
                        {teach.worked_example.why_this_form}
                      </p>
                    </div>
                  )}
                  {teach.worked_example.what_the_other_would_mean && (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        What the other one would have said
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-foreground">
                        {teach.worked_example.what_the_other_would_mean}
                      </p>
                    </div>
                  )}
                </PairGrid>
              </Section>
            )}

            {/* 4 — the mistakes, and the reasoning that produces them */}
            {pj.errors && pj.errors.length > 0 && (
              <Section
                title="What goes wrong here"
                hint="Each of these comes from a reasonable-looking step. Naming the step is what stops it."
              >
                <ul className="space-y-3">
                  {pj.errors.map((err, i) => (
                    <li key={i} className="rounded-lg border border-border bg-background p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="outline">{codeLabel(err.code)}</Badge>
                        {err.frequency === "very_high" && <Badge tone="warning">Very common</Badge>}
                      </div>
                      <div className="mt-2 space-y-1.5">
                        <Example tone="wrong">{err.wrong}</Example>
                        <Example tone="good">{err.right}</Example>
                      </div>
                      {err.why_it_happens && (
                        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                          {err.why_it_happens}
                        </p>
                      )}
                      {err.smallest_fix && (
                        <p className="mt-2 flex items-start gap-2 text-[13px] font-medium text-foreground">
                          <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                          {err.smallest_fix}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* 5 — where it earns marks */}
            {pj.pays_in && pj.pays_in.length > 0 && (
              <Section
                title="Where this earns marks"
                hint="Specific answers only. “It improves your grammar” is not one."
              >
                <ul className="space-y-2">
                  {pj.pays_in.map((pay, i) => (
                    <li key={i} className="rounded-lg border border-border bg-background p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="primary">{surfaceLabel(pay.surface)}</Badge>
                        {pay.mode === "receptive" && <Badge tone="outline">for reading it, not writing it</Badge>}
                      </div>
                      {pay.note && (
                        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{pay.note}</p>
                      )}
                      {pay.model && <Example className="mt-2">{pay.model}</Example>}
                    </li>
                  ))}
                </ul>
                {pj.criteria && pj.criteria.length > 0 && (
                  <p className="mt-3 text-[12px] text-muted-foreground">
                    Counts towards:{" "}
                    {pj.criteria.map((c) => CRITERION_LABEL[c] ?? c).join(", ")}
                  </p>
                )}
              </Section>
            )}

            {/* risk, for the structures that cost more than they pay under pressure */}
            {(pj.risk_tier === "C" || (pj.error_surface ?? 0) >= 3) && (
              <div className="rounded-xl border border-warning/40 bg-warning/8 p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ShieldAlert className="h-4 w-4 text-warning" aria-hidden="true" />
                  Worth knowing before you use this in a test
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {errorSurfaceNote(pj.error_surface)}{" "}
                  {pj.risk_tier ? RISK_NOTE[pj.risk_tier] ?? "" : ""}
                </p>
              </div>
            )}

            {/* what this opens up */}
            {detail.unlocks && detail.unlocks.length > 0 && (
              <Section title="What this leads to">
                <div className="flex flex-wrap gap-2">
                  {detail.unlocks.map((next) => (
                    <Button
                      key={next.id}
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/grammar/point/${encodeURIComponent(next.id)}`)}
                    >
                      {next.title}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ))}
                </div>
              </Section>
            )}

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
              <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
                Reading it is not learning it. The practice is where this becomes something you can
                use. Start with the sentences and finish with one of your own.
              </p>
              <Button
                disabled={locked}
                onClick={() => navigate(`/grammar/practice?point=${encodeURIComponent(detail.id)}`)}
              >
                <Play className="h-4 w-4" />
                Practise this
              </Button>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
