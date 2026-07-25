/**
 * The four equally-weighted criteria (05 §6.1) with the exact quotes the examiner
 * model based each judgement on. Bands are recomputed server-side from the four
 * criteria (R2-4) — nothing here does band arithmetic.
 */

import { Badge, BandScore, Card, CardContent } from "@/components/ui";
import {
  CRITERION_ORDER,
  criterionLabel,
  type CriterionKey,
  type CriterionReport,
  type TaskType,
} from "../store";

export interface CriterionCardsProps {
  criteria: Partial<Record<CriterionKey, CriterionReport>>;
  bands: Record<CriterionKey, number>;
  taskType: TaskType | null;
}

export function CriterionCards({ criteria, bands, taskType }: CriterionCardsProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {CRITERION_ORDER.map((key) => {
        const report = criteria[key];
        const band = report?.band ?? bands[key];
        return (
          <Card key={key}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <BandScore band={band} size="md" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-[13px] font-semibold leading-snug text-foreground">
                    {criterionLabel(key, taskType)}
                  </h3>
                  <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
                    {report?.comment || "The examiner model returned no comment for this criterion."}
                  </p>
                </div>
              </div>

              {report && report.evidence_quotes.length > 0 && (
                <div className="space-y-1.5 border-t border-border pt-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Evidence from your answer
                  </p>
                  <ul className="space-y-1.5">
                    {report.evidence_quotes.map((quote, index) => {
                      const anchored = report.evidence_ranges.find((range) => range.quote === quote);
                      return (
                        <li
                          key={index}
                          className="border-l-2 border-primary/50 pl-2.5 text-[13px] leading-6 text-foreground"
                        >
                          <span className="italic">“{quote}”</span>
                          {anchored && (
                            <span className="ml-1.5 text-[11px] not-italic text-muted-foreground tabular">
                              at {anchored.start}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {report.unanchored_quotes.length > 0 && (
                    <p className="pt-1 text-[11px] text-muted-foreground">
                      <Badge tone="outline">
                        {report.unanchored_quotes.length} quote
                        {report.unanchored_quotes.length === 1 ? "" : "s"} paraphrased
                      </Badge>{" "}
                      — not found word-for-word in your text, so not linked to a position.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
