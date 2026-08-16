/**
 * The submitted answer with inline error highlights (05 §7).
 *
 * Offsets are computed server-side and shipped as character ranges, so this never
 * re-tokenises the essay — it hands them straight to the shared `AnnotatedText`
 * primitive. Hovering (or focusing, or pressing `n`/`p`) a span reveals the error
 * type, the fix and the explanation; the same list is rendered below the text so
 * the feedback is readable without pointing at anything.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, MessageSquareWarning } from "lucide-react";
import { AnnotatedText, Badge, type Annotation, type AnnotationSeverity } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { AnnotationType, EssayAnnotation, UnanchoredAnnotation } from "../store";

export const ANNOTATION_LABEL: Record<AnnotationType, string> = {
  grammar: "Grammar",
  vocabulary: "Word choice",
  spelling: "Spelling",
  punctuation: "Punctuation",
  cohesion: "Cohesion",
  register: "Register",
  task: "Task",
};

/**
 * `AnnotatedText` offers three severities; the seven feedback types map onto them
 * by whether the item is an outright error or a lift-your-band suggestion. The
 * type name is always printed next to the item, so the collapse loses nothing.
 */
const SEVERITY: Record<AnnotationType, AnnotationSeverity> = {
  grammar: "error",
  spelling: "error",
  punctuation: "error",
  vocabulary: "improve",
  cohesion: "improve",
  register: "improve",
  task: "improve",
};

const TONE: Record<AnnotationSeverity, "destructive" | "warning" | "success"> = {
  error: "destructive",
  improve: "warning",
  good: "success",
};

export interface AnnotatedEssayProps {
  text: string;
  annotations: EssayAnnotation[];
  unanchored: UnanchoredAnnotation[];
  className?: string;
}

function FixLine({ quote, fix }: { quote: string; fix: string }) {
  if (!fix) return null;
  return (
    <p className="text-[13px] leading-6">
      <span className="text-muted-foreground line-through decoration-destructive/60">{quote}</span>
      <span className="mx-1.5 text-muted-foreground" aria-hidden="true">
        →
      </span>
      <span className="font-medium text-foreground">{fix}</span>
    </p>
  );
}

export function AnnotatedEssay({ text, annotations, unanchored, className }: AnnotatedEssayProps) {
  const [active, setActive] = useState<number | null>(null);

  const mapped = useMemo<Annotation[]>(
    () =>
      annotations.map((annotation) => ({
        start: annotation.start,
        end: annotation.end,
        severity: SEVERITY[annotation.type] ?? "improve",
        note: `${ANNOTATION_LABEL[annotation.type] ?? annotation.type}: ${annotation.explanation}`,
        suggestion: annotation.fix || undefined,
      })),
    [annotations],
  );

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-xl border border-border bg-card p-5">
        {text.trim() ? (
          <AnnotatedText
            text={text}
            annotations={mapped}
            onSelect={(index) => setActive(index >= 0 ? index : null)}
          />
        ) : (
          <p className="text-[13px] text-muted-foreground">This attempt has no submitted text.</p>
        )}
      </div>

      {annotations.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {annotations.length} highlighted {annotations.length === 1 ? "item" : "items"}. Click one, or
          press <kbd className="rounded border border-border px-1">n</kbd> /{" "}
          <kbd className="rounded border border-border px-1">p</kbd> to step through them.
        </p>
      )}

      {annotations.length === 0 && unanchored.length === 0 && (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
          The examiner model flagged no specific errors in this answer.
        </p>
      )}

      {annotations.length > 0 && (
        <ol className="space-y-2">
          {annotations.map((annotation, index) => {
            const severity = SEVERITY[annotation.type] ?? "improve";
            return (
              <li
                key={`${annotation.start}-${index}`}
                className={cn(
                  "rounded-xl border p-3 transition-colors",
                  active === index ? "border-primary bg-primary/5" : "border-border bg-card",
                )}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <Badge tone={TONE[severity]}>
                    {ANNOTATION_LABEL[annotation.type] ?? annotation.type}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground tabular">
                    characters {annotation.start} to {annotation.end}
                  </span>
                </div>
                <FixLine quote={annotation.quote} fix={annotation.fix} />
                <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
                  {annotation.explanation}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      {unanchored.length > 0 && (
        <section className="rounded-xl border border-border bg-muted/30 p-4">
          <h4 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <MessageSquareWarning className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Notes that couldn't be pinned to your text
          </h4>
          <p className="mt-1 text-[12px] text-muted-foreground">
            The model quoted these but not word-for-word, so they are listed rather than guessed at a
            position.
          </p>
          <ul className="mt-3 space-y-2.5">
            {unanchored.map((annotation, index) => (
              <li key={index}>
                <div className="mb-1 flex items-center gap-2">
                  <Badge tone={TONE[SEVERITY[annotation.type] ?? "improve"]}>
                    {ANNOTATION_LABEL[annotation.type] ?? annotation.type}
                  </Badge>
                </div>
                <FixLine quote={annotation.quote} fix={annotation.fix} />
                <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">
                  {annotation.explanation}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
