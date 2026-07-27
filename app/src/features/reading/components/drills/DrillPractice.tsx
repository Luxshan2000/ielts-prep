import { useState } from "react";
import { DrillLauncher } from "./DrillLauncher";
import { DrillRunner } from "./DrillRunner";
import type { RunnerParams } from "./api";

export interface DrillPracticeProps {
  /** Restrict the whole surface to one module's content. */
  format?: "academic" | "general_training" | null;
}

/**
 * The reading drill surface, whole: pick a drill, run it, read the report, pick the next.
 *
 * The state here is a single nullable `RunnerParams`, and the runner is keyed on a
 * monotonic counter so that "another set" genuinely rebuilds — a new seed, new items —
 * rather than re-rendering the finished one. Everything else (the set, the answers, the
 * marks) lives inside the runner for exactly as long as the set does, because a drill has
 * no state worth surviving a reload: it is three minutes long and the result is already
 * recorded server-side the moment it finishes.
 */
export function DrillPractice({ format }: DrillPracticeProps) {
  const [running, setRunning] = useState<RunnerParams | null>(null);
  const [generation, setGeneration] = useState(0);

  if (!running) {
    return (
      <DrillLauncher
        format={format}
        onStart={(params) => {
          setGeneration((n) => n + 1);
          setRunning(params);
        }}
      />
    );
  }

  return (
    <DrillRunner
      key={generation}
      params={running}
      onExit={() => setRunning(null)}
      onRestart={(next) => {
        setGeneration((n) => n + 1);
        setRunning(next);
      }}
    />
  );
}
