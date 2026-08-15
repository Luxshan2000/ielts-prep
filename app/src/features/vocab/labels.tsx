/** Human-facing labels, tones and small formatters shared by the vocab screens. */

import type { ReactNode } from "react";
import {
  Boxes,
  Layers,
  Mic,
  Music4,
  PenLine,
  Repeat2,
  type LucideProps,
} from "lucide-react";
import type { BadgeTone } from "@/components/ui";
import type {
  CardMaturity,
  ExerciseKind,
  RatingLabel,
  VocabEntry,
  VocabPos,
  VocabStatus,
} from "./types";

export const POS_LABELS: Record<string, string> = {
  noun: "noun",
  verb: "verb",
  adj: "adjective",
  adv: "adverb",
  prep: "preposition",
  phrase: "phrase",
  collocation: "collocation",
  other: "other",
};

export const POS_VALUES: VocabPos[] = [
  "noun",
  "verb",
  "adj",
  "adv",
  "prep",
  "phrase",
  "collocation",
  "other",
];

export const CEFR_VALUES = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

/**
 * CEFR in words. The codes are fine in a column under a heading that explains
 * them; a bare "C1" floating beside a word is a code the learner has to look up.
 */
export const LEVEL_LABEL: Record<string, string> = {
  A1: "beginner",
  A2: "elementary",
  B1: "intermediate",
  B2: "upper intermediate",
  C1: "advanced",
  C2: "advanced",
};

export function levelLabel(level: string | null | undefined): string | null {
  if (!level) return null;
  return LEVEL_LABEL[level.toUpperCase()] ?? null;
}

/** The 20 IELTS topic tags the sidecar accepts (`routes/vocab.py::TOPIC_TAGS`). */
export const TOPIC_TAGS = [
  "environment",
  "education",
  "technology",
  "health",
  "globalisation",
  "work-careers",
  "travel-tourism",
  "media-advertising",
  "crime-law",
  "family-relationships",
  "art-culture",
  "science-research",
  "urbanisation-housing",
  "transport",
  "food-diet",
  "sport-fitness",
  "money-economy",
  "government-society",
  "language-communication",
  "nature-animals",
] as const;

export function topicLabel(tag: string): string {
  return tag.replace(/-/g, " ");
}

/** The sidecar's placeholder while background enrichment has not run yet (§3.2). */
export const PENDING_DEFINITION = "(pending)";

export function isPendingDefinition(definition: string | null | undefined): boolean {
  return !definition?.trim() || definition.trim() === PENDING_DEFINITION;
}

export const STATUS_META: Record<VocabStatus, { label: string; tone: BadgeTone; hint: string }> = {
  suggested: {
    label: "Suggested",
    tone: "warning",
    hint: "Waiting in your inbox — not scheduled until you accept it.",
  },
  active: { label: "Active", tone: "primary", hint: "In your review rotation." },
  suspended: {
    label: "Suspended",
    tone: "outline",
    hint: "Kept with its history, but never shown in a review.",
  },
  known: { label: "Known", tone: "success", hint: "Marked as learned; only misuse brings it back." },
};

/**
 * "Young" and "Mature" are Anki's names for a card whose interval is under and
 * over three weeks. A learner reads them as a verdict on the word rather than a
 * fact about the schedule, so the schedule is what these say instead.
 */
export const MATURITY_META: Record<CardMaturity, { label: string; tone: BadgeTone }> = {
  new: { label: "New", tone: "default" },
  learning: { label: "Learning", tone: "warning" },
  young: { label: "Settling in", tone: "primary" },
  mature: { label: "Well settled", tone: "success" },
};

export const MODULE_LABELS: Record<string, string> = {
  speaking: "Speaking",
  writing: "Writing",
  reading: "Reading",
  listening: "Listening",
  pronunciation: "Pronunciation",
  seed: "study deck",
  manual: "your own list",
};

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };

/** "from your Speaking session on 12 March" — the inbox's provenance line (R2-5). */
export function sourceAttribution(entry: VocabEntry): string {
  const module = entry.source?.module ?? "manual";
  const when = new Date(entry.created_at);
  const date = Number.isNaN(when.getTime())
    ? null
    : when.toLocaleDateString(undefined, DATE_FMT);

  if (module === "seed") {
    const deck = entry.source?.detail?.replace(/^deck:/, "");
    return deck ? `from the ${topicLabel(deck)} study deck` : "from a study deck";
  }
  if (module === "manual") {
    return date ? `added by you on ${date}` : "added by you";
  }
  const label = MODULE_LABELS[module] ?? module;
  return date ? `from your ${label} session on ${date}` : `from your ${label} practice`;
}

// ---------------------------------------------------------------- exercises ---

export interface ExerciseMeta {
  label: string;
  icon: React.ComponentType<LucideProps>;
  /** One line explaining what the learner is being asked to do. */
  hint: string;
}

export const EXERCISE_META: Record<ExerciseKind, ExerciseMeta> = {
  flip: { label: "Recall", icon: Repeat2, hint: "Say the meaning, then check yourself." },
  cloze: { label: "Gap fill", icon: PenLine, hint: "Type the missing word." },
  use_in_sentence: {
    label: "Use it",
    icon: PenLine,
    hint: "Write a sentence — the language model checks it.",
  },
  collocation: { label: "Collocation", icon: Boxes, hint: "Pick the word all of these share." },
  audio_recall: { label: "Listen", icon: Music4, hint: "Type the word you hear." },
  speaking_drill: { label: "Speak", icon: Mic, hint: "Say it out loud in a full sentence." },
};

export const DECK_KIND_META: Record<string, { label: string; icon: React.ComponentType<LucideProps> }> =
  {
    topic: { label: "Topic deck", icon: Layers },
    awl: { label: "Academic Word List", icon: Layers },
    "upgrade-pairs": { label: "Band-7 upgrades", icon: Layers },
    other: { label: "Deck", icon: Layers },
  };

// ------------------------------------------------------------------ ratings ---

export interface RatingMeta {
  value: number;
  key: RatingLabel;
  label: string;
  /** Keyboard shortcut digit. */
  shortcut: string;
  className: string;
}

export const RATINGS: RatingMeta[] = [
  {
    value: 1,
    key: "again",
    label: "Again",
    shortcut: "1",
    className:
      "border-destructive/40 text-destructive hover:bg-destructive/10 data-[suggested=true]:ring-destructive/50",
  },
  {
    value: 2,
    key: "hard",
    label: "Hard",
    shortcut: "2",
    className:
      "border-warning/40 text-warning hover:bg-warning/10 data-[suggested=true]:ring-warning/50",
  },
  {
    value: 3,
    key: "good",
    label: "Good",
    shortcut: "3",
    className:
      "border-primary/40 text-primary hover:bg-primary/10 data-[suggested=true]:ring-primary/50",
  },
  {
    value: 4,
    key: "easy",
    label: "Easy",
    shortcut: "4",
    className:
      "border-success/40 text-success hover:bg-success/10 data-[suggested=true]:ring-success/50",
  },
];

// --------------------------------------------------------------- formatting ---

/** Renders the `**word**` emphasis the sidecar puts in exercise prompts. */
export function renderEmphasis(text: string): ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-foreground">
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/** "due now" / "in 3 days" / "3 days ago" from an ISO timestamp. */
export function formatDue(iso: string | null | undefined): string {
  if (!iso) return "—";
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "—";
  const deltaMs = target - Date.now();
  const abs = Math.abs(deltaMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < minute) return deltaMs <= 0 ? "due now" : "in under a minute";
  const [amount, unit] =
    abs < hour
      ? [Math.round(abs / minute), "minute"]
      : abs < day
        ? [Math.round(abs / hour), "hour"]
        : abs < 60 * day
          ? [Math.round(abs / day), "day"]
          : [Math.round(abs / (30 * day)), "month"];
  const plural = amount === 1 ? unit : `${unit}s`;
  return deltaMs <= 0 ? `${amount} ${plural} ago` : `in ${amount} ${plural}`;
}

/** "12 Mar 2026" — compact absolute date for tables. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function percent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}
