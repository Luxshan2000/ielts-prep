import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, RotateCcw, Volume2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Notice,
  Select,
  SkeletonCard,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { getDrills, recordDrillAttempt, type DrillItem, type DrillSet } from "../api";

/**
 * Hearing the difference, before trying to make it.
 *
 * This is perception, and it is the part of pronunciation practice that needs no model at
 * all: the learner listens to one of a minimal pair and says which one it was. It is scored
 * against a key rather than against their voice, so it is exactly as fair for a Tamil speaker
 * as for anybody else — which is more than the recording-based half can promise. Nothing here
 * is a statement about how the learner speaks, and nothing here is a band.
 *
 * It also comes first for a pedagogical reason, not just a technical one. A contrast you
 * cannot hear is one you cannot reliably produce, and drilling production against a contrast
 * the learner has not yet perceived is how practice becomes discouraging.
 *
 * **The key is ours.** The sidecar ships the pair and no answer, because the sound is made
 * here — the browser speaks one of the two words, so only this screen can know which one was
 * said. It is drawn once per round and held until the round is replaced; reading it off the
 * item (which carries no `key`) is what left this drill unable to mark anything at all.
 */

/** Every option stays shut until the sound has been played. Otherwise it is a coin toss. */
interface RowState {
  chosen?: "a" | "b";
  played: boolean;
  askedAt: number | null;
}

function coin(): "a" | "b" {
  return Math.random() < 0.5 ? "a" : "b";
}

function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const ROUND_SIZE = 10;

/** How many pairs the bank can hold before this stops fetching the whole catalogue. */
const CATALOGUE_LIMIT = 50;

export function MinimalPairDrill({ className }: { className?: string }) {
  const [set, setSet] = useState<DrillSet | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [contrast, setContrast] = useState<string>("");
  const [round, setRound] = useState<DrillItem[]>([]);
  const [keys, setKeys] = useState<Record<string, "a" | "b">>({});
  const [rows, setRows] = useState<Record<string, RowState>>({});
  /** Example words per contrast, so the picker never shows bare phonetic symbols. */
  const examples = useRef<Record<string, string>>({});

  const deal = useCallback((items: DrillItem[]) => {
    const picked = shuffled(items).slice(0, ROUND_SIZE);
    setRound(picked);
    setKeys(Object.fromEntries(picked.map((item) => [item.id, coin()])));
    setRows({});
  }, []);

  const load = useCallback(
    (which: string) => {
      setSet(null);
      setError(null);
      getDrills("minimal_pair_ab", which || undefined, CATALOGUE_LIMIT)
        .then((data) => {
          for (const item of data.items) {
            const key = String(item.contrast ?? "");
            if (key && !examples.current[key]) examples.current[key] = `${item.a} / ${item.b}`;
          }
          setSet(data);
          deal(data.items);
        })
        .catch(setError);
    },
    [deal],
  );

  useEffect(() => load(contrast), [contrast, load]);

  const speech = typeof window !== "undefined" && "speechSynthesis" in window;

  /**
   * The second half of a "Hear both", still waiting on its timer.
   *
   * This is the bug the learner hit. "Hear both" says the first word, then queues the
   * second one 900 ms later. Nothing used to cancel that timer, so a learner who answered
   * one pair, compared it, and moved straight on to the next pair heard the *old* pair
   * speak over the new one — every row played the row they had already left behind, which
   * reads exactly like a drill stuck on the pair you first picked.
   */
  const pending = useRef<number | null>(null);

  const dropQueuedSound = useCallback(() => {
    if (pending.current !== null) {
      window.clearTimeout(pending.current);
      pending.current = null;
    }
  }, []);

  const say = useCallback(
    (text: string) => {
      // Anything the learner asks for now replaces whatever was still queued.
      dropQueuedSound();
      // The platform synthesiser is enough for a single word, and it keeps this screen
      // working before any TTS model has been downloaded.
      if (!speech) return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-GB";
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
      } catch {
        /* no synthesiser — the written pair is still usable */
      }
    },
    [dropQueuedSound, speech],
  );

  /** Leaving the drill must not leave a word talking over the next screen. */
  useEffect(
    () => () => {
      dropQueuedSound();
      if (speech) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          /* nothing was speaking */
        }
      }
    },
    [dropQueuedSound, speech],
  );

  const options = useMemo(() => {
    const list = set?.contrasts ?? [];
    return [
      { value: "", label: "Every sound pair" },
      ...list.map((c) => {
        const id = String(c.id ?? c.contrast ?? "");
        const words = examples.current[id];
        const count = c.items ? ` · ${c.items} pairs` : "";
        return {
          value: id,
          label: words ? `${id}, as in ${words}${count}` : `${id}${count}`,
        };
      }),
    ];
  }, [set]);

  if (error) {
    return (
      <EmptyState
        title="The sound drills could not be loaded"
        description="The app could not reach its own background service. Nothing is lost. Try again, and if it keeps failing, restart BandReady."
        action={<Button onClick={() => load(contrast)}>Try again</Button>}
      />
    );
  }
  if (!set) return <SkeletonCard />;

  if (round.length === 0) {
    return (
      <EmptyState
        title="No pairs for that sound yet"
        description="This pack has no minimal pairs for the sound you picked. Choose another, or go back to every sound pair."
        action={<Button onClick={() => setContrast("")}>Show every sound pair</Button>}
      />
    );
  }

  const shaky = (set.accuracy ?? [])
    .filter((row) => row.attempts > 0 && row.correct < row.attempts)
    .slice(0, 3);

  const answered = round.filter((item) => rows[item.id]?.chosen).length;
  const matched = round.filter((item) => {
    const chosen = rows[item.id]?.chosen;
    return chosen && chosen === keys[item.id];
  }).length;
  const finished = answered === round.length;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Hear the difference</CardTitle>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Press play, then choose the word you heard. Your microphone is not used and nothing is
          recorded.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {options.length > 1 && (
          <Select
            size="sm"
            aria-label="Sound pair"
            value={contrast}
            onChange={setContrast}
            options={options}
          />
        )}

        {!speech && (
          <Notice tone="warning" title="This computer has no built-in voice">
            Your browser cannot speak the words, so this drill has nothing to play. The pairs below
            are still worth reading. Each row shows the two words and a sentence for each.
          </Notice>
        )}

        {/* Built from the learner's own answers, and named without a number beside
            it: this is which pairs to practise next, not a mark out of ten. */}
        {shaky.length > 0 && !contrast && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted-foreground">Pairs you have mixed up before:</span>
            {shaky.map((row) => (
              <button
                key={row.contrast}
                type="button"
                onClick={() => setContrast(row.contrast)}
                className="rounded-full border border-border px-2.5 py-1 text-[12px] text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {examples.current[row.contrast]
                  ? `${row.contrast}: ${examples.current[row.contrast]}`
                  : row.contrast}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-muted-foreground">
            {answered === 0
              ? `${round.length} pairs in this set. Play each one, then pick what you heard.`
              : `${answered} of ${round.length} answered · ${matched} matched so far`}
          </p>
          <Button variant="ghost" size="sm" onClick={() => set && deal(set.items)}>
            <RotateCcw className="h-4 w-4" />
            {finished ? "Another set" : "Start again"}
          </Button>
        </div>

        <ul className="space-y-2">
          {round.map((item) => (
            <DrillRow
              key={item.id}
              item={item}
              answerKey={keys[item.id] ?? "a"}
              state={rows[item.id] ?? { played: false, askedAt: null }}
              canPlay={speech}
              onPlay={() => {
                const key = keys[item.id] ?? "a";
                say(key === "a" ? item.a : item.b);
                setRows((r) => ({
                  ...r,
                  [item.id]: {
                    ...(r[item.id] ?? { played: false, askedAt: null }),
                    played: true,
                    askedAt: r[item.id]?.askedAt ?? Date.now(),
                  },
                }));
              }}
              onChoose={(side) => {
                const state = rows[item.id];
                const correct = side === (keys[item.id] ?? "a");
                setRows((r) => ({
                  ...r,
                  [item.id]: { ...(r[item.id] ?? { played: false, askedAt: null }), chosen: side },
                }));
                // Recorded so the bank can bring back the pairs that keep slipping.
                // A failure here costs the learner nothing, so it is not reported.
                void recordDrillAttempt({
                  itemId: item.id,
                  correct,
                  contrast: item.contrast ?? null,
                  responseMs: state?.askedAt ? Date.now() - state.askedAt : null,
                }).catch(() => undefined);
              }}
              onCompare={() => {
                say(item.a);
                pending.current = window.setTimeout(() => say(item.b), 900);
              }}
            />
          ))}
        </ul>

        {finished && (
          <p className="text-[13px] text-foreground">
            You matched {matched} of {round.length}. Sounds you missed are worth playing a few more
            times. Hearing a contrast reliably comes before saying it.
          </p>
        )}

        <Notice tone="info" title="Every accent is accepted">
          {set.accent_notice}
        </Notice>
      </CardContent>
    </Card>
  );
}

function DrillRow({
  item,
  answerKey,
  state,
  canPlay,
  onPlay,
  onChoose,
  onCompare,
}: {
  item: DrillItem;
  answerKey: "a" | "b";
  state: RowState;
  canPlay: boolean;
  onPlay: () => void;
  onChoose: (side: "a" | "b") => void;
  onCompare: () => void;
}) {
  const revealed = !!state.chosen;
  const matched = revealed && state.chosen === answerKey;

  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPlay} disabled={!canPlay}>
          <Volume2 className="h-4 w-4" />
          {state.played ? "Play again" : "Play"}
        </Button>
        {item.contrast && (
          <Badge tone="outline" title={`The two sounds this pair separates: ${item.a} and ${item.b}`}>
            {item.contrast}
          </Badge>
        )}
        {!state.played && canPlay && (
          <span className="text-[12px] text-muted-foreground">Play it before you choose</span>
        )}
        {revealed && (
          <span
            className={cn(
              "flex items-center gap-1 text-[13px] font-medium",
              matched ? "text-success" : "text-muted-foreground",
            )}
          >
            {matched && <Check className="h-4 w-4" aria-hidden="true" />}
            {matched ? "That's the one" : `It was “${answerKey === "a" ? item.a : item.b}”`}
          </span>
        )}
        {revealed && canPlay && (
          <Button variant="ghost" size="sm" onClick={onCompare}>
            Hear both
          </Button>
        )}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {(["a", "b"] as const).map((side) => {
          const word = side === "a" ? item.a : item.b;
          const isKey = revealed && answerKey === side;
          return (
            <button
              key={side}
              type="button"
              onClick={() => onChoose(side)}
              disabled={revealed || (!state.played && canPlay)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-[14px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                state.chosen === side ? "border-primary bg-primary/10" : "border-border",
                !revealed && state.played && "hover:bg-accent",
                isKey && "border-success bg-success/10",
                revealed && "cursor-default",
                !state.played && canPlay && "opacity-60",
              )}
            >
              <span className="font-medium">{word}</span>
              {(side === "a" ? item.sentence_a : item.sentence_b) && (
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  {side === "a" ? item.sentence_a : item.sentence_b}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </li>
  );
}
