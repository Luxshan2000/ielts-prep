import { useEffect, useState } from "react";
import { Check, Copy, Download, Mic, ShieldAlert, Speaker } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, useConfirm } from "@/components/ui";
import { dropGeneratedAudioCaches } from "@/features/listening/audioCaches";
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

interface GeneratedAudioSurvey {
  files?: number;
  freed_mb?: number;
  by_kind?: Record<string, number>;
  kept_recordings?: number;
}

interface GeneratedAudioResult extends WipeResult {
  kept_recordings?: number;
}

/**
 * The confirmation body, and it is the whole safety mechanism (11 §9 rule 1).
 *
 * Both halves are spelled out because "delete generated audio" and "delete recordings"
 * sound alike and live one card apart, and only one of them is reversible by pressing a
 * button again. The counts come from the dry run, so the sentence describes this
 * install rather than the feature in general.
 */
function PurgeMessage({ survey }: { survey: GeneratedAudioSurvey | null }) {
  const files = survey?.files ?? 0;
  const size = survey?.freed_mb ? ` (${survey.freed_mb} MB)` : "";
  const kept = survey?.kept_recordings ?? 0;
  return (
    <div className="space-y-2">
      <p>
        {files > 0
          ? `${files} generated audio file${files === 1 ? "" : "s"}${size} will be deleted.`
          : "There is no generated audio to delete right now."}
      </p>
      <p>
        <span className="font-medium text-foreground">Goes:</span> rendered listening audio
        for tests, parts, mock sittings and accent re-voicings; cached text-to-speech
        lines; pronunciation reference clips; vocabulary audio.
      </p>
      <p>
        <span className="font-medium text-foreground">Stays:</span> every recording of your
        own voice, your transcripts, band scores, progress and generated scripts.{" "}
        {kept > 0
          ? `Your ${kept} recording${kept === 1 ? "" : "s"} are not touched.`
          : "Your own recordings are not touched."}
      </p>
      <p>Anything you open again is generated fresh with the providers selected now.</p>
    </div>
  );
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

  const [survey, setSurvey] = useState<GeneratedAudioSurvey | null>(null);
  const [purging, setPurging] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);
  const [purgeErr, setPurgeErr] = useState<string | null>(null);

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
          "Export is not available in this sidecar build yet. Your data already lives in the folder above.",
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
        "Your transcripts, band scores and feedback are kept. Only the audio files of your own voice are deleted, and this cannot be undone.",
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

  const runPurge = async () => {
    // The dry run first, so the dialog can name a number instead of a category. It is
    // allowed to fail: a purge with a vaguer sentence is better than no purge at all,
    // and the sentence still says exactly what goes and what stays.
    let counts: GeneratedAudioSurvey | null = null;
    setPurgeErr(null);
    setPurgeMsg(null);
    try {
      counts = await api.get<GeneratedAudioSurvey>("/api/v1/data/generated-audio");
      setSurvey(counts);
    } catch {
      /* fall through to the generic wording */
    }

    const ok = await confirm({
      title: "Delete all generated audio?",
      message: <PurgeMessage survey={counts} />,
      confirmLabel: "Delete generated audio",
      destructive: true,
    });
    if (!ok) return;

    setPurging(true);
    try {
      const res = await api.post<GeneratedAudioResult>(
        "/api/v1/data/wipe-generated-audio",
        {},
      );
      const count = res?.removed ?? 0;
      const freed = res?.freed_mb ? ` (${res.freed_mb} MB freed)` : "";
      setPurgeMsg(
        `Deleted ${count} generated audio file${count === 1 ? "" : "s"}${freed}. ` +
          "Your recordings were not touched.",
      );
      setSurvey({ files: 0, freed_mb: 0, kept_recordings: res?.kept_recordings });
      // The library still believes those renders exist — it has to re-ask before it can
      // offer to prepare them again.
      await dropGeneratedAudioCaches();
    } catch (err) {
      setPurgeErr(
        describe(
          err,
          "Clearing generated audio is not available in this sidecar build yet.",
          "could not delete the generated audio",
        ),
      );
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Data folder</CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Everything BandReady knows about you lives here: the SQLite database, your
            recordings and any downloaded model weights. Nothing is sent anywhere else.
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
            Writes a self-contained zip into the exports folder, with every table as JSONL
            plus all your recordings. Yours to keep, move or delete.
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

      {/*
        A separate card, a separate confirmation and a separate endpoint from "Wipe
        recordings" above — deliberately, and it must stay that way. That card deletes
        the learner's own voice; this one deletes only what a text-to-speech engine
        produced. One button meaning either of those depending on wording is exactly the
        mistake that loses somebody's practice.
      */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive" aria-hidden="true" />
            Clear generated audio
          </CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Deletes every audio file BandReady generated for you — listening renders,
            cached speech lines, pronunciation reference clips and vocabulary audio — so
            the next time you open them they are made again with the providers you have
            selected now. Your own recordings are not touched.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="destructive" loading={purging} onClick={() => void runPurge()}>
            <Speaker className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Delete generated audio
          </Button>
          {survey && typeof survey.files === "number" && (
            <p className="text-[13px] text-muted-foreground">
              {survey.files > 0
                ? `${survey.files} file${survey.files === 1 ? "" : "s"} on disk${
                    survey.freed_mb ? `, ${survey.freed_mb} MB` : ""
                  }.`
                : "No generated audio on disk."}
            </p>
          )}
          {purgeMsg && <p className="text-[13px] text-success">{purgeMsg}</p>}
          {purgeErr && <p className="text-[13px] text-muted-foreground">{purgeErr}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
