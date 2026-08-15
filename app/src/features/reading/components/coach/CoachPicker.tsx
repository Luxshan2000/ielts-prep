/**
 * `/reading/coach` — pick a passage to study.
 *
 * Sorted so the passages you have already sat come first: those are the ones whose
 * solutions are open, and a passage you have answered is worth four times as much
 * study as one you have not.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, GraduationCap } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Select,
  SkeletonCard,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { qtypeLabel } from "../../qtypes";
import { useReadingStore } from "../../store";
import { readLedger } from "./attempted";

const FORMAT_LABEL: Record<string, string> = {
  academic: "Academic",
  general_training: "General Training",
};

export function CoachPicker() {
  const navigate = useNavigate();
  const status = useReadingStore((s) => s.catalogStatus);
  const error = useReadingStore((s) => s.catalogError);
  const passages = useReadingStore((s) => s.passages);
  const loadCatalog = useReadingStore((s) => s.loadCatalog);
  const [format, setFormat] = useState("all");

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useSidecarRecovery(() => void loadCatalog(true));

  const ledger = useMemo(() => readLedger(), []);

  const visible = useMemo(() => {
    const rows = passages.filter((row) => format === "all" || row.format === format);
    return rows.sort((a, b) => {
      const left = ledger[a.id]?.submittedAt ?? 0;
      const right = ledger[b.id]?.submittedAt ?? 0;
      if (left !== right) return right - left;
      return a.title.localeCompare(b.title);
    });
  }, [format, ledger, passages]);

  const loading = status === "idle" || status === "loading";

  return (
    <PageShell
      title="Reading coach"
      description="One passage at a time: how to read it, how to attack its question types, and where every answer was."
      back={{ to: "/reading", label: "Reading" }}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Format"
            className="w-56"
            value={format}
            onChange={setFormat}
            options={[
              { value: "all", label: "Both formats" },
              { value: "academic", label: "Academic" },
              { value: "general_training", label: "General Training" },
            ]}
          />
          <span className="text-[11px] tabular text-muted-foreground">
            {visible.length} of {passages.length} passages
          </span>
        </div>
      }
    >
      {status === "error" ? (
        <ErrorState
          error={error}
          title="The reading library could not be loaded"
          onRetry={() => void loadCatalog(true)}
        />
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={passages.length === 0 ? "No passages installed" : "No passages in that format"}
          description={
            passages.length === 0
              ? "Reading passages arrive with a content pack. Install or import one from Settings → Data, then come back."
              : "Try the other format — the coach works the same way on both."
          }
          action={
            passages.length === 0 ? (
              <Button variant="outline" onClick={() => navigate("/settings")}>
                Open Settings
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setFormat("all")}>
                Clear the filter
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((passage) => {
            const record = ledger[passage.id] ?? null;
            return (
              <Card key={passage.id} className="flex flex-col">
                <CardHeader className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="primary">{FORMAT_LABEL[passage.format] ?? passage.format}</Badge>
                    <Badge tone="outline">{passage.difficulty}</Badge>
                    {record ? (
                      <Badge tone="success">
                        Sat · {record.correct}/{record.total}
                      </Badge>
                    ) : (
                      <Badge tone="default">Solutions locked</Badge>
                    )}
                  </div>
                  <CardTitle className="mt-2">{passage.title}</CardTitle>
                  {passage.question_types.length > 0 && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {passage.question_types.map((type) => qtypeLabel(type)).join(" · ")}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-3 pt-2">
                  <span className="text-[11px] tabular text-muted-foreground">
                    {passage.questions} questions
                    {passage.word_count ? ` · ${passage.word_count} words` : ""}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => navigate(`/reading/coach/${encodeURIComponent(passage.id)}`)}
                  >
                    <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                    Study it
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

export default CoachPicker;
