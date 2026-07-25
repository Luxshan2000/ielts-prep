import { PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

export interface OfflineBannerProps {
  /** True when the failure is "the sidecar is not reachable at all". */
  offline: boolean;
  message: string | null;
  onRetry: () => void;
  retrying?: boolean;
}

/**
 * Settings must never white-screen when the sidecar is down (12 §9): the page
 * still renders, with one banner explaining what is unavailable.
 */
export function OfflineBanner({ offline, message, onRetry, retrying }: OfflineBannerProps) {
  if (!message && !offline) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5">
      <PlugZap className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">
          {offline
            ? "BandReady's local service isn't responding"
            : "Settings could not be loaded"}
        </p>
        <p className="text-xs text-muted-foreground">
          {offline
            ? "Your saved settings are safe on disk. Nothing here can be changed until it comes back — try again in a moment."
            : (message ?? "The sidecar rejected the request.")}
        </p>
      </div>
      <Button variant="outline" size="sm" loading={retrying} onClick={onRetry}>
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        Retry
      </Button>
    </div>
  );
}
