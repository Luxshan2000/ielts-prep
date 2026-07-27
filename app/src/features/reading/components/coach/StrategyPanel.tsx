/**
 * "Strategy" tab — how to attack each question group on this passage.
 *
 * Two layers, deliberately kept apart. The **authored** layer is the pack's plan for
 * this type on *these* paragraphs, and it is the part that is worth reading twice.
 * The **static** layer is the generic per-type page — what the type tests, the gear
 * it wants, whether its answers run in passage order — which is the same on every
 * passage and is app copy rather than content.
 *
 * The order badge is the loudest thing on the card, because whether a group runs in
 * passage order is the highest-value strategic fact per type and most candidates do
 * not have it.
 */

import { Clock, ListOrdered, Target } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { groupRangeLabel } from "../../model";
import { qtypeLabel } from "../../qtypes";
import { ANSWER_ORDER, GEARS, typePage } from "./labels";
import { Callout, Disclosure, SectionHead } from "./primitives";
import type { CoachGroup, CoachPassage, PassageTeaching } from "./types";

export interface StrategyPanelProps {
  passage: CoachPassage;
  teaching: PassageTeaching | null;
}

function OrderBadge({ order }: { order: string }) {
  const info = ANSWER_ORDER[order];
  if (!info) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-semibold",
        order === "sequential"
          ? "border-success/50 bg-success/10 text-foreground"
          : order === "scattered"
            ? "border-warning/50 bg-warning/10 text-foreground"
            : "border-primary/50 bg-primary/10 text-foreground",
      )}
    >
      <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
      {info.badge}
    </span>
  );
}

function GroupCard({ group }: { group: CoachGroup }) {
  const teaching = group.teaching ?? null;
  const page = typePage(group.type);
  const order = String(teaching?.answer_order ?? page?.order ?? "");
  const orderInfo = ANSWER_ORDER[order];
  const count = group.questions?.length ?? 0;
  const budget = Number(teaching?.time_budget_s ?? 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="mr-1">{qtypeLabel(group.type)}</CardTitle>
          <Badge tone="outline">{groupRangeLabel(group)}</Badge>
          <OrderBadge order={order} />
          {budget > 0 && (
            <span className="inline-flex items-center gap-1 text-[12px] tabular text-muted-foreground">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {formatDuration(budget)} for the group
              {count > 0 ? ` · about ${Math.round(budget / count)}s each` : ""}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {orderInfo && (
          <p className="text-[13px] leading-6 text-muted-foreground">{orderInfo.what}</p>
        )}

        {teaching?.strategy ? (
          <div className="rounded-xl border border-primary/40 bg-primary/8 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              On this passage
            </p>
            <p className="mt-1 text-[13px] leading-6 text-foreground">{teaching.strategy}</p>
            {teaching.order_note && (
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                {teaching.order_note}
              </p>
            )}
          </div>
        ) : (
          <p className="text-[13px] leading-6 text-muted-foreground">
            This group has no authored plan in the installed pack — the generic page below still
            applies.
          </p>
        )}

        {teaching?.section_scope && teaching.section_scope.length > 0 && (
          <p className="text-[13px] leading-6 text-foreground">
            Everything for this group is in{" "}
            <span className="font-semibold">
              paragraph{teaching.section_scope.length > 1 ? "s" : ""}{" "}
              {teaching.section_scope.join("–")}
            </span>
            . Find that stretch once, then work inside it.
          </p>
        )}

        {teaching?.watch_out && (
          <Callout tone="warn" title="What this group is built to catch">
            {teaching.watch_out}
          </Callout>
        )}

        {(teaching?.bank_analysis?.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            <SectionHead
              title="The bank words that fit nothing"
              hint="Each unused option was written to attract one specific gap."
            />
            <ul className="space-y-1.5">
              {(teaching?.bank_analysis ?? []).map((entry, index) => (
                <li
                  key={`${entry.key}-${index}`}
                  className="rounded-lg border border-border bg-muted/40 p-2.5 text-[13px] leading-6"
                >
                  <span className="mr-1.5 font-semibold text-foreground">{entry.key}</span>
                  <span className="text-muted-foreground">
                    {entry.designed_to_tempt ? `written for Q${entry.designed_to_tempt} — ` : ""}
                    {entry.why_wrong}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {page && (
          <Disclosure
            title={`${qtypeLabel(group.type)} — the type itself`}
            subtitle="The same on every passage. Read it once, then never again."
            meta={<Badge tone="default">{GEARS[page.gear]?.name ?? page.gear}</Badge>}
          >
            <div className="space-y-3">
              <p className="text-[13px] leading-6 text-foreground">{page.tests}</p>
              <p className="text-[13px] leading-6 text-muted-foreground">
                <span className="font-medium text-foreground">
                  {GEARS[page.gear]?.name ?? page.gear}:
                </span>{" "}
                {GEARS[page.gear]?.what}
              </p>
              <ol className="space-y-2">
                {page.moves.map((move, index) => (
                  <li key={move} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[12px] font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span className="text-[13px] leading-6 text-foreground">{move}</span>
                  </li>
                ))}
              </ol>
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Where the marks go
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-[13px] leading-6 text-muted-foreground">
                  {page.losses.map((loss) => (
                    <li key={loss}>{loss}</li>
                  ))}
                </ul>
              </div>
              <p className="text-[12px] tabular text-muted-foreground">
                Budget: about {page.seconds} seconds a question.
              </p>
            </div>
          </Disclosure>
        )}
      </CardContent>
    </Card>
  );
}

export function StrategyPanel({ passage, teaching }: StrategyPanelProps) {
  const groups = passage.question_groups ?? [];
  const total = groups.reduce((sum, group) => sum + (group.questions?.length ?? 0), 0);

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="This passage has no question groups"
        description="The installed content pack stores this passage without a question set, so there is no strategy to give."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pt-5">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-6 text-foreground">
              {total} question{total === 1 ? "" : "s"} in {groups.length} group
              {groups.length === 1 ? "" : "s"}
              {teaching?.time_budget_min
                ? `, and ${teaching.time_budget_min} minutes to answer them in a full paper.`
                : "."}{" "}
              No single question is worth more than two minutes: enter your best guess, flag it and
              move. A flagged guess is a mark you might get; a blank after four minutes is a mark
              you certainly did not get, plus three lost minutes.
            </p>
          </div>
        </CardContent>
      </Card>

      {groups.map((group) => (
        <GroupCard key={group.id} group={group} />
      ))}
    </div>
  );
}
