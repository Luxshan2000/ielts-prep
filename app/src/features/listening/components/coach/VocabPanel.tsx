/**
 * Vocabulary — the five to eight chunks worth learning before you press play.
 *
 * The discipline of this list is the `blocks_q` field: every entry names a real question
 * on this script whose answer or whose signpost turns on it. A word you did not know and
 * did not need is not worth a card, and a pre-teach list without that constraint becomes a
 * topic glossary, which is the least useful artefact in language teaching.
 *
 * Most entries carry their partners and their prepositions rather than standing alone,
 * because it is the chunk that goes past at speed — "tucked in against", not "tuck".
 *
 * The item and its gloss are open before the attempt, because pre-teaching that waits
 * until afterwards is not pre-teaching. The line it is spoken on and the mark it costs
 * are the answer's address, so those arrive with the transcript.
 */

import { useCallback, useMemo, useState } from "react";
import { BookmarkPlus, Check, GraduationCap, Lock } from "lucide-react";
import { Badge, Button, Card, CardContent, EmptyState } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { ClipPlayerBar, useClipPlayer } from "./ClipPlayer";
import { Callout, PlayMoment, SectionHead } from "./primitives";
import { timingsOf, type TeachingPayload } from "./types";

type SaveState = "idle" | "saving" | "saved" | "failed";

export function VocabPanel({ doc }: { doc: TeachingPayload }) {
  const unlocked = doc.gate.unlocked;
  const items = doc.pre_teach;
  const player = useClipPlayer(unlocked ? doc.audio.media_path : null);
  const timings = useMemo(() => timingsOf(doc), [doc]);
  const [states, setStates] = useState<Record<string, SaveState>>({});
  const [error, setError] = useState<string | null>(null);

  const lineText = useCallback(
    (index: number | null) =>
      index === null
        ? ""
        : (doc.transcript.lines.find((line) => line.index === index)?.text ?? ""),
    [doc.transcript.lines],
  );

  const add = useCallback(
    async (term: string, context: string) => {
      setError(null);
      setStates((current) => ({ ...current, [term]: "saving" }));
      try {
        await api.post("/api/v1/vocab/suggestions", {
          items: [
            {
              term,
              sentence_context: context,
              source: { kind: "listening", item_id: doc.script_id },
              card_type: "listening_gap",
            },
          ],
        });
        setStates((current) => ({ ...current, [term]: "saved" }));
      } catch (err) {
        setStates((current) => ({ ...current, [term]: "failed" }));
        setError(
          err instanceof ApiError ? err.detail : "That could not be sent to your vocabulary inbox.",
        );
      }
    },
    [doc.script_id],
  );

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="pt-5">
          <EmptyState
            icon={GraduationCap}
            title="No pre-teach list on this part"
            description="This script was authored before the listening teaching payload existed. The signposts tab still carries the marker inventory, which is the vocabulary that pays back fastest in this paper anyway."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHead
        title={`Learn these ${items.length} before you press play`}
        hint="Each one names the question it could cost you. Nothing here is on the list because it is difficult — only because it is load-bearing."
      >
        {!unlocked && (
          <Badge tone="default" className="gap-1">
            <Lock className="h-3 w-3" aria-hidden="true" />
            audio opens after you sit it
          </Badge>
        )}
      </SectionHead>

      {unlocked && doc.audio.media_path && (
        <ClipPlayerBar player={player} title={`Part ${doc.part} — ${doc.title}`} />
      )}

      {error && (
        <p role="alert" className="text-[13px] font-medium text-destructive">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {items.map((entry) => {
          const timing = entry.line_index === null ? undefined : timings[entry.line_index];
          const state = states[entry.item] ?? "idle";
          const context = lineText(entry.line_index);
          return (
            <li
              key={`${entry.item}-${entry.line_index ?? "x"}`}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-foreground">{entry.item}</span>
                  {entry.blocks_q !== null && (
                    <Badge tone="outline">costs you Q{entry.blocks_q}</Badge>
                  )}
                </p>
                {entry.gloss && (
                  <p className="text-[13px] leading-6 text-muted-foreground">{entry.gloss}</p>
                )}
                {unlocked && context && (
                  <p className="text-[12px] leading-5 text-muted-foreground">
                    &ldquo;{context}&rdquo;
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {unlocked && timing && (
                  <PlayMoment
                    label="Hear it in context"
                    at={timing.start_ms}
                    disabled={!player.ready}
                    active={player.current?.startMs === timing.start_ms}
                    onPlay={() =>
                      player.play([
                        { startMs: timing.start_ms, endMs: timing.end_ms, label: entry.item },
                      ])
                    }
                  />
                )}
                {state === "saved" ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-success">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    In your inbox
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={state === "saving"}
                    onClick={() => void add(entry.item, context || entry.gloss || entry.item)}
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    {state === "failed" ? "Try again" : "Add to vocabulary"}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Callout tone="info" title="Where the return actually is">
        In order: the signpost markers, which are a closed set and the only handholds in Part 4; the
        direction words on any map task; the idioms that carry agreement and refusal in a discussion
        — <em>I&rsquo;ll give that a miss</em>, <em>put me down for that</em> — none of which contain
        the words printed in the options; and only then the topic vocabulary.
      </Callout>
    </div>
  );
}
