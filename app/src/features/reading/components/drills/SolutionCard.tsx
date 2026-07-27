import { ArrowRight, MapPin, Quote, Target } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Reveal, SelfDiagnosis, TwoStageResult, VerdictContrast } from "./types";
import { TWO_STAGE_VERDICT, verdictTone } from "./labels";

/**
 * The reveal, in the one order it is ever shown:
 *
 *   Location → Paraphrase link → Decision rule → Distractor autopsy → Rule to reuse
 *
 * Reading has no model answer — the learner produced a key match, not language — so the
 * equivalent of a band ladder is this pair: the point of *right*, and the whole space of
 * *wrong*. The distractor autopsy is not decoration. The marks in a reading paper are
 * lost between two plausible options, so an explanation that only justifies the key
 * teaches nothing, and the option the learner actually chose is pinned to the top of the
 * list because it is the only row they will certainly read.
 *
 * On a judgement item the card opens with `VerdictBoundary` instead, because on TFNG the
 * lesson is never "the answer is NOT GIVEN" — it is what would have had to be printed for
 * FALSE to have been right.
 *
 * Every field is optional. Pre-payload rows carry only `explanation`, and this renders
 * them without looking like something failed to load.
 */
export function SolutionCard({
  reveal,
  given,
  diagnosis,
  twoStage,
  className,
}: {
  reveal: Reveal;
  given: string;
  diagnosis?: SelfDiagnosis | null;
  twoStage?: TwoStageResult | null;
  className?: string;
}) {
  const location = reveal.location;
  const link = reveal.paraphrase_link;
  const chosen = given.trim().toUpperCase();
  // The drill route already pins the chosen option, but this card is also rendered from an
  // attempt's own review payload, so the guarantee is enforced here rather than assumed.
  const autopsy = [...(reveal.distractors ?? [])].sort(
    (a, b) =>
      Number(b.key.toUpperCase() === chosen) - Number(a.key.toUpperCase() === chosen),
  );

  return (
    <div className={cn("space-y-4 rounded-xl border border-border bg-card p-4", className)}>
      <Header reveal={reveal} />

      {twoStage?.available && twoStage.diagnosis && <TwoStageVerdict result={twoStage} />}

      {reveal.contrast && <VerdictBoundary contrast={reveal.contrast} chosen={given} />}

      {/* 1 — Location. "I never found it" and "I found it and misread it" are two
          diagnoses with two remedies, so the card always says which paragraph. */}
      {location && (location.evidence_quote || location.nearest_text) && (
        <Section icon={<MapPin className="h-3.5 w-3.5" aria-hidden="true" />} title="Location">
          {location.anchor_paragraphs.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Paragraph {location.anchor_paragraphs.join(", ")}
              {location.passage_title ? ` · ${location.passage_title}` : ""}
            </p>
          )}
          {location.evidence_quote ? (
            <blockquote className="mt-1.5 border-l-2 border-primary/50 pl-3 text-[13px] italic leading-relaxed">
              {location.evidence_quote}
            </blockquote>
          ) : (
            <div className="mt-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">
                The sentence that tempts you
              </p>
              <blockquote className="mt-1 border-l-2 border-warning/60 pl-3 text-[13px] italic leading-relaxed">
                {location.nearest_text}
              </blockquote>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                There is no evidence span here, and the reason for the emptiness is the lesson.
              </p>
            </div>
          )}
        </Section>
      )}

      {/* 2 — The paraphrase link: the highest-value row on the card. Reading is
          paraphrase recognition, so this says which phrase became which. */}
      {link && (
        <Section
          icon={<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
          title="Paraphrase link"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Chip>{link.stem_phrase}</Chip>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
              {link.devices.map((d) => d.replace(/_/g, " ")).join(" · ") || "restated"}
            </span>
            <Chip tone="text">{link.text_phrase}</Chip>
          </div>
          {link.note && <p className="mt-1.5 text-[12px] text-muted-foreground">{link.note}</p>}
        </Section>
      )}

      {/* 3 — Why that reading is forced and no other is available. */}
      {(reveal.decision_rule || reveal.explanation) && (
        <Section icon={<Target className="h-3.5 w-3.5" aria-hidden="true" />} title="Decision rule">
          <p className="text-[13px] leading-relaxed">
            {reveal.decision_rule ?? reveal.explanation}
          </p>
          {reveal.decision_rule && reveal.explanation && (
            <p className="mt-1.5 text-[12px] text-muted-foreground">{reveal.explanation}</p>
          )}
          {reveal.grammar_cue && (
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              Grammar cue: {reveal.grammar_cue}
            </p>
          )}
        </Section>
      )}

      {/* 4 — The distractor autopsy: where the marks actually went. */}
      {autopsy.length > 0 && (
        <Section
          icon={<Quote className="h-3.5 w-3.5" aria-hidden="true" />}
          title="Why the others pull"
        >
          <ul className="space-y-2">
            {autopsy.map((entry, position) => {
              const picked = entry.key.toUpperCase() === chosen;
              return (
                <li
                  key={entry.key}
                  className={cn(
                    "rounded-lg border p-2.5",
                    picked ? "border-destructive/50 bg-destructive/5" : "border-border",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold tabular">{entry.key}</span>
                    {picked && <Badge tone="destructive">You chose this</Badge>}
                    {entry.diagnosis && (
                      <Badge tone="outline">{entry.diagnosis.replace(/_/g, " ")}</Badge>
                    )}
                    {position === 0 && !picked && <Badge tone="outline">Most tempting</Badge>}
                  </div>
                  {entry.why_tempting && (
                    <p className="mt-1 text-[13px] leading-relaxed">{entry.why_tempting}</p>
                  )}
                  {entry.why_wrong && (
                    <p className="mt-1 text-[12px] text-muted-foreground">{entry.why_wrong}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* 5 — The sentence the learner carries to a different passage. */}
      {reveal.reusable_rule && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
            Rule to reuse
          </p>
          <p className="mt-1 text-[13px] leading-relaxed">{reveal.reusable_rule}</p>
        </div>
      )}

      {diagnosis?.comparable && <DiagnosisAgreement diagnosis={diagnosis} />}
    </div>
  );
}

function Header({ reveal }: { reveal: Reveal }) {
  const traps = reveal.traps ?? [];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {reveal.key && (
        <Badge tone="success">
          Answer: <span className="ml-1 font-semibold">{reveal.key}</span>
        </Badge>
      )}
      {traps.map((trap) => (
        <Badge key={trap.slug} tone="destructive" title={trap.what}>
          {trap.name}
        </Badge>
      ))}
      {reveal.strategy?.order_badge && (
        <Badge tone="outline">{reveal.strategy.order_badge}</Badge>
      )}
      {reveal.gear && <Badge tone="outline">{reveal.gear}</Badge>}
    </div>
  );
}

/**
 * The FALSE-vs-NOT-GIVEN line, stated for this statement.
 *
 * This is the single most valuable thing the trap drill produces. Every candidate has
 * been told the general rule ("NOT GIVEN means the passage does not say"); almost none
 * can apply it under time pressure, because the general rule does not tell you what
 * *this* sentence would have had to contain.
 */
export function VerdictBoundary({
  contrast,
  chosen,
}: {
  contrast: VerdictContrast;
  chosen: string;
}) {
  return (
    <div className="rounded-lg border border-warning/50 bg-warning/5 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-warning">
        {contrast.key} — not {contrast.boundary.rival}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed">{contrast.boundary.line}</p>
      {contrast.boundary.authored && (
        <p className="mt-1 text-[12px] text-muted-foreground">{contrast.boundary.authored}</p>
      )}

      {contrast.complete && (
        <ul className="mt-2.5 space-y-1.5">
          {contrast.verdicts.map((row) => (
            <li key={row.verdict} className="flex gap-2.5 text-[12px] leading-relaxed">
              <Badge tone={verdictTone(row, chosen)} className="mt-px shrink-0">
                {row.verdict}
              </Badge>
              <span className="min-w-0 text-muted-foreground">
                {row.role === "key"
                  ? (contrast.decision_rule ?? "The reading the text forces.")
                  : (row.why_wrong ?? "—")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TwoStageVerdict({ result }: { result: TwoStageResult }) {
  const verdict = TWO_STAGE_VERDICT[result.diagnosis!];
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={verdict.tone}>{verdict.title}</Badge>
        {result.stage_one && (
          <span className="text-[11px] text-muted-foreground tabular">
            Stage 1: you said {result.stage_one.given ?? "nothing"} · the answer was{" "}
            {result.stage_one.key}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{verdict.note}</p>
    </div>
  );
}

function DiagnosisAgreement({ diagnosis }: { diagnosis: SelfDiagnosis }) {
  return (
    <p className="text-[12px] text-muted-foreground">
      {diagnosis.agreed ? (
        <>
          You named it: <strong className="text-foreground">{diagnosis.picked_label}</strong>. Being
          able to name your own error is what makes the next one avoidable.
        </>
      ) : (
        <>
          You said <strong className="text-foreground">{diagnosis.picked_label}</strong>; this one
          was built as{" "}
          <strong className="text-foreground">{diagnosis.authored_labels.join(", ")}</strong>. Worth
          a second look at the reveal — the two feel similar and are fixed differently.
        </>
      )}
    </p>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </p>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "text" }) {
  return (
    <span
      className={cn(
        "rounded-md px-2 py-1 text-[12px] leading-snug",
        tone === "text" ? "bg-success/12 text-success" : "bg-muted text-foreground",
      )}
    >
      {children}
    </span>
  );
}
