/**
 * The three primitives the teaching screens need that the shared UI kit does not
 * export: a disclosure (accordion) row, a tinted callout, and the "add to bank"
 * action. They live here rather than in `components/ui` because the kit is owned
 * elsewhere and these are shaped by this feature's needs.
 *
 * All three are keyboard-operable with no custom key handling: they are real
 * `<button>`s with real ARIA relationships, so Tab and Enter/Space work by default
 * and nothing needs a roving tabindex.
 */

import { useCallback, useId, useState, type ReactNode } from "react";
import { AlertTriangle, BookmarkPlus, Check, ChevronDown, Info, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { friendlyMessage } from "@/lib/errors";
import { sendToVocabInbox, type BankItem } from "./api";

// ------------------------------------------------------------------ disclosure ---

export interface DisclosureProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned chip shown in the header row. */
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function Disclosure({
  title,
  subtitle,
  meta,
  defaultOpen = false,
  children,
  className,
}: DisclosureProps) {
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
          onClick={() => setOpen((v) => !v)}
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

// ----------------------------------------------------------------- add to bank ---

export interface AddToBankProps {
  item: BankItem;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Sends one item to the vocabulary suggestion inbox. Stays in the "Saved" state for
 * the life of the screen — re-sending the same chunk twice is harmless server-side
 * (the ingest dedupes by lemma) but the button repeating its offer reads as if the
 * first press did nothing.
 */
export function AddToBank({ item, label = "Add to bank", size = "sm", className }: AddToBankProps) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async () => {
    setState("saving");
    setError(null);
    try {
      await sendToVocabInbox([item]);
      setState("saved");
    } catch (err) {
      setState("failed");
      setError(
        friendlyMessage(
          err,
          "Couldn't add that to your bank.",
          "BandReady's local service isn't answering — try again in a moment.",
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
        size={size === "sm" ? "sm" : "md"}
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
