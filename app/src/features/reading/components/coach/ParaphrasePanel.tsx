/**
 * "Paraphrase" tab — the single highest-value thing there is to train in reading.
 *
 * An IELTS reading item is a rewording of a sentence in the passage. Every mark on
 * the paper is decided by whether the candidate recognises the rewording, and by
 * whether they can tell a rewording that *preserves* the meaning from one that
 * *changes* it — which is, more or less, the whole of True/False/Not Given.
 *
 * Two surfaces. The **families** are passage-level and always open: a phrase from
 * the text, and four to six ways an item writer would say it instead, none of which
 * appear in the passage. The **links** are per question and gated with the
 * solutions, because a stem phrase paired with its text phrase is a map straight to
 * the answer.
 */

import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Repeat } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui";
import { DEVICES, deviceName } from "./labels";
import { Callout, Chip, LocateButton, SectionHead } from "./primitives";
import type { ParaphraseFamily, PassageTeaching, SolutionRow } from "./types";

export interface ParaphrasePanelProps {
  teaching: PassageTeaching | null;
  rows: SolutionRow[];
  /** The per-question links ride with the worked solutions. */
  unlocked: boolean;
  onLocate: (paragraphId: string, quote?: string | null) => void;
}

function FamilyCard({
  family,
  onLocate,
}: {
  family: ParaphraseFamily;
  onLocate: (paragraphId: string, quote?: string | null) => void;
}) {
  const [shown, setShown] = useState(false);
  const rewordings = family.rewordings ?? [];

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-foreground">{family.concept}</span>
          {family.cefr && <Badge tone="outline">{family.cefr}</Badge>}
          {family.paragraph && (
            <LocateButton
              label="In paragraph"
              paragraph={family.paragraph}
              onLocate={() => onLocate(String(family.paragraph), family.passage_form)}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            The passage says
          </span>
          <Chip tone="text">{family.passage_form}</Chip>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              A question would say
            </span>
            <Button size="sm" variant="ghost" onClick={() => setShown((value) => !value)}>
              {shown ? (
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {shown ? "Hide them" : "Say yours first, then show"}
            </Button>
          </div>
          {shown ? (
            <div className="flex flex-wrap gap-1.5">
              {rewordings.map((wording) => (
                <Chip key={wording} tone="stem">
                  {wording}
                </Chip>
              ))}
            </div>
          ) : (
            <p className="text-[13px] leading-6 text-muted-foreground">
              {rewordings.length} rewordings hidden. Say the phrase another way out loud before you
              look — recognition without production is what fails under the clock.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ParaphrasePanel({ teaching, rows, unlocked, onLocate }: ParaphrasePanelProps) {
  const families = teaching?.paraphrase_families ?? [];
  const links = rows.filter((row) => row.teaching?.paraphrase_link?.text_phrase);

  if (families.length === 0 && links.length === 0) {
    return (
      <EmptyState
        icon={Repeat}
        title="No paraphrase material on this passage"
        description="Paraphrase families are authored per passage and the links are authored per question. A pack from before the teaching payload carries neither."
      />
    );
  }

  return (
    <div className="space-y-5">
      <Callout tone="teach" title="Sort every rewording into two buckets">
        Twelve of the fourteen devices an item writer uses keep the meaning: a synonym, a passive, a
        noun made from a verb. Two of them change it — a shift of scope (<em>some</em> to{" "}
        <em>most</em>) and a shift of certainty (<em>may reduce</em> to <em>reduces</em>). Preserving
        means the statement is TRUE. Changing means it is FALSE. That sorting is the skill.
      </Callout>

      {families.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title="Paraphrase families on this passage"
            hint="The words the item writer would use instead — none of them appear in the text."
          />
          <div className="grid gap-3 lg:grid-cols-2">
            {families.map((family, index) => (
              <FamilyCard key={`${family.concept}-${index}`} family={family} onLocate={onLocate} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <SectionHead
          title="Question wording, beside passage wording"
          hint="One row per question: what the item asked, and the words in the text it was built from."
        />
        {!unlocked ? (
          <Card>
            <CardContent className="flex items-start gap-3 pt-5">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-[13px] leading-6 text-muted-foreground">
                These pairs open with the worked solutions. A stem phrase set beside the text phrase
                it came from is a map to the answer, so it waits until you have answered — the
                families above train the same skill and give nothing away.
              </p>
            </CardContent>
          </Card>
        ) : links.length === 0 ? (
          <EmptyState
            title="No paraphrase links on these questions"
            description="The pack carries the key and the explanations for this passage but not the per-question link."
          />
        ) : (
          <Card>
            <CardHeader className="pb-1">
              <CardTitle>{links.length} pairs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-2">
              {links.map((row) => {
                const link = row.teaching?.paraphrase_link;
                if (!link) return null;
                return (
                  <div
                    key={row.number}
                    className="rounded-xl border border-border bg-card p-3 space-y-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-semibold tabular text-muted-foreground">
                        Q{row.number}
                      </span>
                      <Chip tone="stem">{link.stem_phrase}</Chip>
                      <ArrowRight
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Chip tone="text">{link.text_phrase}</Chip>
                      {row.anchor && (
                        <LocateButton
                          label="Show"
                          paragraph={row.anchor}
                          onLocate={() => onLocate(row.anchor ?? "", link.text_phrase)}
                        />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(link.devices ?? []).map((device) => (
                        <Chip
                          key={device}
                          tone={DEVICES[device]?.changes ? "warn" : "neutral"}
                          title={DEVICES[device]?.what}
                        >
                          {deviceName(device)}
                        </Chip>
                      ))}
                      {link.note && (
                        <span className="text-[12px] leading-5 text-muted-foreground">
                          {link.note}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
