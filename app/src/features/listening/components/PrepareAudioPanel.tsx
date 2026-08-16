import { AlertTriangle, CheckCircle2, Wand2 } from "lucide-react";
import { Button, Progress } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useListeningStore } from "../store";

export interface PrepareAudioPanelProps {
  /** Test id, or the script id when `kind` is "script". */
  targetId: string;
  kind: "test" | "script";
  /** Only for scripts: re-render the same script in another accent (07 §8). */
  accentSet?: string | null;
  ready: boolean;
  /** Parts already in the media cache, for the "2 of 4 ready" line. */
  readyParts?: number;
  totalParts?: number;
  onDone?: () => void;
  className?: string;
}

/**
 * First-run reality (07 §3): a test's audio is synthesized locally by Kokoro the
 * first time it is used — 30–90 s for four parts — and cached forever after. The
 * copy says exactly that, and the bar shows the real `listening_render` job.
 */
export function PrepareAudioPanel({
  targetId,
  kind,
  accentSet = null,
  ready,
  readyParts,
  totalParts,
  onDone,
  className,
}: PrepareAudioPanelProps) {
  const key = kind === "test" ? targetId : `script:${targetId}:${accentSet ?? "default"}`;
  const state = useListeningStore((s) => s.prepare[key]);
  const prepareTest = useListeningStore((s) => s.prepareTest);
  const prepareScript = useListeningStore((s) => s.prepareScript);
  const cancelPrepare = useListeningStore((s) => s.cancelPrepare);

  const running = Boolean(state?.running);
  const error = state?.error ?? null;

  const run = async () => {
    const ok =
      kind === "test"
        ? await prepareTest(targetId)
        : Boolean(await prepareScript(targetId, accentSet));
    if (ok) onDone?.();
  };

  if (ready && !running) {
    return (
      <p className={cn("flex items-center gap-1.5 text-[12px] text-success", className)}>
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Audio ready
      </p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {running ? (
        <>
          <Progress
            value={state?.pct ?? null}
            label="Generating the audio on this machine"
            detail={state?.detail || "working…"}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => void cancelPrepare(key)}>
              Cancel
            </Button>
            <span className="text-[12px] text-muted-foreground">
              This happens once per test. The audio is cached afterwards.
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void run()}>
              <Wand2 className="h-4 w-4" />
              Prepare audio
            </Button>
            <span className="text-[12px] text-muted-foreground">
              {typeof readyParts === "number" && typeof totalParts === "number" && readyParts > 0
                ? `${readyParts} of ${totalParts} parts are ready. `
                : ""}
              The voices are synthesized locally the first time, then cached. Expect
              {kind === "test" ? " 30 to 90 seconds" : " 10 to 25 seconds"}.
            </span>
          </div>
          {error && (
            <p
              role="alert"
              className="flex items-start gap-1.5 text-[12px] font-medium text-destructive"
            >
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
