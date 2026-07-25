/**
 * The report's transcript pane (04 §7).
 *
 * Candidate turns are rendered through `AnnotatedText` with `errors[].quote` matched to
 * UTF-16 offsets (see `quotes.ts` — the same normalized-substring rule the sidecar used
 * for anchoring), so hovering or focusing a dashed span shows `{issue, better}`. Each
 * candidate turn carries its own replay button.
 *
 * Errors whose quote spans a turn boundary — or that the match cannot place — are listed
 * below the transcript rather than silently dropped.
 */

import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { MessageSquare } from "lucide-react";
import { AnnotatedText, Badge, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatTimestamp } from "@/lib/format";
import { annotateTurn, findQuote } from "./quotes";
import { TurnAudio } from "./TurnAudio";
import type { ReportError, TranscriptTurn } from "../store";

export interface ReportTranscriptHandle {
  /** Scroll the first turn containing `quote` into view and flash it. */
  revealQuote: (quote: string) => boolean;
}

export interface ReportTranscriptProps {
  sessionId: string;
  turns: TranscriptTurn[];
  errors: ReportError[];
  className?: string;
}

export const ReportTranscript = forwardRef<ReportTranscriptHandle, ReportTranscriptProps>(
  function ReportTranscript({ sessionId, turns, errors, className }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);

    const annotated = useMemo(() => {
      const consumed = new Set<number>();
      const rows = turns.map((turn) => {
        if (turn.role !== "user") return { turn, annotations: [] };
        const { annotations, matched } = annotateTurn(turn.text, errors);
        matched.forEach((i) => consumed.add(i));
        return { turn, annotations };
      });
      const leftovers = errors.filter((_, i) => !consumed.has(i));
      return { rows, leftovers };
    }, [errors, turns]);

    useImperativeHandle(
      ref,
      () => ({
        revealQuote: (quote: string) => {
          const index = turns.findIndex(
            (turn) => turn.role === "user" && findQuote(turn.text, quote) !== null,
          );
          if (index < 0) return false;
          const el = containerRef.current?.querySelector<HTMLElement>(`[data-turn="${index}"]`);
          if (!el) return false;
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          el.classList.add("ring-2", "ring-primary");
          window.setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1600);
          return true;
        },
      }),
      [turns],
    );

    if (turns.length === 0) {
      return (
        <EmptyState
          icon={MessageSquare}
          title="Transcript not available"
          description="This build stores the transcript with the session but does not serve it back yet. The quoted evidence below still comes from what you actually said."
          className={className}
        />
      );
    }

    return (
      <div className={cn("space-y-4", className)}>
        <div ref={containerRef} className="space-y-3">
          {annotated.rows.map(({ turn, annotations }, index) => {
            const candidate = turn.role === "user";
            return (
              <div
                key={index}
                data-turn={index}
                className={cn(
                  "rounded-xl border p-4 transition-shadow",
                  candidate ? "border-border bg-card" : "border-transparent bg-muted/40",
                )}
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <Badge tone={candidate ? "primary" : "default"}>
                    {candidate ? "You" : "Examiner"}
                  </Badge>
                  <span className="tabular text-[11px] text-muted-foreground">
                    {formatTimestamp(turn.t_ms ?? 0)}
                  </span>
                  {turn.part ? (
                    <span className="text-[11px] text-muted-foreground">Part {turn.part}</span>
                  ) : null}
                  {candidate && (
                    <TurnAudio
                      sessionId={sessionId}
                      audioFile={turn.audio_file}
                      label="Hear it"
                      className="ml-auto"
                    />
                  )}
                </div>

                {candidate && annotations.length > 0 ? (
                  <AnnotatedText
                    text={turn.text}
                    annotations={annotations}
                    keyboardNav={false}
                    className="text-[14px] leading-7"
                  />
                ) : (
                  <p
                    className={cn(
                      "whitespace-pre-wrap text-[14px] leading-7",
                      candidate ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {turn.text}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {annotated.leftovers.length > 0 && (
          <section className="space-y-2 rounded-xl border border-border bg-muted/25 p-4">
            <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Also flagged ({annotated.leftovers.length})
            </h4>
            <p className="text-[12px] text-muted-foreground">
              These couldn't be placed on a single turn, so they aren't highlighted above.
            </p>
            <ul className="space-y-2">
              {annotated.leftovers.map((error, i) => (
                <li key={i} className="rounded-lg border border-border bg-card px-3 py-2">
                  <p className="text-[13px] leading-5">“{error.quote}”</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">{error.issue}</p>
                  {error.better && (
                    <p className="mt-0.5 text-[12px] text-success">→ {error.better}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  },
);
