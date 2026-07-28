/**
 * Prediction — the tab this whole screen exists for, and the one it opens on.
 *
 * Listening practice with **no audio at all**. The learner reads the printed gaps and
 * decides, for each one, what kind of word can possibly fill it: a number, a plural noun,
 * a spelled name. That decision is made from grammar already on the page, it takes about
 * four seconds an item, and it is the highest-yield technique in the paper — because
 * roughly nine tenths of a recording carries no answer at all, and knowing what the burst
 * will sound like is what turns a six-minute vigilance task into ten short ones.
 *
 * It is also the one listening exercise immune to the constraint that governs everything
 * else here. The audio plays once; this is replayable forever, and it is worth running
 * *before* a first attempt rather than after.
 *
 * **So the drill runs whether or not the gate is open, and the split is the feature.** The
 * printed frames, the cue table and the fourteen slots are never gated — they are the
 * technique, and a closed list of slot names gives nothing away. The *authored* slot for
 * each gap is the answer to the exercise and arrives with the rest of the timeline.
 * Locked, the learner still commits to a prediction for every gap and still gets the cue
 * table to reason from; they simply are not marked yet. Handing the answers over first
 * would turn the strongest skill in the module into a page somebody skimmed.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Lock, Play, RotateCcw, Timer, X } from "lucide-react";
import { Badge, Button, Card, CardContent, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { typeLabel } from "../../qtypes";
import { SLOT_LABELS } from "./labels";
import { Callout, Chip, Disclosure, Marked, SectionHead } from "./primitives";
import { useCoachStore } from "./store";
import type { PredictionsDoc, SlotRef } from "./types";

/** The preview pause the recording actually gives you. */
const PREVIEW_SECONDS = 30;

export function PredictionPanel({
  scriptId,
  doc,
  error,
}: {
  scriptId: string;
  doc: PredictionsDoc | null;
  error: string | null;
}) {
  const guesses = useCoachStore((s) => s.guesses);
  const setGuess = useCoachStore((s) => s.setGuess);
  const revealPrediction = useCoachStore((s) => s.revealPrediction);
  const revealAllPredictions = useCoachStore((s) => s.revealAllPredictions);
  const resetPredictions = useCoachStore((s) => s.resetPredictions);

  const [remaining, setRemaining] = useState<number | null>(null);

  const items = useMemo(
    () => (doc?.items ?? []).filter((item) => typeof item.number === "number"),
    [doc],
  );
  const numbers = useMemo(
    () => items.map((item) => item.number as number),
    [items],
  );

  /** The fourteen slots, in the order the server listed them. Never gated. */
  const slotOrder = useMemo<SlotRef[]>(
    () =>
      Object.entries(doc?.slots ?? {}).map(([slug, entry]) => ({ slug, ...entry })),
    [doc],
  );

  const marking = Boolean(doc && !doc.locked);

  useEffect(() => {
    if (remaining === null || remaining <= 0) return undefined;
    const id = setInterval(
      () => setRemaining((value) => (value === null ? null : value - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [remaining]);

  // At zero the pause is over — exactly as it is in the recording, which does not wait
  // either. Where the slots are known, everything reveals and the learner sees what
  // their eye missed; where they are not, the timer is still the point.
  useEffect(() => {
    if (remaining === 0 && marking) revealAllPredictions(scriptId, numbers);
  }, [remaining, marking, revealAllPredictions, scriptId, numbers]);

  const start = useCallback(() => {
    resetPredictions(scriptId, numbers);
    setRemaining(PREVIEW_SECONDS);
  }, [numbers, resetPredictions, scriptId]);

  const reset = useCallback(() => {
    resetPredictions(scriptId, numbers);
    setRemaining(null);
  }, [numbers, resetPredictions, scriptId]);

  if (error && !doc) {
    return (
      <Card>
        <CardContent className="pt-5">
          <EmptyState
            icon={Lock}
            title="The prediction drill is closed right now"
            description={error}
          />
        </CardContent>
      </Card>
    );
  }

  if (!doc || items.length === 0) {
    return (
      <Card>
        <CardContent className="pt-5">
          <EmptyState
            icon={Timer}
            title="No printed questions to predict from"
            description="This part carries no question frames the drill can work with. The technique itself does not need them: read each gap, decide what class of word can fill it, and write that in the margin before the audio starts."
          />
        </CardContent>
      </Card>
    );
  }

  const answered = items.filter(
    (item) => (guesses[`${scriptId}:${item.number}`]?.slot ?? null) !== null,
  ).length;
  const revealedItems = marking
    ? items.filter((item) => guesses[`${scriptId}:${item.number}`]?.revealed)
    : [];
  const right = revealedItems.filter(
    (item) =>
      guesses[`${scriptId}:${item.number}`]?.slot === (item.prediction.slot?.slug ?? null),
  ).length;

  return (
    <div className="space-y-4">
      <SectionHead
        title="Slot-type every gap before you hear anything"
        hint="Four seconds a question. The printed words around the gap decide what can go in it — a determiner, a printed unit, a parallel -ing form."
      >
        <div className="flex flex-wrap items-center gap-2">
          {remaining !== null && (
            <Badge tone={remaining > 5 ? "primary" : "warning"} className="tabular-nums">
              {remaining > 0 ? formatDuration(remaining) : "pause over"}
            </Badge>
          )}
          <Badge tone="outline">
            {answered} of {items.length} predicted
          </Badge>
          {revealedItems.length > 0 && (
            <Badge tone={right === revealedItems.length ? "success" : "default"}>
              {right}/{revealedItems.length} matched
            </Badge>
          )}
          <Button size="sm" onClick={start}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            {remaining === null ? "Run the 30-second pause" : "Restart the pause"}
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </Button>
        </div>
      </SectionHead>

      <p className="text-[13px] leading-6 text-muted-foreground">{doc.note}</p>

      {!marking && (
        <Callout tone="teach" title="Predict now — the marking comes after you have sat it">
          {doc.message ??
            "The authored slot for each gap arrives once you have submitted an attempt on this part. That is deliberate: predicting is the exercise, and reading our answer before you have tried it turns the strongest skill in the module into a page you skimmed."}
        </Callout>
      )}

      {remaining === null && (
        <Callout tone="teach" title="Run it against the clock at least once">
          Thirty seconds is what the recording gives you, and it is enough for ten gaps only if you
          decide rather than deliberate. Untimed, everyone predicts well; the skill is doing it fast
          enough that you are still reading when the audio starts.
        </Callout>
      )}

      <div className="space-y-3">
        {items.map((item) => {
          const number = item.number as number;
          const guess = guesses[`${scriptId}:${number}`] ?? { slot: null, revealed: false };
          const authored = item.prediction.slot;
          const revealed = marking && guess.revealed;
          const matched = revealed && guess.slot === authored?.slug;
          const missed = revealed && guess.slot !== null && guess.slot !== authored?.slug;

          return (
            <div
              key={number}
              className={cn(
                "space-y-3 rounded-xl border bg-card p-4",
                matched ? "border-success/50" : missed ? "border-warning/50" : "border-border",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[12px] font-semibold tabular-nums text-muted-foreground">
                    {number}
                  </span>
                  <p className="min-w-0 whitespace-pre-wrap text-[13px] leading-6 text-foreground">
                    {revealed && item.prediction.cue ? (
                      <Marked text={item.prompt ?? ""} mark={item.prediction.cue} />
                    ) : (
                      (item.prompt ?? typeLabel(item.qtype))
                    )}
                  </p>
                </div>
                <Badge tone="outline">{typeLabel(item.qtype)}</Badge>
              </div>

              {item.instruction && (
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {item.instruction}
                </p>
              )}

              {/* The cue is a word already printed on the learner's page, so naming it
                  teaches them where to look rather than giving anything away. It is the
                  one half of the payload that is open before the attempt. */}
              {!revealed && item.prediction.cue && (
                <p className="text-[12px] leading-5 text-muted-foreground">
                  The printed word that fixes this gap is{" "}
                  <span className="font-semibold text-foreground">
                    &ldquo;{item.prediction.cue}&rdquo;
                  </span>
                  . Work from it.
                </p>
              )}

              <div
                role="group"
                aria-label={`What kind of word fills the gap in question ${number}?`}
                className="flex flex-wrap gap-1.5"
              >
                {slotOrder.map((slot) => {
                  const chosen = guess.slot === slot.slug;
                  const isAnswer = revealed && authored?.slug === slot.slug;
                  return (
                    <button
                      key={slot.slug}
                      type="button"
                      aria-pressed={chosen}
                      disabled={revealed}
                      title={slot.listening_for}
                      onClick={() => setGuess(scriptId, number, slot.slug)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-[12px] transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "disabled:cursor-default",
                        isAnswer
                          ? "border-success bg-success/15 font-semibold text-foreground"
                          : chosen
                            ? "border-primary bg-primary/12 font-semibold text-foreground"
                            : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
                        revealed && !isAnswer && !chosen && "opacity-50",
                      )}
                    >
                      {slot.label}
                    </button>
                  );
                })}
              </div>

              {!revealed ? (
                <div className="flex flex-wrap items-center gap-2">
                  {marking && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={guess.slot === null}
                      onClick={() => revealPrediction(scriptId, number)}
                    >
                      Check this one
                    </Button>
                  )}
                  {guess.slot === null ? (
                    <span className="text-[12px] text-muted-foreground">
                      Choose one — a guess you commit to is worth more than a guess you keep open.
                    </span>
                  ) : (
                    !marking && (
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                        Committed. Sit the part, then come back and see how you did.
                      </span>
                    )
                  )}
                </div>
              ) : (
                <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                  <p className="flex flex-wrap items-center gap-2 text-[13px]">
                    {matched ? (
                      <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    ) : (
                      <X className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                    )}
                    <span className="text-muted-foreground">The gap needs</span>
                    <Chip tone="good">{authored?.label ?? "—"}</Chip>
                    {missed && (
                      <>
                        <span className="text-muted-foreground">— you predicted</span>
                        <Chip tone="warn">
                          {slotOrder.find((s) => s.slug === guess.slot)?.label ?? guess.slot}
                        </Chip>
                      </>
                    )}
                  </p>
                  {item.prediction.note && (
                    <p className="text-[13px] leading-6 text-foreground">{item.prediction.note}</p>
                  )}
                  {item.prediction.cue && (
                    <p className="text-[12px] leading-5 text-muted-foreground">
                      The printed word that fixes it is{" "}
                      <span className="font-semibold text-foreground">
                        &ldquo;{item.prediction.cue}&rdquo;
                      </span>
                      . That is the whole technique: the page tells you, before anyone speaks.
                    </p>
                  )}
                  {item.prediction.range && (
                    <p className="text-[12px] leading-5 text-muted-foreground">
                      Plausible range:{" "}
                      <span className="font-semibold tabular-nums text-foreground">
                        {item.prediction.range}
                      </span>
                      . A figure outside it is a mis-hearing you can reject at the moment of
                      writing, which is the only moment you will get.
                    </p>
                  )}
                  {(authored?.hazard ?? SLOT_LABELS[authored?.slug ?? ""]?.hazard) && (
                    <p className="text-[12px] leading-5 text-muted-foreground">
                      How this slot is usually lost:{" "}
                      {authored?.hazard ?? SLOT_LABELS[authored?.slug ?? ""]?.hazard}.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {marking && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => revealAllPredictions(scriptId, numbers)}
          >
            Show every slot
          </Button>
          {doc.slot_profile.length > 0 && (
            <span className="text-[12px] text-muted-foreground">
              This part is built on{" "}
              {doc.slot_profile
                .slice(0, 3)
                .map((entry) => `${entry.count} × ${entry.label.toLowerCase()}`)
                .join(", ")}
              .
            </span>
          )}
        </div>
      )}

      {/* ------------------------------------------------------ the technique --- */}
      {doc.cue_table.length > 0 && (
        <Disclosure
          defaultOpen={!marking}
          title="The cue table — how a printed frame fixes a slot"
          subtitle="Twenty rows. Internalise them and you can slot-type a whole question set in fifteen seconds."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-[13px]">
              <caption className="sr-only">
                Printed frames and the answer slot each one forces
              </caption>
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-1.5 pr-3 font-semibold">
                    What is printed
                  </th>
                  <th scope="col" className="py-1.5 pr-3 font-semibold">
                    What can go in it
                  </th>
                  <th scope="col" className="py-1.5 font-semibold">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody>
                {doc.cue_table.map((row, index) => (
                  <tr key={index} className="border-b border-border/60 align-top">
                    <td className="py-1.5 pr-3 font-medium text-foreground">{row.printed}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">
                      {doc.slots[row.slot]?.label ?? row.slot}
                    </td>
                    <td className="py-1.5 text-muted-foreground">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Disclosure>
      )}

      {doc.preview_protocol.length > 0 && (
        <Disclosure title="The five-step preview, against the clock">
          <ol className="space-y-1.5">
            {doc.preview_protocol.map((step, index) => (
              <li key={index} className="flex gap-3 text-[13px] leading-6">
                <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                  {step.from_s}–{step.to_s}s
                </span>
                <span className="min-w-0 flex-1 text-foreground">{step.step}</span>
              </li>
            ))}
          </ol>
        </Disclosure>
      )}
    </div>
  );
}
