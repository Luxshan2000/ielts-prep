/**
 * Mode + content picker for a new speaking session (04 §2). Full Mock lets the
 * sidecar sample the least-recently-served card set (04 §9 anti-gaming), so the
 * card-set control defaults to "choose for me" rather than a random pick here.
 */

import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { AlertCircle, Check } from "lucide-react";
import { Badge, Button, Field, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { MODES } from "./phases";
import { useSpeakingStore, type SpeakingActivity, type SpeakingCard } from "../store";

const PART_OPTIONS = [
  { value: "1", label: "Part 1: Interview" },
  { value: "2", label: "Part 2: Long turn" },
  { value: "3", label: "Part 3: Discussion" },
];

function cardSetOptions(cards: SpeakingCard[]) {
  const seen = new Map<string, string>();
  for (const card of cards) {
    if (card.card_set_id && !seen.has(card.card_set_id)) {
      seen.set(card.card_set_id, card.title);
    }
  }
  return [
    { value: "", label: "Choose for me (least recently practised)" },
    ...[...seen.entries()].map(([id, title]) => ({ value: id, label: title })),
  ];
}

export function ModePicker() {
  const activity = useSpeakingStore((s) => s.activity);
  const part = useSpeakingStore((s) => s.part);
  const cardSetId = useSpeakingStore((s) => s.cardSetId);
  const topic = useSpeakingStore((s) => s.topic);
  const cards = useSpeakingStore((s) => s.cards);
  const cardsLoading = useSpeakingStore((s) => s.cardsLoading);
  const cardsError = useSpeakingStore((s) => s.cardsError);
  const setActivity = useSpeakingStore((s) => s.setActivity);
  const setPart = useSpeakingStore((s) => s.setPart);
  const setCardSetId = useSpeakingStore((s) => s.setCardSetId);
  const setTopic = useSpeakingStore((s) => s.setTopic);
  const loadCards = useSpeakingStore((s) => s.loadCards);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const topicOptions = useMemo(() => {
    const forPart = cards.filter((c) => c.part === part);
    return [
      { value: "", label: "Any topic" },
      ...forPart.map((c) => ({ value: c.title, label: c.title })),
    ];
  }, [cards, part]);

  const setOptions = useMemo(() => cardSetOptions(cards), [cards]);
  const needs = MODES.find((m) => m.id === activity)?.needs ?? "none";

  /**
   * `role="radiogroup"` promises arrow-key selection, so honour it: arrows move
   * AND select (the WAI-ARIA radio-group pattern), and only the checked radio is
   * tabbable, so the four modes are one tab stop rather than four.
   */
  const radios = useRef(new Map<string, HTMLButtonElement>());
  const onRadioKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const index = MODES.findIndex((m) => m.id === activity);
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = MODES[(index + step + MODES.length) % MODES.length];
    setActivity(next.id as SpeakingActivity);
    radios.current.get(next.id)?.focus();
  };

  return (
    <div className="space-y-4">
      <div
        role="radiogroup"
        aria-label="Session mode"
        onKeyDown={onRadioKeyDown}
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {MODES.map((mode) => {
          const selected = mode.id === activity;
          return (
            <button
              key={mode.id}
              type="button"
              role="radio"
              ref={(el) => {
                if (el) radios.current.set(mode.id, el);
                else radios.current.delete(mode.id);
              }}
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActivity(mode.id as SpeakingActivity)}
              className={cn(
                "flex h-full flex-col gap-2 rounded-xl border p-4 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary bg-primary/8 ring-1 ring-primary"
                  : "border-border bg-card hover:bg-accent",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{mode.label}</span>
                {selected && <Check className="h-4 w-4 text-primary" />}
              </span>
              <span className="text-[13px] leading-5 text-muted-foreground">{mode.blurb}</span>
              <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                <Badge tone="outline">{mode.duration}</Badge>
                <Badge tone={mode.scored ? "primary" : "default"}>
                  {mode.scored ? "Band scored" : "Not scored"}
                </Badge>
              </span>
            </button>
          );
        })}
      </div>

      {cardsError !== null && (
        <div
          role="alert"
          className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border border-destructive/40 bg-destructive/8 p-3"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-foreground">
              The cue-card bank could not be loaded
            </p>
            <p className="mt-0.5 break-words text-[13px] text-muted-foreground">
              {cardsError} The topic and question-set pickers below are empty for that
              reason, not because no content is installed.
            </p>
          </div>
          <Button variant="outline" size="sm" loading={cardsLoading} onClick={() => void loadCards()}>
            Try again
          </Button>
        </div>
      )}

      {needs !== "none" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {(needs === "part" || needs === "topic") && (
            <Field label="Part">
              <Select
                value={String(part)}
                onChange={(value) => setPart(Number(value))}
                options={PART_OPTIONS}
                aria-label="Which part to practise"
              />
            </Field>
          )}
          {needs === "card_set" && (
            <Field
              label="Question set"
              hint="Leaving this on auto keeps cue cards from repeating too soon."
            >
              <Select
                value={cardSetId ?? ""}
                onChange={(value) => setCardSetId(value || null)}
                options={setOptions}
                aria-label="Question set"
              />
            </Field>
          )}
          {needs === "topic" && (
            <Field label="Topic">
              <Select
                value={topic ?? ""}
                onChange={(value) => setTopic(value || null)}
                options={topicOptions}
                aria-label="Drill topic"
              />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}
