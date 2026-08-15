/**
 * `/listening/coach` — pick a part to study.
 *
 * Sorted so the parts you have already sat come first: those are the ones whose
 * transcript is open, and a part you have answered is worth several times as much study
 * as one you have not — you cannot review a recording you have never heard.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, Headphones, Lock } from "lucide-react";
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
import { api } from "@/lib/api";
import { useSidecarRecovery } from "@/lib/useSidecarRecovery";
import { useListeningStore } from "../../store";
import type { Page, TestSummary } from "../../types";
import { PART_BRIEFS } from "./labels";

interface AttemptRow {
  attempt_id: string;
  test_id: string | null;
  script_id: string | null;
  status: string;
}

const PART_OPTIONS = [
  { value: "all", label: "All four parts" },
  { value: "1", label: "Part 1 — everyday conversation" },
  { value: "2", label: "Part 2 — everyday monologue" },
  { value: "3", label: "Part 3 — academic discussion" },
  { value: "4", label: "Part 4 — academic lecture" },
];

export function CoachPicker() {
  const navigate = useNavigate();
  const scripts = useListeningStore((s) => s.scripts);
  const tests = useListeningStore((s) => s.tests);
  const loading = useListeningStore((s) => s.scriptsLoading);
  const error = useListeningStore((s) => s.scriptsError);
  const loadLibrary = useListeningStore((s) => s.loadLibrary);

  const [part, setPart] = useState("all");
  const [sat, setSat] = useState<Set<string>>(new Set());

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useSidecarRecovery(() => void loadLibrary(true));

  // Which parts have been sat — directly, or inside a full test.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const page = await api.get<Page<AttemptRow>>("/api/v1/listening/attempts?limit=200");
        const submitted = (page.items ?? []).filter((row) => row.status === "submitted");
        const byTest = new Map<string, string[]>();
        for (const test of (tests ?? []) as TestSummary[]) byTest.set(test.id, test.script_ids);
        const ids = new Set<string>();
        for (const row of submitted) {
          if (row.script_id) ids.add(row.script_id);
          if (row.test_id) for (const id of byTest.get(row.test_id) ?? []) ids.add(id);
        }
        if (!cancelled) setSat(ids);
      } catch {
        // The ledger is a nicety here: without it every card simply reads "locked".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tests]);

  const visible = useMemo(() => {
    const rows = (scripts ?? []).filter((row) => part === "all" || String(row.part) === part);
    return [...rows].sort((a, b) => {
      const left = sat.has(a.id) ? 0 : 1;
      const right = sat.has(b.id) ? 0 : 1;
      if (left !== right) return left - right;
      if (a.part !== b.part) return a.part - b.part;
      return a.title.localeCompare(b.title);
    });
  }, [part, sat, scripts]);

  const firstLoad = loading && !scripts;

  return (
    <PageShell
      title="Listening coach"
      description="One part at a time: what it is, what to predict before it plays, and where every mark went."
      back={{ to: "/listening", label: "Listening" }}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Which part"
            className="w-72"
            value={part}
            onChange={setPart}
            options={PART_OPTIONS}
          />
          <span className="text-[11px] tabular text-muted-foreground">
            {visible.length} of {scripts?.length ?? 0} parts · {sat.size} sat
          </span>
        </div>
      }
    >
      {error && !scripts ? (
        <ErrorState
          error={error}
          title="The listening library could not be loaded"
          onRetry={() => void loadLibrary(true)}
        />
      ) : firstLoad ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Headphones}
          title={
            (scripts?.length ?? 0) === 0 ? "No listening parts installed" : "Nothing in that part"
          }
          description={
            (scripts?.length ?? 0) === 0
              ? "Listening scripts arrive with a content pack. Install or import one from Settings, then every part in it can be studied here."
              : "Try another part of the paper — the coach works the same way on all four."
          }
          action={
            (scripts?.length ?? 0) === 0 ? (
              <Button variant="outline" onClick={() => navigate("/settings")}>
                Open Settings
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setPart("all")}>
                Clear the filter
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((script) => {
            const done = sat.has(script.id);
            return (
              <Card key={script.id} className="flex flex-col">
                <CardHeader className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="primary">Part {script.part}</Badge>
                    <Badge tone="outline">{script.audio.accent_label}</Badge>
                    {done ? (
                      <Badge tone="success">Transcript open</Badge>
                    ) : (
                      <Badge tone="default" className="gap-1">
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        Transcript locked
                      </Badge>
                    )}
                    {!script.audio.ready && <Badge tone="warning">Audio not generated</Badge>}
                  </div>
                  <CardTitle className="mt-2">{script.title}</CardTitle>
                  <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
                    {PART_BRIEFS[script.part]?.what ?? ""}
                  </p>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-3 pt-2">
                  <span className="text-[11px] tabular text-muted-foreground">
                    {script.questions} questions
                    {script.target_band ? ` · aimed at band ${script.target_band}` : ""}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => navigate(`/listening/coach/${encodeURIComponent(script.id)}`)}
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
