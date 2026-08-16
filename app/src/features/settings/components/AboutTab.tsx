import { useEffect, useState } from "react";
import { ExternalLink, FolderOpen, Lock, ScrollText } from "lucide-react";
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
  data_dir?: string;
  logs_dir?: string;
  log_file?: string | null;
}

/** "3h 12m" / "45s" — uptime is a useful first question in any bug report. */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const REPO_URL = "https://github.com/Luxshan2000/bandready";

function open(url: string): void {
  const bridge = typeof window !== "undefined" ? window.bandready : undefined;
  if (bridge?.openExternal) bridge.openExternal(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  /** Paths read better monospaced and must be selectable for a bug report. */
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-1.5 last:border-0">
      <span className="shrink-0 text-[13px] text-muted-foreground">{label}</span>
      <span
        className={
          mono
            ? "select-all break-all text-right font-mono text-[11px] text-foreground"
            : "tabular text-[13px] text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

export function AboutTab() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);

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
            : err instanceof ApiError
              ? err.detail
              : "Could not read the sidecar build details.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  // The Electron shell's own semver, which is distinct from the sidecar's.
  useEffect(() => {
    let active = true;
    const bridge = typeof window !== "undefined" ? window.bandready : undefined;
    if (bridge?.appVersion) {
      setAppVersion(bridge.appVersion);
      return;
    }
    if (!bridge?.getVersion) return;
    bridge
      .getVersion()
      .then((v) => active && setAppVersion(v))
      .catch((err: unknown) => {
        console.warn("[BandReady] could not read the app version from Electron", err);
      });
    return () => {
      active = false;
    };
  }, []);

  const reveal = (path: string | null | undefined, label: string): void => {
    if (!path) return;
    const bridge = typeof window !== "undefined" ? window.bandready : undefined;
    if (!bridge?.showItemInFolder) {
      // Browser dev server: no file manager to open, so show the path to copy.
      setRevealed(path);
      return;
    }
    void bridge
      .showItemInFolder(path)
      .then((ok) => {
        if (!ok) setRevealed(path);
      })
      .catch((err: unknown) => {
        console.warn(`[BandReady] could not reveal the ${label}`, err);
        setRevealed(path);
      });
  };

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
          {appVersion && <Row label="App version" value={appVersion} />}
          {info && (
            <>
              <Row label="Sidecar version" value={info.version ?? "unknown"} />
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
              {typeof info.uptime_s === "number" && (
                <Row label="Sidecar uptime" value={formatUptime(info.uptime_s)} />
              )}
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

      {info?.data_dir && (
        <Card>
          <CardHeader>
            <CardTitle>Diagnostics</CardTitle>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Everything BandReady stores lives in one folder. Attaching{" "}
              <code className="font-mono text-foreground">sidecar.log</code> to a bug report
              is the single most useful thing you can do. API keys are redacted before
              they are written.
            </p>
          </CardHeader>
          <CardContent className="space-y-1">
            <Row label="Data folder" value={info.data_dir} mono />
            {info.logs_dir && <Row label="Logs" value={info.logs_dir} mono />}

            <div className="flex flex-wrap gap-2 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => reveal(info.data_dir, "data folder")}
              >
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Reveal data folder
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!info.log_file}
                onClick={() => reveal(info.log_file ?? info.logs_dir, "log file")}
              >
                <ScrollText className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Reveal logs
              </Button>
              <Button variant="outline" size="sm" onClick={() => open(`${REPO_URL}/issues/new`)}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Report a bug
              </Button>
            </div>

            {!info.log_file && (
              <p className="pt-1 text-xs text-muted-foreground">
                No log file has been written yet. One appears the first time the sidecar
                logs something after a restart.
              </p>
            )}
            {revealed && (
              <p className="pt-1 text-xs text-muted-foreground">
                Could not open a file manager from here. The path is{" "}
                <code className="select-all break-all font-mono text-foreground">
                  {revealed}
                </code>
                .
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
            reads and stray backups. It does not protect against someone who is already
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
