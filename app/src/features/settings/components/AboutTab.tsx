import { useEffect, useState } from "react";
import { ExternalLink, Lock } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface SystemInfo {
  version?: string;
  python?: string;
  os_release?: string;
  db?: string;
  migrations?: string | null;
  mock_enabled?: boolean;
  platform?: { os?: string; arch?: string; ram_gb?: number | null };
  uptime_s?: number;
}

const REPO_URL = "https://github.com/Luxshan2000/bandready";

function open(url: string): void {
  const bridge = typeof window !== "undefined" ? window.bandready : undefined;
  if (bridge?.openExternal) bridge.openExternal(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-1.5 last:border-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="tabular text-[13px] text-foreground">{value}</span>
    </div>
  );
}

export function AboutTab() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<SystemInfo>("/api/v1/system/info")
      .then((res) => active && setInfo(res))
      .catch((err: unknown) => {
        if (!active) return;
        setError(
          err instanceof ApiError && err.isOffline
            ? "The sidecar is not responding, so build details are unavailable."
            : "Could not read the sidecar build details.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>BandReady</CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Open-source IELTS practice that runs entirely on your machine.
          </p>
        </CardHeader>
        <CardContent className="space-y-1">
          {error && <p className="text-[13px] text-muted-foreground">{error}</p>}
          {info && (
            <>
              <Row label="App version" value={info.version ?? "unknown"} />
              <Row label="Python runtime" value={info.python ?? "unknown"} />
              <Row
                label="Platform"
                value={
                  info.platform
                    ? `${info.platform.os ?? "?"} · ${info.platform.arch ?? "?"}${
                        info.platform.ram_gb ? ` · ${info.platform.ram_gb} GB` : ""
                      }`
                    : (info.os_release ?? "unknown")
                }
              />
              <Row label="Database" value={info.db ?? "unknown"} />
              <Row label="Schema revision" value={info.migrations ?? "none"} />
              {info.mock_enabled && <Row label="Mock providers" value="enabled" />}
            </>
          )}
          <div className="pt-3">
            <Button variant="outline" size="sm" onClick={() => open(REPO_URL)}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Source code
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" aria-hidden="true" />
            How your keys are stored
            <Badge tone="outline">honest disclosure</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-[13px] text-muted-foreground">
          <p>
            API keys are encrypted with a key generated on this install and stored beside the
            settings, both readable only by your user account. That protects against casual
            reads and stray backups — it does not protect against someone who is already
            logged in as you.
          </p>
          <p>
            If you would rather BandReady never held the key at all, type{" "}
            <code className="font-mono text-foreground">{"${MY_API_KEY}"}</code> into the API
            key field. The reference is stored literally and resolved from your environment at
            the moment it is used.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
