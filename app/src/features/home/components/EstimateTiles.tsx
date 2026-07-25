import { AlertTriangle, HelpCircle } from "lucide-react";
import { Badge, BandScore, Card, CardContent, CardHeader, CardTitle, Tooltip } from "@/components/ui";
import { formatBand } from "@/lib/format";
import { cn } from "@/lib/cn";
import { SKILL_KEYS, SKILL_LABELS, type ProgressSummary, type SkillEstimate } from "../types";

const CONFIDENCE_COPY: Record<string, string> = {
  insufficient: "Not enough scored practice yet",
  low: "Low confidence — one or two attempts",
  medium: "Medium confidence",
  high: "High confidence",
};

function rangeText(estimate: SkillEstimate | undefined): string {
  if (!estimate || estimate.band === null) return "No estimate yet";
  return `likely ${formatBand(estimate.range_low)}–${formatBand(estimate.range_high)}`;
}

function SkillTile({
  label,
  estimate,
  stale,
}: {
  label: string;
  estimate: SkillEstimate | undefined;
  stale: boolean;
}) {
  const band = estimate?.band ?? null;
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border border-border bg-background/40 px-3 py-2.5",
        stale && "border-warning/50",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        {band === null ? (
          <span className="text-sm font-semibold tabular text-muted-foreground">—</span>
        ) : (
          <BandScore band={band} size="sm" />
        )}
      </div>
      <span className="text-[11px] tabular text-muted-foreground">{rangeText(estimate)}</span>
      <span className="text-[11px] text-muted-foreground">
        {estimate?.method === "self_assessed"
          ? "Self-rated starting point"
          : CONFIDENCE_COPY[estimate?.confidence ?? "insufficient"]}
      </span>
      {stale && (
        <span className="flex items-center gap-1 text-[11px] text-warning">
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
          Getting stale — practise {label.toLowerCase()} to refresh it
        </span>
      )}
    </div>
  );
}

/**
 * Per-skill band tiles (10 §6.4). Every band ships with its range and the
 * "estimated band — not a guarantee" framing; a skill with insufficient
 * evidence shows "—" rather than a made-up number.
 */
export function EstimateTiles({ summary }: { summary: ProgressSummary }) {
  const overall = summary.estimates.overall;
  const stale = new Set(summary.stale_skills);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Band estimates</CardTitle>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            {summary.disclaimer || "Estimated band — not a guarantee"}
            <Tooltip content={summary.tooltip} side="bottom">
              <HelpCircle
                className="h-3.5 w-3.5 text-muted-foreground"
                tabIndex={0}
                role="img"
                aria-label={summary.tooltip}
              />
            </Tooltip>
          </p>
        </div>
        <Badge tone="outline" className="shrink-0">
          Target {formatBand(summary.profile.target_band)}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
          {overall?.band === null || overall === undefined ? (
            <>
              <span className="flex h-12 min-w-[3rem] items-center justify-center rounded-xl bg-muted px-3 text-[24px] font-semibold leading-none tabular text-muted-foreground">
                —
              </span>
              <p className="text-[13px] text-muted-foreground">
                An overall estimate needs a band in all four skills. Take the placement test
                or finish one scored attempt per skill.
              </p>
            </>
          ) : (
            <>
              <BandScore band={overall.band} size="md" label="Overall" />
              <div className="min-w-0">
                <p className="text-sm font-medium tabular text-foreground">{overall.display}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {overall.attempts_used === 0
                    ? `${CONFIDENCE_COPY[overall.confidence]} · starting point, no scored attempts yet`
                    : `${CONFIDENCE_COPY[overall.confidence]} · from ${overall.attempts_used} scored ${
                        overall.attempts_used === 1 ? "attempt" : "attempts"
                      }`}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {SKILL_KEYS.map((skill) => (
            <SkillTile
              key={skill}
              label={SKILL_LABELS[skill]}
              estimate={summary.estimates[skill]}
              stale={stale.has(skill)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
