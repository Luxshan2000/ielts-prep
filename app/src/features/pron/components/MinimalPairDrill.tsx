import { useCallback, useEffect, useState } from "react";
import { Check, Volume2, X } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Select, SkeletonCard } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getDrills, type DrillItem, type DrillSet } from "../api";

/**
 * Hearing the difference, before trying to make it.
 *
 * This is perception, and it is the part of pronunciation practice that needs no model at
 * all: the learner listens to one of a minimal pair and says which one it was. It is scored
 * against a key rather than against their voice, so it is exactly as fair for a Tamil speaker
 * as for anybody else — which is more than the recording-based half can promise.
 *
 * It also comes first for a pedagogical reason, not just a technical one. A contrast you
 * cannot hear is one you cannot reliably produce, and drilling production against a contrast
 * the learner has not yet perceived is how practice becomes discouraging.
 */

export function MinimalPairDrill({ className }: { className?: string }) {
  const [set, setSet] = useState<DrillSet | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [contrast, setContrast] = useState<string>("");
  const [answers, setAnswers] = useState<Record<string, "a" | "b">>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const load = useCallback((which: string) => {
    setSet(null);
    setAnswers({});
    setRevealed({});
    getDrills("minimal_pair_ab", which || undefined)
      .then(setSet)
      .catch(setError);
  }, []);

  useEffect(() => load(contrast), [contrast, load]);

  const say = (text: string) => {
    // The platform synthesiser is enough for a single word, and it keeps this screen
    // working before any TTS model has been downloaded.
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-GB";
      window.speechSynthesis.speak(utterance);
    } catch {
      /* no synthesiser — the written pair is still usable */
    }
  };

  if (error) {
    return (
      <EmptyState
        title="The drills could not load"
        description="The pronunciation service did not answer. Try again in a moment."
      />
    );
  }
  if (!set) return <SkeletonCard />;

  if (set.items.length === 0) {
    return (
      <EmptyState
        title="No drills for that contrast yet"
        description="Pick another sound pair, or clear the filter to see everything."
      />
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Hear the difference</CardTitle>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Play the word, then choose which one you heard. Nothing is recorded here.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {set.contrasts.length > 0 && (
          <Select
            aria-label="Sound pair"
            value={contrast}
            onChange={setContrast}
            options={[
              { value: "", label: "All sound pairs" },
              ...set.contrasts.map((c) => ({
                value: String(c.id ?? c.contrast ?? ""),
                label: String(c.label ?? c.contrast ?? c.id ?? ""),
              })),
            ]}
          />
        )}

        <ul className="space-y-2">
          {set.items.map((item) => (
            <DrillRow
              key={item.id}
              item={item}
              chosen={answers[item.id]}
              revealed={Boolean(revealed[item.id])}
              onSay={say}
              onChoose={(side) => {
                setAnswers((a) => ({ ...a, [item.id]: side }));
                setRevealed((r) => ({ ...r, [item.id]: true }));
              }}
            />
          ))}
        </ul>

        <p className="text-[12px] text-muted-foreground">{set.accent_notice}</p>
      </CardContent>
    </Card>
  );
}

function DrillRow({
  item,
  chosen,
  revealed,
  onSay,
  onChoose,
}: {
  item: DrillItem;
  chosen?: "a" | "b";
  revealed: boolean;
  onSay: (text: string) => void;
  onChoose: (side: "a" | "b") => void;
}) {
  // The key names the side that was spoken; without one the pair is still worth hearing, so
  // the row stays usable and simply never marks an answer.
  const key = item.key === "a" || item.key === "b" ? item.key : null;
  const correct = revealed && key != null && chosen === key;

  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onSay(key === "b" ? item.b : item.a)}>
          <Volume2 className="h-4 w-4" />
          Play
        </Button>
        {item.contrast && <Badge tone="outline">{item.contrast}</Badge>}
        {revealed && key != null && (
          <span
            className={cn(
              "flex items-center gap-1 text-[13px] font-medium",
              correct ? "text-success" : "text-warning",
            )}
          >
            {correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
            {correct ? "That's the one" : `It was “${key === "a" ? item.a : item.b}”`}
          </span>
        )}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {(["a", "b"] as const).map((side) => {
          const word = side === "a" ? item.a : item.b;
          const isKey = revealed && key === side;
          return (
            <button
              key={side}
              type="button"
              onClick={() => onChoose(side)}
              disabled={revealed}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-[14px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                chosen === side ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
                isKey && "border-success bg-success/10",
                revealed && "cursor-default",
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
