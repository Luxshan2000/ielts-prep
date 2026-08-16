/**
 * The transcript, and the timeline of every question in it.
 *
 * **The transcript is the answer key.** That is not a figure of speech: every keyed
 * answer is a verbatim span of a spoken line, so once you have read the line that carried
 * one, this recording can never test you again. The gate is therefore the sidecar's, not
 * this component's — while it is shut, `transcript.lines` is `[]` and every `timeline` is
 * `null` in the response itself, so there is nothing in memory for a devtools toggle to
 * reveal, and the padlock repeats the server's own words rather than inventing its own.
 *
 * Once it is open, the layout says what to do with it. **Every line is a button that
 * plays exactly that moment**, because re-hearing the three seconds you lost is the single
 * most valuable action available in a skill whose audio otherwise plays once and is gone.
 * That is the point of the screen, so it is the whole right-hand column rather than a
 * control tucked inside an accordion.
 *
 * Beside it, each question expands into the four moments around its answer in a fixed
 * order — what you could have known before it, what announced it, what was actually said,
 * and what to do if you lost it. Its replay button asks `POST /coach/replay`, which
 * returns the windows already ordered for playback: signpost, then decoy, then answer.
 * That order is the teaching. A decoy played *after* the answer is a curiosity; played
 * before it, it is the three seconds the learner actually lived through.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Lock, Rewind, SpellCheck, Volume2 } from "lucide-react";
import { Badge, Button, Card, CardContent, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatTimestamp } from "@/lib/format";
import { typeLabel } from "../../qtypes";
import { ClipPlayerBar, useClipPlayer, type Clip } from "./ClipPlayer";
import { Callout, Chip, Marked, PlayMoment, SectionHead } from "./primitives";
import { useCoachStore } from "./store";
import {
  optionPairs,
  timingsOf,
  type QuestionCard,
  type ReplaySegment,
  type TeachingPayload,
} from "./types";

// ------------------------------------------------------------------- the gate ---

export function TranscriptGate({
  reason,
  onPractise,
  onMock,
  starting,
}: {
  reason: string;
  onPractise?: () => void;
  onMock?: () => void;
  starting?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <EmptyState
          icon={Lock}
          title="The transcript opens once you have sat this part"
          description={reason}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              {onPractise && (
                <Button loading={starting} onClick={onPractise}>
                  Sit this part now
                </Button>
              )}
              {onMock && (
                <Button variant="outline" onClick={onMock}>
                  Sit a full mock instead
                </Button>
              )}
            </div>
          }
        />
      </CardContent>
    </Card>
  );
}

export const GATE_REASON =
  "In listening the transcript is the answer key: every gap, every decoy and every signpost is in it, in order. Reading it before you have answered does not make this part easier; it retires it. Ten minutes of guessing badly is worth more than an hour of reading the script.";

// ------------------------------------------------------------------ the panel ---

export function TranscriptStudy({ doc }: { doc: TeachingPayload }) {
  const player = useClipPlayer(doc.audio.media_path);
  const timings = useMemo(() => timingsOf(doc), [doc]);
  const [focus, setFocus] = useState<number | null>(doc.questions[0]?.number ?? null);

  /** One line, played tight — no lead-in, because the learner chose this line. */
  const lineClip = useCallback(
    (lineIndex: number, label?: string): Clip | null => {
      const timing = timings[lineIndex];
      if (!timing) return null;
      return { startMs: timing.start_ms, endMs: timing.end_ms, label };
    },
    [timings],
  );

  /** Line index → the question numbers whose answer or decoy sits on it. */
  const marks = useMemo(() => {
    const map = new Map<number, { answers: number[]; decoys: number[] }>();
    const bucket = (index: number) => {
      const found = map.get(index) ?? { answers: [], decoys: [] };
      map.set(index, found);
      return found;
    };
    for (const question of doc.questions) {
      if (question.number === null) continue;
      const cue = question.timeline?.cue_line_index;
      if (typeof cue === "number") bucket(cue).answers.push(question.number);
      const decoy = question.timeline?.distraction?.decoy_line_index;
      if (typeof decoy === "number") bucket(decoy).decoys.push(question.number);
    }
    return map;
  }, [doc.questions]);

  const focused = doc.questions.find((question) => question.number === focus) ?? null;
  const focusedCue = focused?.timeline?.cue_line_index ?? null;

  const speakerName = useCallback(
    (id: string | null) =>
      doc.speakers.find((s) => s.id === id)?.name ?? id ?? "",
    [doc.speakers],
  );

  return (
    <div className="space-y-4">
      <ClipPlayerBar player={player} title={`Part ${doc.part}: ${doc.title}`} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        {/* --------------------------------------------- the question timeline --- */}
        <div className="space-y-3">
          <SectionHead
            title="Every question, as a timeline"
            hint="Before it, what announced it, what was said, and what to do if you lost it."
          />
          {doc.questions.map((question) => (
            <QuestionTimeline
              key={question.number ?? question.group_id}
              scriptId={doc.script_id}
              question={question}
              focused={focus === question.number}
              onFocus={() => setFocus(question.number)}
              player={player}
              lineClip={lineClip}
              timings={timings}
            />
          ))}
        </div>

        {/* ------------------------------------------------------- the script --- */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="space-y-2 rounded-xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">The script</h3>
              <span className="text-[11px] text-muted-foreground">
                Click any line to hear it again
              </span>
            </div>
            <p className="text-[12px] leading-5 text-muted-foreground">
              {focused
                ? `Question ${focused.number}'s answer line is marked. Its decoy, where there is one, is marked in amber.`
                : "Lines carrying an answer are marked with their question number."}
            </p>
            {!doc.transcript.timed && (
              <p className="text-[12px] leading-5 text-muted-foreground">
                This part is not rendered yet, so the lines read but do not play.
              </p>
            )}
            <ul className="scrollbar-thin max-h-[65vh] space-y-0.5 overflow-y-auto pr-1">
              {doc.transcript.lines.map((line) => {
                const mark = marks.get(line.index);
                const timing = timings[line.index];
                const isCue = focusedCue === line.index;
                const speaker = speakerName(line.speaker);
                const playable = Boolean(timing) && player.ready;
                const sounding =
                  Boolean(player.current && timing) &&
                  player.current?.startMs === timing?.start_ms;
                return (
                  <li key={line.index}>
                    <button
                      type="button"
                      disabled={!playable}
                      aria-label={
                        timing
                          ? `Play line ${line.index + 1} from ${formatTimestamp(timing.start_ms)}`
                          : `Line ${line.index + 1}. This part is not rendered, so it cannot be played.`
                      }
                      onClick={() => {
                        const clip = lineClip(line.index, `line ${line.index + 1}`);
                        if (clip) player.play([clip]);
                      }}
                      className={cn(
                        "flex w-full gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] leading-relaxed transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isCue
                          ? "bg-primary/10 ring-1 ring-primary/40"
                          : playable
                            ? "hover:bg-accent/60"
                            : "cursor-default",
                        sounding && "bg-primary/15",
                      )}
                    >
                      <span className="mt-px flex w-11 shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground">
                        {sounding ? (
                          <Volume2
                            className="h-3 w-3 animate-pulse text-primary"
                            aria-hidden="true"
                          />
                        ) : (
                          <Rewind className="h-3 w-3 opacity-60" aria-hidden="true" />
                        )}
                        {timing ? formatTimestamp(timing.start_ms) : "-"}
                      </span>
                      <span className="min-w-0 flex-1">
                        {speaker && (
                          <span className="mr-1.5 font-semibold text-muted-foreground">
                            {speaker}:
                          </span>
                        )}
                        {line.text ?? ""}
                        {mark && mark.answers.length > 0 && (
                          <span className="ml-1.5 inline-flex gap-1 align-middle">
                            {mark.answers.map((number) => (
                              <Badge key={number} tone="success">
                                {number}
                              </Badge>
                            ))}
                          </span>
                        )}
                        {mark && mark.decoys.length > 0 && (
                          <span className="ml-1.5 inline-flex gap-1 align-middle">
                            {mark.decoys.map((number) => (
                              <Badge key={number} tone="warning">
                                decoy {number}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- one question ----

function QuestionTimeline({
  scriptId,
  question,
  focused,
  onFocus,
  player,
  lineClip,
  timings,
}: {
  scriptId: string;
  question: QuestionCard;
  focused: boolean;
  onFocus: () => void;
  player: ReturnType<typeof useClipPlayer>;
  lineClip: (lineIndex: number, label?: string) => Clip | null;
  timings: Record<number, { start_ms: number; end_ms: number | null }>;
}) {
  const timeline = question.timeline;
  const number = question.number;
  const loadReplay = useCoachStore((s) => s.loadReplay);
  const replay = useCoachStore((s) =>
    number === null ? null : (s.replays[`${scriptId}:${number}`] ?? null),
  );

  const options = optionPairs(question.options);
  const diagnoses = timeline?.option_diagnosis ?? [];
  const accepted = (timeline?.accepted_answers ?? [])
    .map((slot) => slot.join(" / "))
    .join(" + ");

  /**
   * The whole moment, in the order the server put it in.
   *
   * The windows are computed server-side from `timing.json`'s sample-accurate offsets
   * rather than guessed here, and they arrive already sequenced — what announced it,
   * what tempted you, what was actually said. Playing them as one queue is what puts
   * the withdrawn value and the real one three seconds apart.
   */
  const playMoment = useCallback(async () => {
    if (number === null) return;
    const doc = replay?.doc ?? (await loadReplay(scriptId, number));
    const segments = (doc?.segments ?? []).filter(
      (segment): segment is ReplaySegment & { start_ms: number } =>
        segment.playable && typeof segment.start_ms === "number",
    );
    if (segments.length === 0) return;
    player.play(
      segments.map((segment) => ({
        startMs: segment.start_ms,
        endMs: segment.end_ms,
        label: SEGMENT_LABEL[segment.role] ?? segment.role,
      })),
    );
  }, [loadReplay, number, player, replay, scriptId]);

  const cueTiming =
    typeof timeline?.cue_line_index === "number" ? timings[timeline.cue_line_index] : undefined;
  const signpostClip =
    typeof timeline?.signpost?.line_index === "number"
      ? lineClip(timeline.signpost.line_index, "what announced it")
      : null;

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border bg-card p-4 transition-colors",
        focused ? "border-primary/60" : "border-border",
      )}
    >
      {/* -------------------------------------------------------- the header --- */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button
          type="button"
          onClick={onFocus}
          className="flex min-w-0 items-start gap-2.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[12px] font-semibold tabular-nums text-muted-foreground">
            {number}
          </span>
          <span className="min-w-0 whitespace-pre-wrap text-[13px] leading-6 text-foreground">
            {question.prompt || typeLabel(question.qtype)}
          </span>
        </button>
        <Badge tone="outline">{typeLabel(question.qtype)}</Badge>
      </div>

      {accepted && (
        <p className="text-[13px]">
          <span className="text-muted-foreground">Accepted: </span>
          <span className="font-medium text-success">{accepted}</span>
        </p>
      )}

      {/* ---------------------------- the action this whole screen exists for --- */}
      <div className="flex flex-wrap items-center gap-2">
        <PlayMoment
          label={
            timeline?.distraction
              ? "Replay the moment: decoy, then the answer"
              : "Replay the moment this was answered"
          }
          at={cueTiming?.start_ms}
          disabled={!player.ready || replay?.status === "loading"}
          active={Boolean(cueTiming) && player.current?.startMs === cueTiming?.start_ms}
          onPlay={() => void playMoment()}
        />
        {replay?.status === "error" && (
          <span role="alert" className="text-[12px] text-destructive">
            {replay.error}
          </span>
        )}
      </div>

      {/* ------------------------------------------------------------ BEFORE --- */}
      {timeline?.prediction?.slot && (
        <Moment step="Before" title="What you could have known">
          <p className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-muted-foreground">The gap needed</span>
            <Chip tone="good">{timeline.prediction.slot.label}</Chip>
            {timeline.prediction.range && (
              <>
                <span className="text-muted-foreground">in the range</span>
                <Chip tone="neutral">{timeline.prediction.range}</Chip>
              </>
            )}
          </p>
          {timeline.prediction.note && (
            <p className="text-[13px] leading-6 text-muted-foreground">
              {timeline.prediction.note}
            </p>
          )}
        </Moment>
      )}

      {/* ---------------------------------------------------------- APPROACH --- */}
      {timeline?.signpost && (
        <Moment step="Approach" title="What announced it">
          <div className="flex flex-wrap items-center gap-2">
            <PlayMoment
              label={`"${timeline.signpost.phrase}"`}
              at={
                typeof timeline.signpost.line_index === "number"
                  ? timings[timeline.signpost.line_index]?.start_ms
                  : undefined
              }
              disabled={!signpostClip || !player.ready}
              active={Boolean(signpostClip) && player.current?.startMs === signpostClip?.startMs}
              onPlay={() => signpostClip && player.play([signpostClip])}
            />
            {timeline.signpost.kind && (
              <Badge tone="primary">{timeline.signpost.kind.label}</Badge>
            )}
          </div>
          <p className="text-[12px] leading-5 text-muted-foreground">
            These markers are a closed set of maybe a hundred and fifty phrases. They recur in every
            recording in the paper and they are the only handholds you get in Part 4.
          </p>
        </Moment>
      )}

      {/* -------------------------------------------------------- THE MOMENT --- */}
      {timeline?.answer_quote && (
        <Moment step="The moment" title="What was actually said">
          <p className="rounded-lg bg-muted/60 px-2.5 py-2 text-[13px] leading-6 text-foreground">
            &ldquo;
            <Marked
              text={timeline.cue_text || timeline.answer_quote}
              mark={timeline.answer_quote}
            />
            &rdquo;
          </p>
          {timeline.paraphrase_link && (
            <>
              <p className="flex flex-wrap items-center gap-2 text-[13px]">
                <Chip tone="printed">{timeline.paraphrase_link.printed}</Chip>
                <span aria-hidden="true" className="text-muted-foreground">
                  →
                </span>
                <Chip tone="audio">{timeline.paraphrase_link.audio}</Chip>
              </p>
              <p className="text-[12px] leading-5 text-muted-foreground">
                The printed stem is the paraphrase and the recording is the original, the opposite
                way round from a reading summary. Waiting for the printed word to be spoken is the
                commonest silent loss in this paper, because it generates no feeling of difficulty.
              </p>
            </>
          )}
        </Moment>
      )}

      {/* ----------------------------------------------------------- THE TRAP --- */}
      {timeline?.distraction && (
        <Moment step="The trap" title="Where the mark went" tone="warn">
          <div className="flex flex-wrap items-center gap-2">
            {timeline.distraction.traps.map((trap) => (
              <Badge key={trap.slug} tone="warning">
                {trap.label}
              </Badge>
            ))}
            {timeline.distraction.decoy && (
              <span className="text-[13px]">
                <span className="text-muted-foreground">The speaker offered </span>
                <span className="font-semibold text-warning line-through">
                  {timeline.distraction.decoy}
                </span>
              </span>
            )}
          </div>
          {timeline.distraction.trap && (
            <p className="text-[12px] leading-5 text-muted-foreground">
              {timeline.distraction.trap.what_happened}
            </p>
          )}
          {timeline.distraction.signal && (
            <p className="rounded-lg border border-warning/40 bg-warning/8 px-2.5 py-2 text-[13px] leading-6">
              <span className="text-muted-foreground">The words that took it back: </span>
              &ldquo;{timeline.distraction.signal}&rdquo;
            </p>
          )}
          {timeline.decoy_text && (
            <p className="text-[12px] leading-5 text-muted-foreground">
              <Marked text={timeline.decoy_text} mark={timeline.distraction.signal} tone="decoy" />
            </p>
          )}
          {timeline.distraction.note && (
            <p className="text-[13px] leading-6 text-foreground">{timeline.distraction.note}</p>
          )}
          <p className="text-[12px] leading-5 text-muted-foreground">
            Use the replay button at the top of this card: it plays the value that was withdrawn and
            the value that counted, back to back.
          </p>
        </Moment>
      )}

      {/* ------------------------------------------ letter types: the options --- */}
      {diagnoses.length > 0 && (
        <Moment step="The options" title="Why the wrong ones were easy to hear">
          <ul className="space-y-2">
            {diagnoses.map((row) => {
              const clip =
                typeof row.heard_at === "number"
                  ? lineClip(row.heard_at, `option ${row.option} in the recording`)
                  : null;
              return (
                <li key={row.option} className="space-y-1.5 rounded-lg border border-border p-2.5">
                  <p className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-semibold">{row.option}</span>
                    <span className="min-w-0 text-muted-foreground">
                      {options.find(([letter]) => letter === row.option)?.[1] ?? ""}
                    </span>
                  </p>
                  {row.why_tempting && (
                    <p className="text-[13px] leading-6 text-foreground">{row.why_tempting}</p>
                  )}
                  {row.why_wrong && (
                    <p className="text-[13px] leading-6 text-muted-foreground">{row.why_wrong}</p>
                  )}
                  {clip && (
                    <PlayMoment
                      label="Hear where it was raised"
                      at={row.heard_at === null ? undefined : timings[row.heard_at]?.start_ms}
                      disabled={!player.ready}
                      active={player.current?.startMs === clip.startMs}
                      onPlay={() => player.play([clip])}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-[12px] leading-5 text-muted-foreground">
            Every option in this type is mentioned or clearly evoked somewhere in the recording. An
            option you never heard is one you missed, not one that was not there.
          </p>
        </Moment>
      )}

      {/* ------------------------------------------------------------- AFTER --- */}
      {(timeline?.recovery || timeline?.form) && (
        <Moment step="After" title="If this is the one you lost">
          {timeline?.recovery && (
            <p className="text-[13px] leading-6 text-foreground">{timeline.recovery}</p>
          )}
          {timeline?.form && (
            <>
              <p className="text-[13px] leading-6 text-muted-foreground">
                {timeline.form.risk && (
                  <Badge tone="warning" className="mr-1.5 gap-1">
                    <SpellCheck className="h-3 w-3" aria-hidden="true" />
                    {timeline.form.risk.label}
                  </Badge>
                )}
                {timeline.form.note}
              </p>
              <Callout tone="warn" title="A form loss is not a listening loss">
                You heard it. Marks lost this way need three weeks of orthography, not six months of
                listening, and they are the cheapest marks on the paper to get back.
              </Callout>
            </>
          )}
        </Moment>
      )}

      {/* The authored explanation stays as the plain-language summary of all of it. */}
      {timeline?.explanation && (
        <p className="border-t border-border pt-3 text-[12px] leading-6 text-muted-foreground">
          {timeline.explanation}
        </p>
      )}
    </div>
  );
}

/** What the transport bar announces while each window is sounding. */
const SEGMENT_LABEL: Record<string, string> = {
  signpost: "what announced it",
  decoy: "the value that was withdrawn",
  answer: "the value that counted",
};

function Moment({
  step,
  title,
  tone = "plain",
  children,
}: {
  step: string;
  title: string;
  tone?: "plain" | "warn";
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "space-y-2 rounded-lg border-l-2 pl-3",
        tone === "warn" ? "border-l-warning" : "border-l-primary/40",
      )}
    >
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{step}</span>
        <span className="text-[13px] font-semibold text-foreground">{title}</span>
      </p>
      {children}
    </section>
  );
}
