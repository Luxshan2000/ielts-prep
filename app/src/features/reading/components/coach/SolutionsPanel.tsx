/**
 * "Worked solutions" — the reading counterpart of the writing band ladder, and the
 * one tab in the coach that is gated behind a submitted attempt.
 *
 * **Why it is gated.** In a receptive skill the answer span *is* the answer. There
 * is no model paragraph to admire and no craft to imitate: once you have been shown
 * which sentence carried the answer, the question is over and it cannot be asked
 * again. Reading the solution before the attempt does not teach the passage, it
 * spends it — so the keyed document is not even fetched until the gate opens.
 *
 * Every card runs in the same five-part order, because a solution read in a
 * different order every time is a solution nobody internalises:
 *
 *   Location → Paraphrase link → Decision rule → Distractor autopsy → Rule to reuse.
 *
 * Wrong answers open on a self-diagnosis first. Learners who can say what they did
 * wrong improve; learners who read explanations passively do not — and "I knew where
 * it was and still got it wrong" and "I never found it" are two different problems
 * with two different remedies.
 */

import { useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Circle,
  Lock,
  Quote,
  Repeat2,
  Search,
  XCircle,
} from "lucide-react";
import { Badge, Button, Card, CardContent, EmptyState, Tabs } from "@/components/ui";
import { cn } from "@/lib/cn";
import { qtypeLabel } from "../../qtypes";
import type { PassageAttemptRecord } from "./attempted";
import {
  DEVICES,
  GEARS,
  TRAPS,
  deviceChangesMeaning,
  deviceName,
  diagnosisLabel,
  trapName,
  trapsForType,
} from "./labels";
import { Callout, Chip, CopyChunk, LocateButton, SectionHead } from "./primitives";
import { diagnosisOf, useCoachStore } from "./store";
import { acceptedAnswers, type SolutionRow } from "./types";

export const GATE_REASON =
  "In reading, the answer span is the answer. Once you have seen which sentence carried it, this passage can never test you again, so the solutions open after you have sat it, not before.";

// ---------------------------------------------------------------------- gate ---

export function SolutionGate({
  reason,
  onPractise,
  onMock,
  starting,
}: {
  reason: string;
  onPractise?: () => void;
  onMock?: () => void;
  starting?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </span>
        <div className="max-w-xl space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            The worked solutions are locked until you have answered
          </h2>
          <p className="text-[13px] leading-6 text-muted-foreground">{reason}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onPractise && (
            <Button loading={starting} onClick={onPractise}>
              Answer this passage now
            </Button>
          )}
          {onMock && (
            <Button variant="outline" onClick={onMock}>
              Sit a full mock instead
            </Button>
          )}
        </div>
        <p className="max-w-xl text-[12px] leading-5 text-muted-foreground">
          Everything else in this coach stays open: the map, the strategy for each group, the
          paraphrase families and the vocabulary. None of that gives an answer away.
        </p>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------ self-diagnosis ---

function SelfDiagnose({
  passageId,
  row,
  given,
}: {
  passageId: string;
  row: SolutionRow;
  given: string;
}) {
  const diagnosis = useCoachStore((s) => diagnosisOf(s.diagnosis, passageId, row.number));
  const setDiagnosis = useCoachStore((s) => s.setDiagnosis);
  const reveal = useCoachStore((s) => s.reveal);
  const options = useMemo(() => trapsForType(row.qtype), [row.qtype]);

  return (
    <div className="space-y-4 rounded-xl border border-warning/40 bg-warning/8 p-4">
      <div>
        <p className="text-[13px] font-semibold text-foreground">
          Before the answer: what happened here?
        </p>
        <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
          You wrote {given.trim() === "" ? <em>nothing</em> : <strong>{given}</strong>}. Two
          questions, ten seconds, and the solution opens underneath.
        </p>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-[12px] font-medium text-foreground">
          Did you know where the answer was?
        </legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: "found", label: "I found the right place" },
              { value: "missed", label: "I never found it" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={diagnosis.located === option.value}
              onClick={() => setDiagnosis(passageId, row.number, { located: option.value })}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                diagnosis.located === option.value
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border bg-background hover:bg-accent",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="text-[12px] font-medium text-foreground">What went wrong?</legend>
        <div className="flex flex-wrap gap-1.5">
          {[...options, "unsure"].map((slug) => (
            <button
              key={slug}
              type="button"
              aria-pressed={diagnosis.trap === slug}
              title={TRAPS[slug]?.what}
              onClick={() => setDiagnosis(passageId, row.number, { trap: slug })}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                diagnosis.trap === slug
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border bg-background hover:bg-accent",
              )}
            >
              {slug === "unsure" ? "I'm not sure" : trapName(slug)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => reveal(passageId, row.number)}>
          Show the worked solution
        </Button>
        {diagnosis.located === null && diagnosis.trap === null && (
          <span className="text-[12px] text-muted-foreground">
            Guessing counts. The guess is what the solution corrects.
          </span>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- one card ---

function DiagnosisVerdict({
  passageId,
  row,
}: {
  passageId: string;
  row: SolutionRow;
}) {
  const diagnosis = useCoachStore((s) => diagnosisOf(s.diagnosis, passageId, row.number));
  if (diagnosis.located === null && diagnosis.trap === null) return null;

  const authored = (row.teaching?.traps ?? [])[0] ?? null;
  const agreed = authored !== null && diagnosis.trap === authored;

  return (
    <Callout tone={agreed ? "info" : "teach"} title="Your own diagnosis">
      {diagnosis.located && (
        <p>
          {diagnosis.located === "found"
            ? "You found the right place and still chose wrong. This is a technique problem, so the decision rule below is the part to read twice."
            : "You never found the place. This is a location problem, so the paraphrase link below is the part to read twice."}
        </p>
      )}
      {diagnosis.trap && diagnosis.trap !== "unsure" && authored && (
        <p className="mt-1">
          You called it <strong>{trapName(diagnosis.trap)}</strong>; the item was written to spring{" "}
          <strong>{trapName(authored)}</strong>.
          {agreed
            ? " Agreeing with the item writer about your own error is a good sign, so you can now watch for it."
            : " Where the two differ, the item writer's version is the one that will catch you again."}
        </p>
      )}
    </Callout>
  );
}

function ParaphraseRow({ row }: { row: SolutionRow }) {
  const link = row.teaching?.paraphrase_link ?? null;
  if (!link?.stem_phrase && !link?.text_phrase) return null;
  const devices = link.devices ?? [];
  const changing = deviceChangesMeaning(devices);

  return (
    <section className="space-y-2">
      <SectionHead
        title="The paraphrase link"
        hint="The pair the item was built from: the question's words, and the text's."
      />
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="stem">{link.stem_phrase}</Chip>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Chip tone="text">{link.text_phrase}</Chip>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {devices.map((device) => (
          <Chip key={device} tone={DEVICES[device]?.changes ? "warn" : "neutral"} title={DEVICES[device]?.what}>
            {deviceName(device)}
          </Chip>
        ))}
      </div>
      {link.note && <p className="text-[13px] leading-6 text-muted-foreground">{link.note}</p>}
      {changing && (
        <p className="text-[12px] leading-5 text-muted-foreground">
          One of those devices changes the meaning rather than preserving it, which is what
          makes a statement FALSE rather than TRUE.
        </p>
      )}
    </section>
  );
}

function DistractorList({ row, given }: { row: SolutionRow; given: string }) {
  const entries = row.teaching?.distractors ?? [];
  if (entries.length === 0) return null;
  const chosen = given.trim().toUpperCase();
  const ordered = [...entries].sort((a, b) => {
    const aPinned = String(a.key ?? "").trim().toUpperCase() === chosen ? 0 : 1;
    const bPinned = String(b.key ?? "").trim().toUpperCase() === chosen ? 0 : 1;
    return aPinned - bPinned;
  });

  return (
    <section className="space-y-2">
      <SectionHead
        title="Why the other answers fail"
        hint="This is where the marks are lost, so it is where the reading is done."
      />
      <ul className="space-y-2">
        {ordered.map((entry, index) => {
          const pinned = String(entry.key ?? "").trim().toUpperCase() === chosen && chosen !== "";
          return (
            <li
              key={`${entry.key}-${index}`}
              className={cn(
                "rounded-xl border p-3",
                pinned ? "border-destructive/50 bg-destructive/8" : "border-border bg-card",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-foreground">{entry.key}</span>
                {pinned && <Badge tone="destructive">What you chose</Badge>}
                {entry.diagnosis && (
                  <Badge tone="outline">{diagnosisLabel(entry.diagnosis)}</Badge>
                )}
              </div>
              {entry.why_tempting && (
                <p className="mt-1 text-[13px] leading-6 text-foreground">{entry.why_tempting}</p>
              )}
              {entry.why_wrong && (
                <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">
                  {entry.why_wrong}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SolutionBody({
  row,
  given,
  onLocate,
}: {
  row: SolutionRow;
  given: string;
  onLocate: (paragraphId: string, quote?: string | null) => void;
}) {
  const answers = acceptedAnswers(row.question);
  const quote = row.question.evidence_quote ?? null;
  const nearest = row.teaching?.nearest_text ?? null;

  return (
    <div className="space-y-5 border-t border-border pt-4">
      {/* 1 — Location: where the answer physically was. */}
      <section className="space-y-2">
        <SectionHead title="Where it was" />
        <div className="flex flex-wrap items-center gap-2">
          {answers.length > 0 ? (
            answers.map((answer) => (
              <Chip key={answer} tone="good" className="font-semibold">
                {answer}
              </Chip>
            ))
          ) : (
            <span className="text-[13px] text-muted-foreground">
              The key is not in this document.
            </span>
          )}
          {row.anchors.length > 0 && (
            <span className="text-[12px] text-muted-foreground">
              paragraph{row.anchors.length > 1 ? "s" : ""} {row.anchors.join(", ")}
            </span>
          )}
        </div>

        {quote && (
          <div className="rounded-xl border border-primary/40 bg-primary/8 p-3">
            <p className="flex items-start gap-2 text-[13px] leading-6 text-foreground">
              <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>{quote}</span>
            </p>
            <div className="mt-2">
              <LocateButton
                paragraph={row.anchor}
                onLocate={() => onLocate(row.anchor ?? "", quote)}
              />
            </div>
          </div>
        )}

        {nearest && (
          <div className="rounded-xl border border-warning/40 bg-warning/8 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-warning">
              The sentence that tempts you
            </p>
            <p className="mt-1 text-[13px] leading-6 text-foreground">{nearest}</p>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              It is the nearest the passage comes, and it is not the same claim. That gap is the
              reason this one is NOT GIVEN.
            </p>
            {row.anchor && (
              <div className="mt-2">
                <LocateButton
                  label="Read it in place"
                  paragraph={row.anchor}
                  onLocate={() => onLocate(row.anchor ?? "", nearest)}
                />
              </div>
            )}
          </div>
        )}

        {row.question.explanation && (
          <p className="text-[13px] leading-6 text-muted-foreground">{row.question.explanation}</p>
        )}
      </section>

      {/* 2 — The paraphrase link. */}
      <ParaphraseRow row={row} />

      {/* 3 — The decision rule. */}
      {row.teaching?.decision_rule && (
        <section className="space-y-2">
          <SectionHead title="Why that settles it" />
          <p className="text-[13px] leading-6 text-foreground">{row.teaching.decision_rule}</p>
          {row.teaching.grammar_cue && (
            <p className="text-[13px] leading-6 text-muted-foreground">
              <span className="font-medium text-foreground">The gap's grammar: </span>
              {row.teaching.grammar_cue}
            </p>
          )}
        </section>
      )}

      {/* 4 — The distractor autopsy. */}
      <DistractorList row={row} given={given} />

      {/* 5 — The rule that travels to the next passage. */}
      {row.teaching?.reusable_rule && (
        <section className="rounded-xl border border-border bg-muted/40 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="flex items-start gap-2 text-[13px] leading-6 text-foreground">
              <Repeat2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{row.teaching.reusable_rule}</span>
            </p>
            <CopyChunk text={row.teaching.reusable_rule} label="Copy the rule" />
          </div>
          <p className="mt-1 pl-6 text-[12px] leading-5 text-muted-foreground">
            This one carries to any passage. It says nothing about this text.
          </p>
        </section>
      )}
    </div>
  );
}

function SolutionCard({
  passageId,
  row,
  record,
  onLocate,
}: {
  passageId: string;
  row: SolutionRow;
  record: PassageAttemptRecord | null;
  onLocate: (paragraphId: string, quote?: string | null) => void;
}) {
  const diagnosis = useCoachStore((s) => diagnosisOf(s.diagnosis, passageId, row.number));
  const wrong = record?.wrong.includes(row.number) ?? false;
  const given = record?.given?.[String(row.number)] ?? "";
  const gear = String(row.teaching?.gear ?? "");
  // A question answered correctly needs no self-diagnosis; a wrong one does, and
  // that is the only thing standing between the learner and the solution.
  const open = !wrong || diagnosis.revealed;

  return (
    <Card id={`rd-solution-${row.number}`}>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-muted px-2 text-[13px] font-semibold tabular text-foreground">
            {row.number}
          </span>
          {record &&
            (wrong ? (
              <Badge tone="destructive">
                <XCircle className="mr-1 h-3 w-3" aria-hidden="true" />
                You got this wrong
              </Badge>
            ) : (
              <Badge tone="success">
                <BadgeCheck className="mr-1 h-3 w-3" aria-hidden="true" />
                Correct
              </Badge>
            ))}
          <Badge tone="outline">{qtypeLabel(row.qtype)}</Badge>
          {GEARS[gear] && (
            <Badge tone="default" title={GEARS[gear].what}>
              {GEARS[gear].name}
            </Badge>
          )}
          {row.question.band_target ? (
            <span className="text-[11px] tabular text-muted-foreground">
              band {row.question.band_target.toFixed(1)} item
            </span>
          ) : null}
          {(row.teaching?.traps ?? []).map((slug) => (
            <Badge key={slug} tone="warning" title={TRAPS[slug]?.what}>
              {trapName(slug)}
            </Badge>
          ))}
        </div>

        <p className="text-[14px] leading-6 text-foreground">{row.question.prompt}</p>

        {row.question.options && row.question.options.length > 0 && (
          <ul className="space-y-1">
            {row.question.options.map((option) => (
              <li key={option.key} className="text-[13px] leading-6 text-muted-foreground">
                <span className="mr-1.5 font-semibold text-foreground">{option.key}</span>
                {option.text}
              </li>
            ))}
          </ul>
        )}

        {wrong && !diagnosis.revealed && (
          <SelfDiagnose passageId={passageId} row={row} given={given} />
        )}

        {open && (
          <>
            {wrong && <DiagnosisVerdict passageId={passageId} row={row} />}
            <SolutionBody row={row} given={given} onLocate={onLocate} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------------------- panel ---

export interface SolutionsPanelProps {
  passageId: string;
  rows: SolutionRow[];
  record: PassageAttemptRecord | null;
  onLocate: (paragraphId: string, quote?: string | null) => void;
}

type Filter = "wrong" | "all";

export function SolutionsPanel({ passageId, rows, record, onLocate }: SolutionsPanelProps) {
  const revealAll = useCoachStore((s) => s.revealAll);
  const wrongNumbers = record?.wrong ?? [];
  const [filter, setFilter] = useState<Filter>(wrongNumbers.length > 0 ? "wrong" : "all");

  const visible = useMemo(
    () => (filter === "wrong" ? rows.filter((row) => wrongNumbers.includes(row.number)) : rows),
    [filter, rows, wrongNumbers],
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={BookOpenCheck}
        title="No worked solutions in this pack"
        description="These questions were authored before the teaching payload existed, so they carry a key and an explanation but no solution card."
      />
    );
  }

  return (
    <div className="space-y-4">
      {record && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
            <p className="text-[13px] leading-6 text-foreground">
              <span className="font-semibold tabular">
                {record.correct} of {record.total}
              </span>{" "}
              correct when you sat this passage
              {record.attempts > 1 ? ` (attempt ${record.attempts})` : ""}.
              {wrongNumbers.length > 0
                ? " Start with the ones you missed. The correct ones cost you nothing."
                : " Nothing to correct; read two or three solutions anyway and check your reasoning matched theirs."}
            </p>
            {wrongNumbers.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => revealAll(passageId, wrongNumbers)}
              >
                Skip the self-check
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {wrongNumbers.length > 0 && (
        <Tabs
          aria-label="Which solutions to show"
          value={filter}
          onChange={(value) => setFilter(value as Filter)}
          items={[
            { value: "wrong", label: "The ones you missed", badge: wrongNumbers.length },
            { value: "all", label: "Every question", badge: rows.length },
          ]}
        />
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={Circle}
          title="Nothing to show under that filter"
          description="Switch to every question to read the solutions for the ones you answered correctly."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((row) => (
            <SolutionCard
              key={row.number}
              passageId={passageId}
              row={row}
              record={record}
              onLocate={onLocate}
            />
          ))}
        </div>
      )}

      <p className="flex items-start gap-2 text-[12px] leading-5 text-muted-foreground">
        <Search className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Every quote above is a button: it scrolls the passage and highlights the exact span the
        answer came from. Seeing where it physically was is the point of the review.
      </p>
    </div>
  );
}
