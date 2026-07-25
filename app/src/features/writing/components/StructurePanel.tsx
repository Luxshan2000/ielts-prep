/**
 * Structure analysis (05 §6.2 `structure_analysis`): what each paragraph did, and
 * what an examiner would look for and not find.
 */

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import type { StructureAnalysisDoc } from "../store";

export function StructurePanel({ analysis }: { analysis: StructureAnalysisDoc }) {
  const paragraphs = analysis?.paragraphs ?? [];
  const missing = analysis?.missing_elements ?? [];
  const summary = analysis?.summary ?? "";

  if (paragraphs.length === 0 && missing.length === 0 && !summary) {
    return (
      <Card>
        <CardContent className="p-5 text-[13px] text-muted-foreground">
          The examiner model returned no structure analysis for this answer.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Structure</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary && <p className="text-[13px] leading-6 text-foreground">{summary}</p>}

        {paragraphs.length > 0 && (
          <ol className="space-y-2">
            {paragraphs.map((paragraph, index) => (
              <li
                key={`${paragraph.index}-${index}`}
                className="flex gap-3 rounded-lg bg-muted/40 p-3"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-card text-[12px] font-semibold text-foreground tabular">
                  {paragraph.index}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                    {paragraph.role || "paragraph"}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-6 text-foreground">
                    {paragraph.verdict}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}

        {missing.length > 0 ? (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
            <p className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
              Missing for this task type
            </p>
            <ul className="space-y-1">
              {missing.map((item, index) => (
                <li key={index} className="text-[13px] leading-6 text-muted-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          paragraphs.length > 0 && (
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
              Every element this task type expects was present.
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}
