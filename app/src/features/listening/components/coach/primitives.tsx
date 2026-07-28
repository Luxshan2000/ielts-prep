/**
 * The small pieces the listening coach needs that the shared UI kit does not export:
 * a disclosure row, a tinted callout, a chip, a section head, and the two things this
 * module needs that no other one does — a span highlighted inside its own sentence,
 * and a button that plays exactly one moment of the recording.
 *
 * All of them are real `<button>`s with real ARIA relationships, so Tab and
 * Enter/Space work without a single custom key handler.
 */

import { useId, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, Info, Lightbulb, Play, Volume2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTimestamp } from "@/lib/format";

// ------------------------------------------------------------------ disclosure ---

export function Disclosure({
  title,
  subtitle,
  meta,
  defaultOpen = false,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const buttonId = useId();

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <h3 className="m-0">
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
            "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-ring focus-visible:ring-inset",
          )}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-foreground">{title}</span>
            {subtitle && (
              <span className="mt-0.5 block text-[12px] text-muted-foreground">{subtitle}</span>
            )}
          </span>
          {meta && <span className="shrink-0">{meta}</span>}
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className="border-t border-border px-4 py-4"
      >
        {open && children}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- callout ---

export type CalloutTone = "info" | "warn" | "teach";

const CALLOUT_STYLE: Record<CalloutTone, { box: string; icon: string }> = {
  info: { box: "border-border bg-muted/50", icon: "text-muted-foreground" },
  warn: { box: "border-warning/40 bg-warning/8", icon: "text-warning" },
  teach: { box: "border-primary/40 bg-primary/8", icon: "text-primary" },
};

const CALLOUT_ICON = { info: Info, warn: AlertTriangle, teach: Lightbulb } as const;

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const style = CALLOUT_STYLE[tone];
  const Icon = CALLOUT_ICON[tone];
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border p-3", style.box, className)}>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.icon)} aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        {title && <p className="text-[13px] font-semibold text-foreground">{title}</p>}
        <div className="text-[13px] leading-6 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- section head ---

export function SectionHead({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {hint && <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

// -------------------------------------------------------------------------- chip ---

export type ChipTone = "neutral" | "audio" | "printed" | "warn" | "good";

const CHIP_STYLE: Record<ChipTone, string> = {
  neutral: "border-border bg-muted/60 text-muted-foreground",
  /** What the speaker said. */
  audio: "border-primary/40 bg-primary/10 text-foreground",
  /** What the page prints. */
  printed: "border-warning/40 bg-warning/10 text-foreground",
  warn: "border-destructive/40 bg-destructive/10 text-foreground",
  good: "border-success/40 bg-success/10 text-foreground",
};

export function Chip({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-block rounded-md border px-2 py-0.5 text-[12px] leading-5",
        CHIP_STYLE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ marked span ---

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * One span highlighted inside its own sentence.
 *
 * The match is a case-insensitive substring, which is exactly the discipline the
 * content lints enforce on `answer_quote`, `signal` and `paraphrase_link` — a
 * near-miss quote fails to highlight rather than highlighting the wrong thing.
 */
export function Marked({
  text,
  mark,
  tone = "audio",
  className,
}: {
  text: string;
  mark?: string | null;
  tone?: "audio" | "decoy";
  className?: string;
}) {
  const needle = (mark ?? "").trim();
  if (!needle || needle.length < 2 || !text.toLowerCase().includes(needle.toLowerCase())) {
    return <span className={className}>{text}</span>;
  }
  const pieces = text.split(new RegExp(`(${escapeRe(needle)})`, "i"));
  return (
    <span className={className}>
      {pieces.map((piece, index) =>
        index % 2 === 1 ? (
          <mark
            key={index}
            className={cn(
              "rounded px-0.5",
              tone === "decoy"
                ? "bg-warning/30 text-foreground line-through decoration-warning"
                : "bg-primary/25 text-foreground",
            )}
          >
            {piece}
          </mark>
        ) : (
          <span key={index}>{piece}</span>
        ),
      )}
    </span>
  );
}

// --------------------------------------------------------------- play a moment ---

/**
 * The single highest-value control in listening review: play exactly the three
 * seconds where the mark was won or lost, rather than scrubbing for it.
 *
 * The label always names what will be heard, because a row of unlabelled play
 * triangles is unusable with a screen reader and barely better with eyes.
 */
export function PlayMoment({
  label,
  at,
  onPlay,
  disabled,
  active = false,
  tone = "primary",
  className,
}: {
  label: string;
  /** Start offset in ms — shown as a timestamp so the control is honest. */
  at?: number | null;
  onPlay: () => void;
  disabled?: boolean;
  active?: boolean;
  tone?: "primary" | "warn";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      disabled={disabled}
      aria-label={
        typeof at === "number" ? `${label}, from ${formatTimestamp(at)}` : label
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        tone === "warn"
          ? "border-warning/50 bg-warning/10 text-foreground hover:bg-warning/20"
          : "border-primary/40 bg-primary/8 text-foreground hover:bg-primary/15",
        active && "ring-2 ring-ring",
        className,
      )}
    >
      {active ? (
        <Volume2 className="h-3.5 w-3.5 animate-pulse text-primary" aria-hidden="true" />
      ) : (
        <Play className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      )}
      {label}
      {typeof at === "number" && (
        <span className="tabular-nums text-muted-foreground">{formatTimestamp(at)}</span>
      )}
    </button>
  );
}
