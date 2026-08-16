/**
 * The small pieces the coach screens need that the shared UI kit does not export:
 * a disclosure row, a tinted callout, a chip, a copy action, a "locate it in the
 * passage" button and the push into the vocabulary inbox.
 *
 * All of them are real `<button>`s with real ARIA relationships, so Tab and
 * Enter/Space work without a single custom key handler.
 *
 * **Copy, never insert.** Nothing here writes into an answer field. A phrase that
 * arrives in the answer by button press was never learned.
 */

import { useCallback, useId, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  ChevronDown,
  Copy,
  Crosshair,
  Info,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { friendlyMessage } from "@/lib/errors";
import { suggestVocab } from "../../useDictionary";

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

// ------------------------------------------------------------------ section head ---

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

export type ChipTone = "neutral" | "text" | "stem" | "warn" | "good";

const CHIP_STYLE: Record<ChipTone, string> = {
  neutral: "border-border bg-muted/60 text-muted-foreground",
  /** The passage's own words. */
  text: "border-primary/40 bg-primary/10 text-foreground",
  /** The question's words. */
  stem: "border-warning/40 bg-warning/10 text-foreground",
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

// -------------------------------------------------------------------- locate ---

/**
 * "Where it was." Scrolls the passage pane to the paragraph and highlights the
 * exact span — seeing the answer sitting in the text is the review step.
 */
export function LocateButton({
  label,
  paragraph,
  onLocate,
  className,
}: {
  label?: string;
  paragraph?: string | null;
  onLocate: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onLocate}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/8 px-2 py-1",
        "text-[12px] font-medium text-foreground transition-colors hover:bg-primary/15",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Crosshair className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      {label ?? "Show it in the passage"}
      {paragraph && <span className="font-semibold text-primary">{paragraph}</span>}
    </button>
  );
}

// ------------------------------------------------------------------- copy chunk ---

export function CopyChunk({
  text,
  label = "Copy",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setFailed(true);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground",
        "transition-colors hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {failed ? "Select and copy it" : copied ? "Copied" : label}
    </button>
  );
}

// ----------------------------------------------------------------- add to bank ---

export interface BankItem {
  term: string;
  definition?: string | null;
  /** The sentence it came from — the card shows this on the back. */
  sentence?: string | null;
  passageId?: string | null;
  detail?: string | null;
}

/**
 * Push one item into the vocabulary suggestion inbox. It lands as a suggestion, not
 * as a scheduled card: the learner still has to accept it, which is the point.
 */
export function AddToBank({
  item,
  label = "Add to vocabulary",
  className,
}: {
  item: BankItem;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async () => {
    setState("saving");
    setError(null);
    try {
      await suggestVocab({
        term: item.term,
        sentenceContext: item.sentence ?? "",
        definition: item.definition ?? null,
        itemId: item.passageId ?? null,
        detail: item.detail ?? "Reading coach",
      });
      setState("saved");
    } catch (err) {
      setState("failed");
      setError(
        friendlyMessage(
          err,
          "That couldn't be added to your vocabulary inbox.",
          "BandReady's local service isn't answering. Try again in a moment.",
        ),
      );
    }
  }, [item]);

  if (state === "saved") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[12px] font-medium text-success",
          className,
        )}
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        In your vocabulary inbox
      </span>
    );
  }

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        loading={state === "saving"}
        disabled={state === "saving"}
        onClick={() => void send()}
      >
        <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
        {state === "failed" ? "Try again" : label}
      </Button>
      {error && (
        <span role="alert" className="text-[12px] text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
