/**
 * `/speaking/session/:sessionId/transcript` — the conversation, read back.
 *
 * The turns have always been stored (`speaking_turns`, plus the richer
 * `transcript_json` blob) and `GET /sessions/{id}/transcript` has always served them,
 * but the only screen that rendered them was the feedback report. Three of the four
 * speaking modes are never scored and so never get a report, which meant that for a
 * drill or a quick chat the transcript existed on disk and had no screen at all.
 *
 * The pane is `ReportTranscript` with no error annotations: same both-sides layout,
 * same timings, same per-turn replay. A second transcript renderer would be a second
 * place for the quote-anchoring rules to drift.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Award, MessageSquare } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  SkeletonCard,
} from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { ApiError, api } from "@/lib/api";
import { formatDate, formatDuration } from "@/lib/format";
import { ReportTranscript } from "./components/ReportTranscript";
import { activityLabel, describeError } from "./components/phases";
import { fetchTranscript, type SessionRecord, type TranscriptTurn } from "./store";
import { activityOf, statusFor, titleFor } from "./history/rows";

export function SessionTranscript() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [record, setRecord] = useState<SessionRecord | null>(null);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) {
      setError("No session id in the address.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // The record is what names the screen; the transcript is what fills it. The
      // record is required — without it we cannot even say which session this is.
      const doc = await api.get<SessionRecord>(
        `/api/v1/speaking/sessions/${encodeURIComponent(sessionId)}`,
      );
      setRecord(doc);
      setTurns(await fetchTranscript(sessionId));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "That session doesn't exist any more. It may have been deleted."
          : describeError(err),
      );
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const spoken = useMemo(() => turns.filter((t) => t.role === "user").length, [turns]);

  /**
   * The single-session route answers the live descriptor, not the history summary, so
   * it carries neither `has_transcript` nor `opening_line`. Both are right here in the
   * turns we just fetched — supplying them is what stops this page telling the learner
   * "Nothing recorded" while rendering the recording underneath it.
   */
  const enriched = useMemo<SessionRecord | null>(() => {
    if (!record) return null;
    return {
      ...record,
      has_transcript: turns.length > 0,
      turn_count: turns.length,
      opening_line:
        record.opening_line ?? turns.find((t) => t.role === "user")?.text ?? null,
    };
  }, [record, turns]);

  if (error) {
    return (
      <PageShell title="Transcript" back={{ to: "/speaking/history", label: "Speaking history" }}>
        <EmptyState
          icon={MessageSquare}
          title="This conversation couldn't be loaded"
          description={error}
          action={<Button onClick={() => void load()}>Try again</Button>}
        />
      </PageShell>
    );
  }

  if (loading && !record) {
    return (
      <PageShell title="Transcript" back={{ to: "/speaking/history", label: "Speaking history" }}>
        <SkeletonCard />
      </PageShell>
    );
  }

  const status = enriched ? statusFor(enriched, undefined) : null;
  const title = enriched ? titleFor(enriched, undefined) : "Transcript";
  const activity = enriched ? activityOf(enriched) : "";

  return (
    <PageShell
      title={title}
      description={
        record
          ? [
              activityLabel(record.activity ?? record.mode),
              record.started_at ? formatDate(record.started_at) : null,
              record.duration_s ? formatDuration(record.duration_s) : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : undefined
      }
      back={{ to: "/speaking/history", label: "Speaking history" }}
      status={status ? <Badge tone={status.tone ?? "default"}>{status.label}</Badge> : undefined}
      actions={
        record?.report_id ? (
          <Button
            size="sm"
            onClick={() =>
              navigate(
                activity === "full_mock"
                  ? `/speaking/mock/report/${record.report_id}`
                  : `/speaking/report/${record.report_id}`,
              )
            }
          >
            <Award className="h-4 w-4" />
            Open the report
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {turns.length === 0 ? (
          // Never a blank page. A session with no turns is a specific thing that
          // happened — the call connected and nobody spoke — and saying so is the
          // difference between an empty screen and a broken one.
          <EmptyState
            icon={MessageSquare}
            title="Nothing was said in this session"
            description={
              record?.status === "active"
                ? "This session was never closed, so no transcript was written. Anything spoken in it is lost."
                : "The session was recorded but no speech was transcribed — usually a microphone that was muted or not permitted."
            }
            action={<Button onClick={() => navigate("/speaking")}>Start a new session</Button>}
          />
        ) : (
          <>
            <Card>
              <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 text-[13px] text-muted-foreground">
                <span>
                  <span className="tabular font-medium text-foreground">{turns.length}</span> turns
                </span>
                <span>
                  <span className="tabular font-medium text-foreground">{spoken}</span> from you
                </span>
                {typeof record?.overall_band === "number" ? (
                  <span>
                    Marked band{" "}
                    <span className="tabular font-medium text-foreground">
                      {record.overall_band.toFixed(1)}
                    </span>
                  </span>
                ) : (
                  <span>Not marked — this mode isn't scored.</span>
                )}
              </CardContent>
            </Card>

            <ReportTranscript sessionId={sessionId} turns={turns} errors={[]} />
          </>
        )}
      </div>
    </PageShell>
  );
}

export default SessionTranscript;
