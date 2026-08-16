import { useEffect } from "react";
import { CheckCircle2, PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { useSessionStore } from "@/stores";
import { StatusStrip } from "./StatusStrip";

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
      <StatusStrip
        tone="success"
        icon={CheckCircle2}
        title="Reconnected to BandReady's local service."
      />
    );
  }

  return (
    <StatusStrip
      tone="warning"
      icon={PlugZap}
      title="BandReady's local service isn't responding"
      detail="Your work is saved on disk, so nothing is lost. Reconnecting automatically…"
      actions={
        <Button variant="outline" size="sm" loading={checking} onClick={() => void connect()}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Retry now
        </Button>
      }
    />
  );
}
