/**
 * Signposts and distractions — the two halves of "how was I supposed to know".
 *
 * A signpost is the speaker announcing what they are about to do. In Reading the skill
 * that decides the band is spotting that two differently-worded propositions match; in
 * Listening you get one pass, so what you get instead is metadiscourse — and it is a
 * closed set of perhaps a hundred and fifty phrases that recur in every recording in
 * English. That is learnable in a fortnight, which makes it the best-value vocabulary in
 * the module.
 *
 * A distraction is the other half: the wrong value the speaker actually offered. It has no
 * equivalent in reading, where the text sits still and can be re-read, and it is the most
 * characteristic thing about this paper. Family C — the speaker takes it back — is the
 * signature, and every one of our items carries the lexical signal that announces it,
 * because a correction marked only by intonation does not exist in a synthesized render
 * and an item built on one would be unfair rather than difficult.
 *
 * **The phrases themselves are script**, so they arrive with the transcript and for the
 * same reason. Before the part has been sat this tab still teaches the inventory — which
 * is the transferable half anyway.
 */

import { useMemo } from "react";
import { Lock, Signpost as SignpostIcon, TriangleAlert } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { ClipPlayerBar, useClipPlayer } from "./ClipPlayer";
import { SIGNPOST_LABELS, TRAP_FAMILY_LABEL, TRAP_LABELS } from "./labels";
import { Callout, Chip, PlayMoment, SectionHead } from "./primitives";
import { signpostRows, timingsOf, trapRows, type TeachingPayload } from "./types";

export function SignpostPanel({ doc }: { doc: TeachingPayload }) {
  const unlocked = doc.gate.unlocked;
  const player = useClipPlayer(unlocked ? doc.audio.media_path : null);
  const timings = useMemo(() => timingsOf(doc), [doc]);
  const signposts = useMemo(() => signpostRows(doc), [doc]);
  const traps = useMemo(() => trapRows(doc), [doc]);

  const kindCounts = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const row of signposts) {
      const slug = row.kind?.slug ?? "";
      if (!slug) continue;
      const found = counts.get(slug) ?? {
        label: row.kind?.label ?? SIGNPOST_LABELS[slug]?.label ?? slug,
        count: 0,
      };
      found.count += 1;
      counts.set(slug, found);
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [signposts]);

  /** The families this part's items are built on, straight off the server's profile. */
  const familyCounts = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const entry of doc.trap_profile) {
      const found = counts.get(entry.family) ?? { label: entry.family_label, count: 0 };
      found.count += entry.count;
      counts.set(entry.family, found);
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [doc.trap_profile]);

  return (
    <div className="space-y-5">
      <Callout tone="teach" title="The one sentence to take from this tab">
        {doc.last_value_rule ??
          "The answer is the last value stated for that slot before the speaker moves on, never the first. A speaker who corrects themselves always says so out loud."}
      </Callout>

      {unlocked && doc.audio.media_path && (
        <ClipPlayerBar player={player} title={`Part ${doc.part}: ${doc.title}`} />
      )}

      {/* ------------------------------------------------------- the signposts --- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SignpostIcon className="h-4 w-4 text-primary" aria-hidden="true" />
            The markers this recording uses
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {kindCounts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {kindCounts.map(([slug, entry]) => (
                <Chip key={slug} tone="audio" title={SIGNPOST_LABELS[slug]?.means}>
                  {entry.label} × {entry.count}
                </Chip>
              ))}
            </div>
          )}

          {unlocked ? (
            signposts.length > 0 ? (
              <ul className="space-y-1.5">
                {signposts.map((row) => {
                  const timing =
                    typeof row.line_index === "number" ? timings[row.line_index] : undefined;
                  return (
                    <li
                      key={`${row.line_index}-${row.phrase}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-2.5"
                    >
                      <span className="min-w-0 text-[13px] leading-6">
                        &ldquo;{row.phrase}&rdquo;
                      </span>
                      <span className="flex items-center gap-2">
                        {row.kind && <Badge tone="primary">{row.kind.label}</Badge>}
                        {timing && (
                          <PlayMoment
                            label="Hear it"
                            at={timing.start_ms}
                            disabled={!player.ready}
                            active={player.current?.startMs === timing.start_ms}
                            onPlay={() =>
                              player.play([
                                {
                                  startMs: timing.start_ms,
                                  endMs: timing.end_ms,
                                  label: row.phrase,
                                },
                              ])
                            }
                          />
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[13px] leading-6 text-muted-foreground">
                This script carries no authored signpost map. The inventory below still applies. It
                is a property of spoken English, not of this recording.
              </p>
            )
          ) : (
            <LockedNote
              message={
                doc.gate.message ??
                "The verbatim markers are lines of the script, so they arrive with the transcript."
              }
            />
          )}

          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-[12px] font-medium text-foreground">The eleven kinds</p>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {Object.entries(SIGNPOST_LABELS).map(([slug, entry]) => (
                <div key={slug}>
                  <dt className="text-[13px] font-medium text-foreground">{entry.label}</dt>
                  <dd className="text-[12px] leading-5 text-muted-foreground">{entry.means}</dd>
                </div>
              ))}
            </dl>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ the distractions --- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-warning" aria-hidden="true" />
            The traps this part is built on
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {familyCounts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {familyCounts.map(([family, entry]) => (
                <Chip key={family} tone="printed">
                  {TRAP_FAMILY_LABEL[family as keyof typeof TRAP_FAMILY_LABEL] ?? entry.label} ×{" "}
                  {entry.count}
                </Chip>
              ))}
            </div>
          )}

          {unlocked ? (
            doc.trap_profile.length > 0 ? (
              <ul className="space-y-2">
                {doc.trap_profile.map((entry) => (
                  <li
                    key={entry.slug}
                    className="space-y-1.5 rounded-lg border border-warning/40 bg-warning/8 p-3"
                  >
                    <p className="flex flex-wrap items-center gap-2">
                      <Badge tone="warning">{entry.label}</Badge>
                      <span className="text-[12px] text-muted-foreground">
                        {entry.family_label}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        Questions {entry.questions.join(", ")}
                      </span>
                    </p>
                    <p className="text-[13px] leading-6 text-foreground">{entry.what_happened}</p>
                    <p className="text-[12px] leading-5 text-muted-foreground">
                      <span className="font-medium text-foreground">Listen for: </span>
                      {entry.signal}
                    </p>
                    <p className="text-[12px] leading-5 text-muted-foreground">
                      <span className="font-medium text-foreground">What to do: </span>
                      {entry.fix}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] leading-6 text-muted-foreground">
                No item on this part carries an authored decoy. That is a legitimate shape for a
                recording: about half the questions in a well-built part are clean.
              </p>
            )
          ) : (
            <LockedNote
              message={
                doc.gate.message ??
                "The decoy values are what the speaker actually said, so they arrive with the transcript."
              }
            />
          )}

          {unlocked && traps.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <SectionHead
                title="The value that was offered, question by question"
                hint="Each one was withdrawn out loud. The signal is the words that withdrew it."
              />
              <ul className="space-y-1.5">
                {traps.map(({ question, distraction }) => (
                  <li
                    key={question.number}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-border bg-card p-2.5 text-[13px]"
                  >
                    <span className="font-semibold tabular-nums text-muted-foreground">
                      Q{question.number}
                    </span>
                    {distraction.decoy && (
                      <span className="font-semibold text-warning line-through">
                        {distraction.decoy}
                      </span>
                    )}
                    {distraction.signal && (
                      <span className="text-muted-foreground">
                        withdrawn by &ldquo;{distraction.signal}&rdquo;
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-[12px] font-medium text-foreground">
              The five families, and why family C has no equivalent in reading
            </p>
            <dl className="space-y-2">
              {Object.entries(TRAP_FAMILY_LABEL).map(([family, label]) => {
                const members = Object.entries(TRAP_LABELS).filter(
                  ([, entry]) => entry.family === family,
                );
                if (members.length === 0) return null;
                return (
                  <div key={family}>
                    <dt className="text-[13px] font-medium text-foreground">{label}</dt>
                    <dd className="text-[12px] leading-5 text-muted-foreground">
                      {members.map(([, entry]) => entry.label).join(" · ")}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <p className="text-[12px] leading-5 text-muted-foreground">
              A printed text never corrects itself. That is the whole reason the correction family
              exists here and nowhere else, and it is why the single most useful habit in this paper
              is refusing to commit until the speaker has moved on.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LockedNote({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-[13px] leading-6 text-muted-foreground">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}
