import { CheckCircle2, Download, HardDrive, RotateCw, X } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Progress } from "@/components/ui";
import { useSettingsFeatureStore, type ArtifactState } from "../store";

function sizeLabel(mb: number | null | undefined): string | null {
  if (!mb) return null;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

function partialLabel(artifact: ArtifactState): string | null {
  const partial = (artifact.files ?? []).reduce((sum, f) => sum + (f.partial_bytes ?? 0), 0);
  if (partial <= 0) return null;
  return `${(partial / 1024 / 1024).toFixed(0)} MB already downloaded`;
}

/**
 * Model weights manager (13 §7.3). The artifact list and its on-disk state come
 * from the sidecar's shipped manifest; byte progress arrives through the standard
 * job object (18 §3), so cancel + resume are just job operations.
 */
export function ModelDownloads() {
  const artifacts = useSettingsFeatureStore((s) => s.artifacts);
  const downloads = useSettingsFeatureStore((s) => s.downloads);
  const modelsError = useSettingsFeatureStore((s) => s.modelsError);
  const startDownload = useSettingsFeatureStore((s) => s.startDownload);
  const cancelDownload = useSettingsFeatureStore((s) => s.cancelDownload);
  const loadModels = useSettingsFeatureStore((s) => s.loadModels);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Model weights</CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Downloaded once into your data folder and checksum-verified. An interrupted
            download resumes from where it stopped.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void loadModels()}>
          <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </Button>
      </CardHeader>

      <CardContent className="space-y-2">
        {modelsError && (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">
            {modelsError}
          </p>
        )}

        {!modelsError && artifacts.length === 0 && (
          <p className="py-2 text-[13px] text-muted-foreground">
            No downloadable model weights are listed in this build.
          </p>
        )}

        {artifacts.map((artifact) => {
          const job = downloads[artifact.artifact_id];
          const installed = artifact.state === "installed" || job?.state === "done";
          const busy = job?.state === "queued" || job?.state === "running";
          const resumable =
            !installed &&
            (artifact.state === "partial" || job?.state === "cancelled" || job?.state === "error");
          const size = sizeLabel(artifact.approx_mb);

          return (
            <div key={artifact.artifact_id} className="rounded-lg border border-border px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-medium text-foreground">{artifact.label}</span>
                {artifact.kind && (
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {artifact.kind}
                  </span>
                )}
                {size && <span className="tabular text-xs text-muted-foreground">{size}</span>}
                {installed ? (
                  <Badge tone="success">
                    <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
                    Installed
                  </Badge>
                ) : resumable ? (
                  <Badge tone="warning">Incomplete</Badge>
                ) : null}
                <span className="ml-auto flex items-center gap-2">
                  {busy && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void cancelDownload(artifact.artifact_id)}
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      Cancel
                    </Button>
                  )}
                  {!busy && !installed && (
                    <Button
                      size="sm"
                      variant={resumable ? "secondary" : "outline"}
                      onClick={() => void startDownload(artifact.artifact_id)}
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      {resumable ? "Resume" : "Download"}
                    </Button>
                  )}
                </span>
              </div>

              {!busy && resumable && partialLabel(artifact) && (
                <p className="mt-1.5 text-xs text-muted-foreground">{partialLabel(artifact)}</p>
              )}

              {busy && (
                <Progress
                  className="mt-2"
                  value={job?.pct ?? null}
                  detail={job?.detail ?? "downloading…"}
                />
              )}
              {job?.state === "cancelled" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Cancelled — the partial file was kept, Resume picks it back up.
                </p>
              )}
              {job?.state === "error" && job.error && (
                <p className="mt-2 text-xs text-destructive">{job.error}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
