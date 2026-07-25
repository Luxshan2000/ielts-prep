import { useEffect, useState } from "react";
import { Check, Copy, Download, Mic, ShieldAlert } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, useConfirm } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface SystemInfo {
  version?: string;
  data_dir?: string;
  platform?: { os?: string; arch?: string };
}

interface ExportResult {
  path?: string;
  job_id?: string;
}

interface WipeResult {
  removed?: number;
  freed_mb?: number;
}

function describe(err: unknown, missing: string, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 404 || err.status === 405) return missing;
    if (err.isOffline) return "The BandReady sidecar is not responding.";
    return err.detail || fallback;
  }
  return fallback;
}

export function DataTab() {
  const confirm = useConfirm();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const [wiping, setWiping] = useState(false);
  const [wipeMsg, setWipeMsg] = useState<string | null>(null);
  const [wipeErr, setWipeErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<SystemInfo>("/api/v1/system/info")
      .then((res) => {
        if (active) setInfo(res);
      })
      .catch((err: unknown) => {
        if (active) setInfoError(describe(err, "unavailable", "could not read the data folder"));
      });
    return () => {
      active = false;
    };
  }, []);

  const copyPath = async () => {
    if (!info?.data_dir) return;
    try {
      await navigator.clipboard.writeText(info.data_dir);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the path is on screen anyway */
    }
  };

  const runExport = async () => {
    setExporting(true);
    setExportErr(null);
    setExportMsg(null);
    try {
      const res = await api.post<ExportResult>("/api/v1/data/export", {});
      let path = res?.path;
      if (!path && res?.job_id) {
        const done = await api.pollJob<{ path?: string }>(res.job_id);
        path = done?.path;
      }
      setExportMsg(path ? `Exported to ${path}` : "Export finished.");
    } catch (err) {
      setExportErr(
        describe(
          err,
          "Export is not available in this sidecar build yet — your data already lives in the folder above.",
          "the export failed",
        ),
      );
    } finally {
      setExporting(false);
    }
  };

  const runWipe = async () => {
    const ok = await confirm({
      title: "Delete every practice recording?",
      message:
        "Your transcripts, band scores and feedback are kept — only the audio files of your own voice are deleted. This cannot be undone.",
      confirmLabel: "Delete recordings",
      destructive: true,
    });
    if (!ok) return;

    setWiping(true);
    setWipeErr(null);
    setWipeMsg(null);
    try {
      const res = await api.post<WipeResult | { job_id: string }>(
        "/api/v1/data/wipe-recordings",
        {},
      );
      let result = res as WipeResult;
      if ((res as { job_id?: string })?.job_id) {
        result = await api.pollJob<WipeResult>((res as { job_id: string }).job_id);
      }
      const count = result?.removed;
      setWipeMsg(
        typeof count === "number"
          ? `Deleted ${count} recording${count === 1 ? "" : "s"}${
              result?.freed_mb ? ` (${result.freed_mb} MB freed)` : ""
            }.`
          : "Recordings deleted.",
      );
    } catch (err) {
      setWipeErr(
        describe(
          err,
          "Wiping recordings is not available in this sidecar build yet.",
          "could not delete the recordings",
        ),
      );
    } finally {
      setWiping(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Data folder</CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Everything BandReady knows about you — the SQLite database, your recordings and
            downloaded model weights — lives here. Nothing is sent anywhere else.
          </p>
        </CardHeader>
        <CardContent>
          {info?.data_dir ? (
            <div className="flex items-center gap-2">
              <code className="scrollbar-thin flex h-9 flex-1 items-center overflow-x-auto whitespace-nowrap rounded-lg border border-input bg-muted/40 px-3 font-mono text-[13px] text-foreground">
                {info.data_dir}
              </code>
              <Button variant="outline" size="sm" onClick={() => void copyPath()}>
                {copied ? (
                  <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                )}
                {copied ? "Copied" : "Copy path"}
              </Button>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              {infoError ?? "Reading the data folder…"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export everything</CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Writes a self-contained zip — every table as JSONL plus all your recordings — into
            the exports folder. Yours to keep, move or delete.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" loading={exporting} onClick={() => void runExport()}>
            <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Export my data
          </Button>
          {exportMsg && <p className="text-[13px] text-success">{exportMsg}</p>}
          {exportErr && <p className="text-[13px] text-muted-foreground">{exportErr}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive" aria-hidden="true" />
            Wipe recordings
          </CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Deletes the audio of your speaking turns and pronunciation attempts. Transcripts,
            scores and progress history are untouched.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="destructive" loading={wiping} onClick={() => void runWipe()}>
            <Mic className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Delete all recordings
          </Button>
          {wipeMsg && <p className="text-[13px] text-success">{wipeMsg}</p>}
          {wipeErr && <p className="text-[13px] text-muted-foreground">{wipeErr}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
