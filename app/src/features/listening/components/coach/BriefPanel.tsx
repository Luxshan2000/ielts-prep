/**
 * "The brief" — what this part is, what it punishes, and how this particular recording
 * is built.
 *
 * Everything on this tab is ungated, and that is a design decision rather than an
 * oversight: it is the half of the coach worth most *before* the audio plays. The
 * transcript is the answer key and waits for an attempt; the attack plan for a map task
 * is not, and withholding it would only mean the learner sat the part badly and then read
 * how to sit it.
 *
 * The group strategy cards sit here rather than beside the questions for the same reason.
 * A strategy read while the audio is running is a distraction; read in the thirty seconds
 * before it, it is the difference between ten questions and six.
 */

import type { ReactNode } from "react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import {
  ArrowDownWideNarrow,
  CheckSquare,
  Clock3,
  Compass,
  Gauge,
  Layers,
  ShieldAlert,
} from "lucide-react";
import { typeLabel } from "../../qtypes";
import { ACCENT_DISCLOSURE, BRIEFING_CARDS, PART_BRIEFS, PREVIEW_PROTOCOL } from "./labels";
import { Callout, Chip, Disclosure, SectionHead } from "./primitives";
import { blockLabel, type PreviewStep, type TeachingPayload } from "./types";

function seconds(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "";
  return `${Math.round(ms / 1000)} seconds`;
}

/** The server's protocol when it sent one, otherwise the static copy. */
function protocolRows(steps: PreviewStep[] | undefined): { window: string; step: string }[] {
  if (steps && steps.length > 0) {
    return steps.map((row) => ({ window: `${row.from_s}–${row.to_s}s`, step: row.step }));
  }
  return PREVIEW_PROTOCOL;
}

export function BriefPanel({ doc }: { doc: TeachingPayload }) {
  const brief = PART_BRIEFS[doc.part] ?? null;
  const hard = doc.what_makes_this_hard;
  const plan = doc.pause_plan;
  const groups = doc.groups ?? [];
  const metrics = doc.metrics;
  const taught = groups.filter((group) => group.teaching_available || group.type_page);

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------ what this part is --- */}
      {brief && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-primary" aria-hidden="true" />
              {brief.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-[13px] leading-6 text-muted-foreground">
            <p>{brief.what}</p>
            <p>
              <span className="font-semibold text-foreground">What it punishes: </span>
              {brief.punishes}
            </p>
            <p className="rounded-xl border border-primary/40 bg-primary/8 p-3 text-foreground">
              <span className="font-semibold">If you lose one here, re-anchor on </span>
              {brief.reanchor}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------- the one rule that beats the rest --- */}
      {doc.last_value_rule && (
        <Callout tone="teach" title="The rule that decides more marks than any other">
          {doc.last_value_rule}
        </Callout>
      )}

      {/* --------------------------------------- what makes this one hard ----- */}
      {hard && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-warning" aria-hidden="true" />
              What makes this recording hard
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {hard.levers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {hard.levers.map((lever) => (
                  <Chip key={lever.slug} tone="printed" title={lever.note}>
                    {lever.note}
                  </Chip>
                ))}
              </div>
            )}
            {hard.note && (
              <p className="text-[13px] leading-6 text-muted-foreground">{hard.note}</p>
            )}
            {hard.hardest_question !== null && (
              <Callout tone="warn" title={`Question ${hard.hardest_question} is the hardest here`}>
                {hard.why_hardest ?? "It carries the densest distraction in the part."}
              </Callout>
            )}
            <p className="text-[12px] leading-5 text-muted-foreground">
              Difficulty in this paper is vocabulary, sentence length and the number of decoys — not
              speed and not audio quality, both of which stay flat from Part 1 to Part 4.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------- the shape of the audio --- */}
      {plan && plan.blocks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-primary" aria-hidden="true" />
              How this recording is laid out
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ol className="space-y-2">
              {plan.blocks.map((block, index) => (
                <li
                  key={index}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-border bg-muted/40 p-3 text-[13px]"
                >
                  <span className="font-semibold text-foreground">
                    Questions {blockLabel(block.questions)}
                  </span>
                  <span className="text-muted-foreground">
                    {seconds(block.preview_ms) || "30 seconds"} to read them, then the recording
                    runs.
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-[13px] leading-6 text-muted-foreground">{plan.note}</p>
          </CardContent>
        </Card>
      )}

      {/* -------------------------------------------- the strategy per group --- */}
      {taught.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title="How to attack each set"
            hint="Written for this script, not for the type in general."
          />
          {taught.map((group, index) => (
            <Disclosure
              key={group.group_id ?? `${group.qtype}-${index}`}
              defaultOpen={taught.length <= 2}
              title={`Questions ${blockLabel(group.question_numbers)} — ${
                group.type_page?.label ?? typeLabel(group.qtype)
              }`}
              subtitle={group.instruction ?? undefined}
              meta={
                <Badge tone="primary" className="gap-1">
                  <ArrowDownWideNarrow className="h-3 w-3" aria-hidden="true" />
                  {group.order_badge || "In recording order"}
                </Badge>
              }
            >
              <div className="space-y-3 text-[13px] leading-6">
                {group.strategy && <p className="text-foreground">{group.strategy}</p>}
                {group.preview_focus && (
                  <Callout tone="teach" title="In the pause before this set">
                    {group.preview_focus}
                  </Callout>
                )}
                {group.watch_out && (
                  <Callout tone="warn" title="What this set is built to cost you">
                    {group.watch_out}
                  </Callout>
                )}
                {group.order_note && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Order: </span>
                    {group.order_note}
                  </p>
                )}
                {group.bank_note && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">The letter bank: </span>
                    {group.bank_note}
                  </p>
                )}
                {group.spatial_cues.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[12px] font-medium text-foreground">
                      The direction words this set turns on
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.spatial_cues.map((cue) => (
                        <Chip key={cue} tone="audio">
                          {cue}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}

                {/* The static per-type page, kept visibly separate from the authored
                    plan above: one is how the type works, the other is how THIS script
                    uses it, and conflating them is how strategy cards become wallpaper. */}
                {group.type_page && (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.type_page.label} in general
                    </p>
                    <p className="text-muted-foreground">{group.type_page.tests}</p>
                    <p className="text-foreground">
                      <span className="font-medium">In the preview: </span>
                      {group.type_page.preview_move}
                    </p>
                    <p className="text-foreground">
                      <span className="font-medium">While it runs: </span>
                      {group.type_page.during_move}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">The rule: </span>
                      {group.type_page.rule}
                    </p>
                    {group.type_page.characteristic_losses.length > 0 && (
                      <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                        {group.type_page.characteristic_losses.map((loss) => (
                          <li key={loss}>{loss}</li>
                        ))}
                      </ul>
                    )}
                    {group.type_page.order_contrast && (
                      <p className="text-[12px] leading-5 text-muted-foreground">
                        {group.type_page.order_contrast}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Disclosure>
          ))}
        </section>
      )}

      {/* --------------------------------------------- the preview protocol --- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
            The thirty seconds before the audio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-1.5">
            {protocolRows(plan?.preview_protocol).map((row) => (
              <li key={row.window} className="flex gap-3 text-[13px] leading-6">
                <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                  {row.window}
                </span>
                <span className="min-w-0 flex-1 text-foreground">{row.step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
            The second row is the one people skip and the one that carries the marks. The Prediction
            tab on this screen is that step, run without any audio at all.
          </p>
        </CardContent>
      </Card>

      {/* ------------------------------------------------ the check protocol --- */}
      {doc.check_protocol.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-primary" aria-hidden="true" />
              The check window, as an executable list
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ol className="space-y-1.5">
              {doc.check_protocol.map((step, index) => (
                <li key={index} className="flex gap-3 text-[13px] leading-6">
                  <span className="w-5 shrink-0 tabular-nums font-semibold text-muted-foreground">
                    {index + 1}.
                  </span>
                  <span className="min-w-0 flex-1 text-foreground">{step}</span>
                </li>
              ))}
            </ol>
            {doc.check_note && (
              <p className="text-[12px] leading-5 text-muted-foreground">{doc.check_note}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---------------------------------------------------- the paper facts --- */}
      <section className="space-y-2">
        <SectionHead
          title="Facts about this paper worth more than any single answer"
          hint="True of every script, so they are only written once."
        />
        {BRIEFING_CARDS.map((card) => (
          <Disclosure key={card.id} title={card.title}>
            <p className="text-[13px] leading-6 text-muted-foreground">{card.body}</p>
          </Disclosure>
        ))}
      </section>

      {/* -------------------------------------------------------- the accents --- */}
      <Callout tone="info" title="About the voices you are about to hear">
        {doc.accent_note ? `${doc.accent_note} ` : ""}
        {ACCENT_DISCLOSURE}
      </Callout>

      {/* --------------------------------------------------------- the numbers --- */}
      {metrics && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              This script by the numbers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-4">
              {typeof metrics.spoken_words === "number" && (
                <Metric label="Words spoken">{metrics.spoken_words}</Metric>
              )}
              {typeof metrics.words_per_answer === "number" && (
                <Metric label="Words per mark">{metrics.words_per_answer}</Metric>
              )}
              {typeof metrics.trapped_items === "number" && (
                <Metric label="Questions with a decoy">
                  {metrics.trapped_items} of{" "}
                  {(metrics.trapped_items ?? 0) + (metrics.clean_items ?? 0)}
                </Metric>
              )}
              {typeof metrics.speakers === "number" && (
                <Metric label="Speakers">{metrics.speakers}</Metric>
              )}
            </dl>
            <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
              About half the questions in a well-built part are clean. If every item were a trap you
              would learn to distrust answers you had heard correctly, which costs more than it
              saves.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums text-foreground">{children}</dd>
    </div>
  );
}
