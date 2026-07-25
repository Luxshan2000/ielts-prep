import { useEffect } from "react";
import { CheckCircle2, PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { useSessionStore } from "@/stores";

/**
 * The one global answer to "the sidecar went away" (12 §9).
 *
 * Everything in BandReady is served by a local Python process. If it crashes, is
 * restarting after an update, or is still booting, every screen would otherwise
 * fill with its own failure card. This strip states it once, calmly, keeps the
 * app usable, and clears itself the moment the process answers again — the store
 * re-resolves the contract (the port and token both rotate on restart) and bumps
 * `generation` so screens can refetch.
 */
export function SidecarStatusBanner() {
  const offline = useSessionStore((s) => s.offline);
  const checking = useSessionStore((s) => s.checking);
  const justRecovered = useSessionStore((s) => s.justRecovered);
  const connect = useSessionStore((s) => s.connect);
  const watch = useSessionStore((s) => s.watch);

  // Mounted once for the lifetime of the shell, so this is where the watch lives.
  useEffect(() => watch(), [watch]);

  if (!offline && !justRecovered) return null;

  if (justRecovered) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex shrink-0 items-center gap-2 border-b border-success/40 bg-success/10 px-4 py-2 text-[13px] text-foreground"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        <span>Reconnected to BandReady&apos;s local service.</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/40 bg-warning/10 px-4 py-2"
    >
      <PlugZap className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <p className="text-[13px] font-medium text-foreground">
        BandReady&apos;s local service isn&apos;t responding
      </p>
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        Your work is saved on disk — nothing is lost. Reconnecting automatically…
      </p>
      <Button variant="outline" size="sm" loading={checking} onClick={() => void connect()}>
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        Retry now
      </Button>
    </div>
  );
}
