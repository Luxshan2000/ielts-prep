import type { ReactNode } from "react";
import { AlertCircle, PlugZap, RefreshCw, Settings2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { failureKind } from "@/lib/errors";
import { cn } from "@/lib/cn";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

/**
 * The three failures a learner can actually act on.
 *
 * `offline`  — the local sidecar process is not answering at all. Nothing was lost;
 *              the global banner is already reconnecting, so this state stays calm.
 * `provider` — the sidecar answered, but the model provider behind the feature is
 *              missing, unreachable or unconfigured. This is the single most common
 *              first-run failure (a fresh install ships with the `ollama` preset and
 *              no model running), so it must name the cause and point at Settings
 *              rather than showing a raw 502.
 * `generic`  — everything else: surface the server's own detail verbatim.
 */
export type ErrorKind = "offline" | "provider" | "generic";

/**
 * Classify any thrown value into something the UI can speak about honestly.
 * `notFound` collapses into `generic` here — a missing row still just needs the
 * server's own sentence and a retry.
 */
export function classifyError(error: unknown): ErrorKind {
  const kind = failureKind(error);
  return kind === "offline" || kind === "provider" ? kind : "generic";
}

/** The server's own words when we have them, the caller's fallback otherwise. */
export function errorDetail(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.detail) return error.detail;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

const TITLES: Record<ErrorKind, string> = {
  offline: "BandReady's local service isn't responding",
  provider: "This needs a model provider",
  generic: "Something went wrong",
};

const HINTS: Record<ErrorKind, string> = {
  offline:
    "Everything you have done is saved on disk. The app is reconnecting on its own — this will clear itself.",
  provider:
    "BandReady could not reach the model behind this feature. Choose or start a provider in Settings, then try again.",
  generic: "",
};

/**
 * Jump to Settings without depending on Router context — the app mounts a
 * `HashRouter`, so assigning the hash is a real navigation, and `ErrorState`
 * stays renderable (and unit-testable) anywhere, including inside a crashed
 * subtree that no longer has a `<Routes>` above it.
 */
function openSettings(): void {
  if (typeof window === "undefined") return;
  window.location.hash = "#/settings";
}

export interface ErrorStateProps {
  /** The thrown value. `ApiError` gets the richest treatment. */
  error: unknown;
  /** Overrides the classified heading, e.g. "Your prompts could not be loaded". */
  title?: string;
  /** Fallback body text when the error carries no detail of its own. */
  fallback?: string;
  onRetry?: () => void;
  /** Puts the retry button in its loading state. */
  retrying?: boolean;
  retryLabel?: string;
  /**
   * `block` fills a card or an empty region (page-level failures).
   * `inline` is a compact alert row for a failure beside content that still works.
   */
  variant?: "block" | "inline";
  /** Extra actions rendered after Retry / Open Settings. */
  children?: ReactNode;
  className?: string;
}

/**
 * The one place BandReady turns a failure into something a learner can act on.
 *
 * Every state carries the server's own `detail` — never a generic "an error
 * occurred" — plus at least one control: retry, or the Settings link when the
 * cause is a provider. `role="alert"` so it is announced when it replaces
 * content the learner was waiting for.
 *
 * The Settings link is a plain hash anchor rather than `useNavigate` so the
 * component can be rendered (and unit-tested) outside a Router.
 */
export function ErrorState({
  error,
  title,
  fallback = "The request did not complete.",
  onRetry,
  retrying = false,
  retryLabel = "Try again",
  variant = "block",
  children,
  className,
}: ErrorStateProps) {
  const kind = classifyError(error);
  const detail = errorDetail(error, fallback);
  const heading = title ?? TITLES[kind];
  const hint = HINTS[kind];
  const Icon = kind === "offline" ? PlugZap : AlertCircle;

  const actions = (
    <>
      {onRetry && (
        <Button size={variant === "inline" ? "sm" : "md"} loading={retrying} onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {retryLabel}
        </Button>
      )}
      {kind === "provider" && (
        <Button
          variant="outline"
          size={variant === "inline" ? "sm" : "md"}
          onClick={openSettings}
        >
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          Open Settings
        </Button>
      )}
      {children}
    </>
  );

  if (variant === "inline") {
    return (
      <div
        role="alert"
        className={cn(
          "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border p-3",
          kind === "offline"
            ? "border-warning/40 bg-warning/8"
            : "border-destructive/40 bg-destructive/8",
          className,
        )}
      >
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            kind === "offline" ? "text-warning" : "text-destructive",
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground">{heading}</p>
          <p className="mt-0.5 break-words text-[13px] text-muted-foreground">{detail}</p>
          {hint && kind === "provider" && (
            <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      </div>
    );
  }

  return (
    <div role="alert" className={className}>
      <EmptyState
        icon={Icon}
        title={heading}
        description={kind === "offline" ? hint : hint ? `${detail} ${hint}` : detail}
        action={<div className="flex flex-wrap justify-center gap-2">{actions}</div>}
      />
    </div>
  );
}

export default ErrorState;
