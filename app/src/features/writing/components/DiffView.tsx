/**
 * The improvement loop's evidence (05 §8.4): what changed against the parent
 * attempt, what the bands did, and which flagged errors actually got fixed.
 */

import { useMemo, useState } from "react";
import { ArrowRight, Columns2, Minus, Rows3, TrendingDown, TrendingUp } from "lucide-react";
import { BandScore, Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatBand } from "@/lib/format";
import {
  CRITERION_ORDER,
  criterionLabel,
  type CriterionKey,
  type EssayAnnotation,
  type ParentAttempt,
  type TaskType,
} from "../store";
import { diffStats, diffWords, type DiffChunk } from "./diff";
import { ANNOTATION_LABEL } from "./AnnotatedEssay";

// ------------------------------------------------------------- band deltas ---

export interface BandDeltaStripProps {
  before: Record<CriterionKey, number> | null;
  after: Record<CriterionKey, number>;
  overallBefore: number | null;
  overallAfter: number;
  taskType: TaskType | null;
}

function Delta({ value }: { value: number }) {
  if (Math.abs(value) < 0.01) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
        <Minus className="h-3 w-3" aria-hidden="true" />
        no change
      </span>
    );
  }
  const up = value > 0;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[12px]", up ? "text-success" : "text-destructive")}>
      {up ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
      {up ? "+" : ""}
      {value.toFixed(1)}
    </span>
  );
}

export function BandDeltaStrip({
  before,
  after,
  overallBefore,
  overallAfter,
  taskType,
}: BandDeltaStripProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Against your previous attempt</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-4 rounded-xl bg-muted/40 p-3">
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Before</p>
              {overallBefore !== null ? (
                <BandScore band={overallBefore} size="md" />
              ) : (
                <span className="text-[13px] text-muted-foreground">not marked</span>
              )}
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <div className="text-center">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Now</p>
              <BandScore band={overallAfter} size="md" reveal />
            </div>
          </div>
          {overallBefore !== null && (
            <div className="text-[13px] text-foreground">
              Overall <Delta value={overallAfter - overallBefore} />
            </div>
          )}
        </div>

        <ul className="grid gap-2 sm:grid-cols-2">
          {CRITERION_ORDER.map((key) => {
            const from = before?.[key] ?? null;
            const to = after[key];
            return (
              <li
                key={key}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span className="min-w-0 truncate text-[13px] text-foreground">
                  {criterionLabel(key, taskType)}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-[13px] tabular">
                  <span className="text-muted-foreground">{from === null ? "—" : formatBand(from)}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  <span className="font-semibold text-foreground">{formatBand(to)}</span>
                  {from !== null && <Delta value={to - from} />}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------------- text diff ----

const CHUNK_CLASS: Record<DiffChunk["op"], string> = {
  equal: "text-foreground",
  insert: "rounded-sm bg-success/15 text-foreground underline decoration-success/60 decoration-2",
  delete: "rounded-sm bg-destructive/15 text-muted-foreground line-through decoration-destructive/60",
};

function Inline({ chunks }: { chunks: DiffChunk[] }) {
  return (
    <p className="whitespace-pre-wrap text-[14px] leading-7">
      {chunks.map((chunk, index) => (
        <span key={index} className={CHUNK_CLASS[chunk.op]}>
          {chunk.text}
        </span>
      ))}
    </p>
  );
}

function SideBySide({ chunks }: { chunks: DiffChunk[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Previous attempt
        </p>
        <p className="whitespace-pre-wrap text-[14px] leading-7">
          {chunks
            .filter((chunk) => chunk.op !== "insert")
            .map((chunk, index) => (
              <span key={index} className={CHUNK_CLASS[chunk.op]}>
                {chunk.text}
              </span>
            ))}
        </p>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          This attempt
        </p>
        <p className="whitespace-pre-wrap text-[14px] leading-7">
          {chunks
            .filter((chunk) => chunk.op !== "delete")
            .map((chunk, index) => (
              <span key={index} className={CHUNK_CLASS[chunk.op]}>
                {chunk.text}
              </span>
            ))}
        </p>
      </div>
    </div>
  );
}

export interface DiffViewProps {
  parent: ParentAttempt;
  text: string;
}

export function DiffView({ parent, text }: DiffViewProps) {
  const [layout, setLayout] = useState<"inline" | "side">("inline");
  const chunks = useMemo(() => diffWords(parent.essay_text ?? "", text ?? ""), [parent.essay_text, text]);
  const stats = useMemo(() => diffStats(chunks), [chunks]);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle>What you changed</CardTitle>
          <p className="mt-1 text-[12px] text-muted-foreground tabular">
            <span className="text-success">+{stats.added} added</span> ·{" "}
            <span className="text-destructive">−{stats.removed} removed</span> · {stats.kept} kept
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLayout((v) => (v === "inline" ? "side" : "inline"))}
          aria-pressed={layout === "side"}
        >
          {layout === "inline" ? <Columns2 className="h-3.5 w-3.5" /> : <Rows3 className="h-3.5 w-3.5" />}
          {layout === "inline" ? "Side by side" : "Inline"}
        </Button>
      </CardHeader>
      <CardContent>
        {layout === "inline" ? <Inline chunks={chunks} /> : <SideBySide chunks={chunks} />}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------- resolved errors -----

export function ResolvedErrors({
  parentAnnotations,
  text,
}: {
  parentAnnotations: EssayAnnotation[];
  text: string;
}) {
  const { fixed, remaining } = useMemo(() => {
    const haystack = (text ?? "").toLowerCase();
    const fixedItems: EssayAnnotation[] = [];
    const remainingItems: EssayAnnotation[] = [];
    for (const annotation of parentAnnotations) {
      const needle = (annotation.quote ?? "").trim().toLowerCase();
      if (needle && haystack.includes(needle)) remainingItems.push(annotation);
      else fixedItems.push(annotation);
    }
    return { fixed: fixedItems, remaining: remainingItems };
  }, [parentAnnotations, text]);

  if (parentAnnotations.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Errors from last time</CardTitle>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Matched literally against your new text — a rephrased sentence counts as fixed.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="flex flex-wrap items-center gap-2 text-[12px]">
          <Badge tone="success">{fixed.length} fixed</Badge>
          <Badge tone="warning">{remaining.length} still present</Badge>
        </p>
        <ul className="space-y-2">
          {[...fixed, ...remaining].map((annotation, index) => {
            const isFixed = index < fixed.length;
            return (
              <li
                key={`${annotation.quote}-${index}`}
                className="flex items-start gap-2.5 rounded-lg border border-border p-2.5"
              >
                <Badge tone={isFixed ? "success" : "warning"}>{isFixed ? "Fixed" : "Still present"}</Badge>
                <span className="min-w-0">
                  <span className="block text-[13px] leading-6 text-foreground">
                    “{annotation.quote}”
                  </span>
                  <span className="block text-[12px] text-muted-foreground">
                    {ANNOTATION_LABEL[annotation.type] ?? annotation.type} — {annotation.explanation}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
