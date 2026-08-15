import { useState } from "react";
import { PageShell } from "@/components/shell/PageShell";
import { DrillLauncher } from "./DrillLauncher";
import { DrillRunner } from "./DrillRunner";
import type { RunnerParams } from "./api";

export interface ListeningDrillsProps {
  /** Pin the whole surface to one recording — what a review screen passes. */
  scriptId?: string | null;
}

/**
 * The listening drill surface, whole: pick a drill, run it, read the report, pick the next.
 *
 * The state here is a single nullable `RunnerParams`, and the runner is keyed on a monotonic
 * counter so that "another set" genuinely rebuilds — a new seed, new clips — rather than
 * re-rendering the finished one. Everything else lives inside the runner for exactly as long
 * as the set does, because a drill has no state worth surviving a reload: it is three minutes
 * long and the result is already recorded server-side the moment it finishes.
 */
export function ListeningDrills({ scriptId }: ListeningDrillsProps) {
  const [running, setRunning] = useState<RunnerParams | null>(null);
  const [generation, setGeneration] = useState(0);

  // The route rendered this bare: no title, no description, and — in Electron, with no
  // browser back button — no way out but the sidebar. The shell is the same one the
  // reading drills use, so both drill rooms open and close the same way.
  return (
    <PageShell
      title="Listening drills"
      description="Short reps on one thing at a time, built from the recordings already in your content pack. Drills are marked, but they never produce a band."
      back={{ to: "/listening", label: "Listening" }}
    >
      {running ? (
        <DrillRunner
          key={generation}
          params={running}
          onExit={() => setRunning(null)}
          onRestart={(next) => {
            setGeneration((n) => n + 1);
            setRunning(next);
          }}
        />
      ) : (
        <DrillLauncher
          scriptId={scriptId}
          onStart={(params) => {
            setGeneration((n) => n + 1);
            setRunning(params);
          }}
        />
      )}
    </PageShell>
  );
}
