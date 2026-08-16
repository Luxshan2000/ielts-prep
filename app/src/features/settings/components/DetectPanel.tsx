import { useState } from "react";
import { Check, Copy, Cpu, Download, ExternalLink, RefreshCw, Terminal, Wand2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
  Spinner,
} from "@/components/ui";
import { openExternal } from "@/lib/openExternal";
import { useSettingsFeatureStore, type DetectEngine, type SetupFlow } from "../store";

const ENGINE_LABELS: Record<string, string> = {
  ollama: "Ollama",
  lm_studio: "LM Studio",
  mlx_lm: "MLX (mlx-lm server)",
  llama_cpp: "llama.cpp",
  kokoro: "Kokoro (local TTS)",
  faster_whisper: "Local Whisper",
  mlx_whisper: "MLX Whisper",
};

const STATE_COPY: Record<string, { label: string; tone: "success" | "warning" | "default" }> = {
  running: { label: "Running", tone: "success" },
  ready: { label: "Ready", tone: "success" },
  installed: { label: "Installed, not running", tone: "warning" },
  needs_download: { label: "Needs download", tone: "warning" },
  unknown_server: { label: "Unidentified server", tone: "warning" },
  absent: { label: "Not found", tone: "default" },
};

function engineLabel(engine: DetectEngine): string {
  return ENGINE_LABELS[engine.id] ?? engine.id;
}

/**
 * A step BandReady will not run for you (installers, GUI apps, piped shell
 * scripts). We show the exact command and a copy button — never execute it.
 */
function ManualSetup({ flow }: { flow: SetupFlow }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!flow.copy) return;
    try {
      await navigator.clipboard.writeText(flow.copy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the command is on screen */
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
      {flow.reason && <p className="text-[13px] font-medium text-foreground">{flow.reason}</p>}
      {flow.instructions && (
        <p className="text-xs text-muted-foreground">{flow.instructions}</p>
      )}
      {flow.copy && (
        <div className="flex items-center gap-2">
          <code className="scrollbar-thin flex h-8 flex-1 items-center overflow-x-auto whitespace-nowrap rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground">
            {flow.copy}
          </code>
          <Button size="sm" variant="ghost" onClick={() => void copy()}>
            {copied ? (
              <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
      {flow.url && (
        <Button size="sm" variant="outline" onClick={() => openExternal(flow.url as string)}>
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Open the download page
        </Button>
      )}
    </div>
  );
}

export function DetectPanel() {
  const report = useSettingsFeatureStore((s) => s.detectReport);
  const detecting = useSettingsFeatureStore((s) => s.detecting);
  const detectError = useSettingsFeatureStore((s) => s.detectError);
  const runDetect = useSettingsFeatureStore((s) => s.runDetect);
  const runSetup = useSettingsFeatureStore((s) => s.runSetup);
  const setupJobs = useSettingsFeatureStore((s) => s.setupJobs);
  const useDetectedEngine = useSettingsFeatureStore((s) => s.useDetectedEngine);
  const manualSetup = useSettingsFeatureStore((s) => s.manualSetup);
  const presets = useSettingsFeatureStore((s) => s.presets);

  const platform = report?.platform;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Local engines</CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {platform
              ? `${platform.os ?? "?"} · ${platform.arch ?? "?"}${
                  platform.ram_gb ? ` · ${platform.ram_gb} GB RAM` : ""
                }${platform.apple_silicon ? " · Apple Silicon" : ""}`
              : "Probes 127.0.0.1 and your PATH. Nothing leaves this machine."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          loading={detecting}
          onClick={() => void runDetect(true)}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Detect
        </Button>
      </CardHeader>

      <CardContent className="space-y-2">
        {detectError && (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">
            {detectError}
          </p>
        )}

        {!report && detecting && (
          <div className="flex items-center gap-2 py-4 text-[13px] text-muted-foreground">
            <Spinner />
            Probing local ports and binaries…
          </div>
        )}

        {!report && !detecting && !detectError && (
          <p className="py-2 text-[13px] text-muted-foreground">
            Run detection to find Ollama, LM Studio or mlx-lm on this machine.
          </p>
        )}

        {report?.engines.map((engine) => {
          const copy = STATE_COPY[engine.state] ?? { label: engine.state, tone: "default" as const };
          const job = setupJobs[engine.id];
          const canUse =
            (engine.state === "running" || engine.state === "ready") &&
            presets.some((p) => p.id === engine.id);
          const flow = report.setup?.[engine.id];
          const canSetUp =
            (flow ? flow.kind !== "none" : true) &&
            (engine.state === "installed" ||
              engine.state === "absent" ||
              engine.state === "needs_download");
          const busy = job?.state === "queued" || job?.state === "running";
          const manual = manualSetup[engine.id];

          return (
            <div
              key={engine.id}
              className="rounded-lg border border-border px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Cpu className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-medium text-foreground">{engineLabel(engine)}</span>
                <Badge tone={copy.tone}>{copy.label}</Badge>
                {engine.via && (
                  <span className="text-xs text-muted-foreground">{engine.via}</span>
                )}
                {typeof engine.download_mb === "number" && engine.download_mb > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ~{engine.download_mb} MB
                  </span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  {canUse && (
                    <Button size="sm" variant="secondary" onClick={() => useDetectedEngine(engine)}>
                      Use this
                    </Button>
                  )}
                  {canSetUp && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busy}
                      disabled={busy}
                      onClick={() => void runSetup(engine.id)}
                    >
                      {engine.state === "needs_download" ? (
                        <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Wand2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {engine.state === "needs_download" ? "Download" : "Set up"}
                    </Button>
                  )}
                </span>
              </div>

              {engine.models && engine.models.length > 0 && (
                <p className="mt-1.5 truncate text-xs text-muted-foreground">
                  {engine.models.slice(0, 4).join(", ")}
                  {engine.models.length > 4 ? ` +${engine.models.length - 4} more` : ""}
                </p>
              )}
              {engine.detail && (
                <p className="mt-1.5 text-xs text-muted-foreground">{engine.detail}</p>
              )}

              {flow?.kind === "command" && flow.command && !busy && (
                <p className="mt-1.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
                  {flow.command}
                </p>
              )}

              {manual && <ManualSetup flow={manual} />}

              {job && busy && (
                <Progress
                  className="mt-2"
                  value={job.pct}
                  detail={job.detail ?? "working…"}
                />
              )}
              {job?.state === "error" && job.error && (
                <p className="mt-2 text-xs text-destructive">{job.error}</p>
              )}
              {job?.state === "done" && (
                <p className="mt-2 text-xs text-success">Setup finished.</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
