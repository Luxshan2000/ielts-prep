/**
 * Model answers (05 §9). Two levels, both explicitly labelled AI-generated:
 *
 *   1. the paragraph-by-paragraph outline that came back with the evaluation, and
 *   2. a full exemplar at band 7 / 8 / 9, generated on demand
 *      (`GET /attempts/{id}/model-answer?band=` — 200 cache hit, else 202 + job).
 *
 * Both carry the fixed banner from the sidecar and are excluded from anything that
 * could pass for graded human work.
 */

import { useState } from "react";
import { ChevronDown, Info, ListChecks } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Select, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fetchModelAnswer, message, type ModelAnswer } from "../store";

const BAND_OPTIONS = [
  { value: "7", label: "Band 7: imitable" },
  { value: "8", label: "Band 8: aspirational" },
  { value: "9", label: "Band 9: the ceiling" },
];

function AiBanner({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-[12px] leading-5 text-muted-foreground">
      <Info className="mt-px h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
      {text}
    </p>
  );
}

export interface ModelAnswerPanelProps {
  attemptId: string;
  outline: string[];
}

export function ModelAnswerPanel({ attemptId, outline }: ModelAnswerPanelProps) {
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [band, setBand] = useState("8");
  const [answer, setAnswer] = useState<ModelAnswer | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setDetail(null);
    try {
      const result = await fetchModelAnswer(attemptId, Number(band), setDetail);
      setAnswer(result);
    } catch (err) {
      setError(message(err, "Couldn't write a model answer for this prompt."));
    } finally {
      setLoading(false);
      setDetail(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Model answer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 1 — the outline that shipped with the evaluation */}
        <div className="rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setOutlineOpen((v) => !v)}
            aria-expanded={outlineOpen}
            disabled={outline.length === 0}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-left text-[13px] font-medium text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
            )}
          >
            <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="flex-1">Show model answer outline</span>
            {outline.length === 0 ? (
              <span className="text-[11px] text-muted-foreground">not available for this attempt</span>
            ) : (
              <ChevronDown
                className={cn("h-4 w-4 text-muted-foreground transition-transform", outlineOpen && "rotate-180")}
                aria-hidden="true"
              />
            )}
          </button>
          {outlineOpen && outline.length > 0 && (
            <div className="space-y-3 px-3.5 pb-3.5">
              <AiBanner text="AI-generated plan for what a band-9 answer to this prompt would do, paragraph by paragraph. Not an official IELTS sample." />
              <ol className="space-y-2">
                {outline.map((line, index) => (
                  <li key={index} className="flex gap-2.5 text-[13px] leading-6 text-foreground">
                    <span className="shrink-0 text-muted-foreground tabular">{index + 1}.</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* 2 — a full exemplar, generated on demand */}
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Model answer band"
              value={band}
              onChange={setBand}
              options={BAND_OPTIONS}
              className="w-[14rem]"
            />
            <Button variant="outline" loading={loading} onClick={() => void generate()}>
              Write a full exemplar
            </Button>
            {loading && detail && (
              <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
                <Spinner />
                {detail}
              </span>
            )}
          </div>

          {error && (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          )}

          {answer && (
            <div className="space-y-3">
              <AiBanner text={answer.banner} />
              <p className="whitespace-pre-wrap rounded-xl border border-border bg-muted/30 p-4 text-[14px] leading-7 text-foreground">
                {answer.text}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Read it for the moves it makes (the overview, the grouping, the comparison
                language), not to memorise phrases. The examiner model penalises templated writing.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
