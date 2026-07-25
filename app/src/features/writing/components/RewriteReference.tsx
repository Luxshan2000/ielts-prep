/**
 * Read-only view of the attempt being rewritten (05 §8.2). Opened from a drawer in
 * practice mode; exam mode never offers it.
 */

import { BandScore } from "@/components/ui";
import { CRITERION_ORDER, criterionLabel, type ParentAttempt } from "../store";
import { AnnotatedEssay } from "./AnnotatedEssay";

export function RewriteReference({ parent }: { parent: ParentAttempt }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-muted/30 p-3">
        {parent.overall_band !== null && <BandScore band={parent.overall_band} size="md" label="Overall" />}
        {parent.bands &&
          CRITERION_ORDER.map((key) => (
            <BandScore key={key} band={parent.bands![key]} size="sm" label={criterionLabel(key)} />
          ))}
        <span className="text-[12px] text-muted-foreground tabular">{parent.word_count} words</span>
      </div>

      <AnnotatedEssay
        text={parent.essay_text ?? ""}
        annotations={parent.annotations ?? []}
        unanchored={[]}
      />
    </div>
  );
}
