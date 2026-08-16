/**
 * The plan tab: how the minutes split, what each paragraph is for, and the worked
 * plan for this exact prompt.
 *
 * Three rules from the content contract are visible in this file rather than merely
 * respected by it:
 *
 *  - the four phase minutes are fixed per task type, and the asymmetry *is* the
 *    teaching — a letter needs less planning and more checking than an essay;
 *  - the plan lines are notes, not prose: they render in a monospaced note voice so
 *    nobody mistakes them for sentences to copy into the answer;
 *  - `plan.trap` names the omission this prompt provokes and is shown **after** the
 *    attempt only, as a check. Before the attempt it would just be the answer.
 */

import { CheckCircle2, Clock, PencilRuler } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { phaseFill, phaseLabel, roleLabel } from "./labels";
import { Callout, SectionHead } from "./primitives";
import type { WritingTeaching } from "./types";
import type { TaskType } from "../../store";

export interface PlanPanelProps {
  teaching: WritingTeaching;
  taskType: TaskType;
  /** Post-submit material stays shut until there is a submitted attempt. */
  attempted: boolean;
}

export function PlanPanel({ teaching, taskType, attempted }: PlanPanelProps) {
  const phases = teaching.time_plan ?? [];
  const total = phases.reduce((sum, p) => sum + (p.minutes ?? 0), 0);
  const structure = teaching.structure_plan ?? [];
  const budget = structure.reduce((sum, p) => sum + (p.words ?? 0), 0);
  const plan = teaching.plan;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------ the minutes --- */}
      {phases.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title={`The ${total} minutes, spent`}
            hint="A procedure, not a countdown. The last block is checking time, and it is the cheapest band you will ever buy."
          />

          <div
            className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={phases
              .map((p) => `${phaseLabel(p.phase)} ${p.minutes} minutes`)
              .join(", ")}
          >
            {phases.map((phase, i) => (
              <span
                key={i}
                className={cn("h-full", phaseFill(phase.phase))}
                style={{ width: `${total > 0 ? (phase.minutes / total) * 100 : 0}%` }}
              />
            ))}
          </div>

          <ol className="grid gap-2 sm:grid-cols-2">
            {phases.map((phase, i) => (
              <li key={i} className="rounded-xl border border-border bg-card p-3.5">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                  <span
                    className={cn("h-2.5 w-2.5 rounded-full", phaseFill(phase.phase))}
                    aria-hidden="true"
                  />
                  {phaseLabel(phase.phase)}
                  <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-normal tabular text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {phase.minutes} min
                  </span>
                </p>
                <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{phase.does}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ---------------------------------------------------- the paragraphs --- */}
      {structure.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title="The paragraph skeleton for this question type"
            hint={`${structure.length} paragraphs, about ${budget} words. The word figures are budgets, not counts. The body paragraphs must be visibly the longest.`}
          />
          <ol className="space-y-2">
            {structure.map((para) => (
              <li key={para.para} className="flex gap-3 rounded-xl border border-border bg-card p-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[13px] font-semibold text-primary">
                  {para.para}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[14px] font-semibold text-foreground">
                      {roleLabel(para.role)}
                    </span>
                    <span className="text-[12px] tabular text-muted-foreground">
                      ≈ {para.words} words
                    </span>
                  </p>
                  <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">
                    {para.must_do}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ---------------------------------------------------- the worked plan --- */}
      {plan && (plan.lines?.length ?? 0) > 0 && (
        <section className="space-y-3">
          <SectionHead
            title="What a good plan for this prompt looks like"
            hint="Written the way somebody under time pressure actually writes: arrows, abbreviations, no finite verbs. Prose in a plan is a draft you will copy."
          />
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <ul className="divide-y divide-border">
              {(plan.lines ?? []).map((line, i) => (
                <li key={i} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:w-24">
                    {line.label}
                  </span>
                  <span className="min-w-0 font-mono text-[12.5px] leading-6 text-foreground">
                    {line.note}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {plan.test && (
            <Callout tone="teach" title="Is the plan good enough?">
              {plan.test}
            </Callout>
          )}

          {plan.trap &&
            (attempted ? (
              <Callout tone="warn" title="The omission this prompt provokes">
                {plan.trap}
              </Callout>
            ) : (
              <p className="flex items-start gap-2 rounded-xl border border-dashed border-border p-3 text-[12px] leading-5 text-muted-foreground">
                <PencilRuler className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                There is one more note here: the thing most people leave out of this task. It
                opens after you have written it, because reading it first turns a trap into an
                instruction.
              </p>
            ))}
        </section>
      )}

      {/* ------------------------------------------------- the last 3 minutes --- */}
      {(teaching.checklist?.length ?? 0) > 0 && (
        <section className="space-y-3">
          <SectionHead
            title="The last three minutes"
            hint="In execution order. 'Proofread' finds nothing; each of these finds one specific thing."
          />
          <ul className="space-y-1.5">
            {(teaching.checklist ?? []).map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] leading-6 text-foreground">
                <CheckCircle2
                  className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* -------------------------------------------------- per-type briefing --- */}
      {taskType === "gt_task1" && teaching.letter_brief && (
        <LetterBriefing brief={teaching.letter_brief} />
      )}
      {taskType === "task2" && teaching.essay_brief && (
        <EssayBriefing brief={teaching.essay_brief} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the letter ---

function LetterBriefing({ brief }: { brief: NonNullable<WritingTeaching["letter_brief"]> }) {
  const bullets = brief.bullet_notes ?? [];
  const signals = brief.register_signals ?? [];

  return (
    <section className="space-y-3">
      <SectionHead
        title="Register, and what each bullet has to do"
        hint="Register lives inside Task Achievement, not style: the criterion asks for a tone that suits the reader and holds from the greeting to the sign-off."
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Who you are writing to
          </p>
          <p className="mt-1 text-[13px] leading-6 text-foreground">{brief.recipient}</p>
          {brief.purpose_label && (
            <Badge tone="outline" className="mt-2">
              {brief.purpose_label}
            </Badge>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            The pairing
          </p>
          <p className="mt-1 font-mono text-[13px] leading-7 text-foreground">
            {brief.greeting}
            <br />…<br />
            {brief.signoff}
          </p>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            The greeting decides the sign-off. Getting the pair wrong is the most avoidable loss
            in this task and takes four seconds to check.
          </p>
        </div>
      </div>

      {bullets.length > 0 && (
        <ol className="space-y-2">
          {bullets.map((note) => (
            <li key={note.bullet_index} className="rounded-xl border border-border bg-card p-3.5">
              <p className="flex flex-wrap items-baseline gap-2">
                <span className="text-[14px] font-semibold text-foreground">
                  Bullet {note.bullet_index + 1}
                </span>
                <span className="text-[12px] text-muted-foreground">{note.function}</span>
              </p>
              <dl className="mt-2 space-y-1.5 text-[13px] leading-6">
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted-foreground">Must include</dt>
                  <dd className="min-w-0 text-foreground">{note.must_include}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted-foreground">Then extend</dt>
                  <dd className="min-w-0 text-foreground">{note.extension_move}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted-foreground">Tone here</dt>
                  <dd className="min-w-0 text-muted-foreground">{note.tone_note}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      )}

      {signals.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[34rem] border-collapse text-[13px]">
            <caption className="sr-only">Register signals for this letter</caption>
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th scope="col" className="p-2.5 font-semibold">
                  Signal
                </th>
                <th scope="col" className="p-2.5 font-semibold">
                  In this register
                </th>
                <th scope="col" className="p-2.5 font-semibold">
                  Not this
                </th>
              </tr>
            </thead>
            <tbody>
              {signals.map((signal, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="p-2.5 align-top text-muted-foreground">{signal.signal}</td>
                  <td className="p-2.5 align-top text-foreground">{signal.do}</td>
                  <td className="p-2.5 align-top text-muted-foreground line-through decoration-muted-foreground/60">
                    {signal.dont}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {brief.drift_watch && (
        <Callout tone="warn" title="Where the register will slip">
          {brief.drift_watch}
        </Callout>
      )}
    </section>
  );
}

// ------------------------------------------------------------------- the essay ---

function EssayBriefing({ brief }: { brief: NonNullable<WritingTeaching["essay_brief"]> }) {
  const ideas = brief.idea_bank ?? [];
  const sides = [...new Set(ideas.map((idea) => idea.side))];

  return (
    <section className="space-y-3">
      <SectionHead
        title="The parts this question actually has"
        hint="Answering two thirds of a three-part question is the commonest way to cap criterion 1, and it is almost always an accident."
      />

      {brief.obligatory_shape && (
        <Callout tone="teach" title={brief.question_type ?? "What a full response does"}>
          {brief.obligatory_shape}
        </Callout>
      )}

      {(brief.position_touchpoints?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-border bg-card p-3.5">
          <p className="text-[13px] font-semibold text-foreground">
            Your position has to be visible in three places
          </p>
          <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
            If deleting your last sentence removes your opinion, it was a band-6 essay.
          </p>
          <ol className="mt-2 space-y-1.5">
            {(brief.position_touchpoints ?? []).map((point, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-6 text-foreground">
                <span className="shrink-0 text-muted-foreground tabular">{i + 1}.</span>
                {point}
              </li>
            ))}
          </ol>
        </div>
      )}

      {ideas.length > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-foreground">
            Arguments, with the mechanism attached
          </p>
          <p className="text-[12px] leading-5 text-muted-foreground">
            Claim → why it follows → a specific case → who is better or worse off. That chain is
            what the 6→7 step consists of, and it is why these are arguments rather than
            vocabulary.
          </p>
          <div className="grid gap-2 lg:grid-cols-2">
            {sides.map((side) => (
              <div key={side} className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {side}
                </p>
                {ideas
                  .filter((idea) => idea.side === side)
                  .map((idea, i) => (
                    <div key={i} className="rounded-xl border border-border bg-card p-3.5">
                      <p className="text-[13px] font-semibold leading-6 text-foreground">
                        {idea.claim}
                      </p>
                      <dl className="mt-2 space-y-1 text-[12.5px] leading-6">
                        <div className="flex gap-2">
                          <dt className="w-20 shrink-0 text-muted-foreground">Mechanism</dt>
                          <dd className="min-w-0 text-foreground">{idea.mechanism}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-20 shrink-0 text-muted-foreground">Case</dt>
                          <dd className="min-w-0 text-foreground">{idea.evidence}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-20 shrink-0 text-muted-foreground">So what</dt>
                          <dd className="min-w-0 text-foreground">{idea.consequence}</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {brief.development_drill && (
        <Callout tone="teach" title="Develop one yourself">
          <span className="block font-medium text-foreground">
            “{brief.development_drill.claim}”
          </span>
          {brief.development_drill.ask}
        </Callout>
      )}

      {brief.memorisation_test && (
        <Callout tone="info" title="Why a memorised essay cannot answer this">
          {brief.memorisation_test}
        </Callout>
      )}
    </section>
  );
}
