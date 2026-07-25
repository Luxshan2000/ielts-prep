import { Info } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { cn } from "@/lib/cn";
import { Slider } from "./Slider";
import { MIN_VOLUME_CAP, useSettingsFeatureStore, type VadDraft } from "../store";

interface Responsiveness {
  id: string;
  label: string;
  description: string;
  vad: Pick<VadDraft, "confidence" | "start_secs" | "stop_secs">;
}

/**
 * Turn-taking presets. `stop_secs` also drives the examiner's
 * SpeechTimeoutUserTurnStopStrategy, so the two stay in lockstep (02, 03 §2.3).
 */
const RESPONSIVENESS: Responsiveness[] = [
  {
    id: "snappy",
    label: "Snappy",
    description: "The examiner jumps in fast. Good for quick Q&A drills.",
    vad: { confidence: 0.45, start_secs: 0.12, stop_secs: 0.35 },
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "The default — natural conversational turn-taking.",
    vad: { confidence: 0.5, start_secs: 0.2, stop_secs: 0.6 },
  },
  {
    id: "patient",
    label: "Patient (exam-like)",
    description: "Leaves room to think mid-answer. Best for Part 2 long turns.",
    vad: { confidence: 0.55, start_secs: 0.25, stop_secs: 1.2 },
  },
];

function matchPreset(vad: VadDraft): string | null {
  const hit = RESPONSIVENESS.find(
    (p) =>
      Math.abs(p.vad.confidence - vad.confidence) < 0.001 &&
      Math.abs(p.vad.start_secs - vad.start_secs) < 0.001 &&
      Math.abs(p.vad.stop_secs - vad.stop_secs) < 0.001,
  );
  return hit?.id ?? null;
}

export function VoiceTab() {
  const vad = useSettingsFeatureStore((s) => s.drafts.vad);
  const setVad = useSettingsFeatureStore((s) => s.setVad);
  const active = matchPreset(vad);

  const applyPreset = (preset: Responsiveness) => {
    setVad("confidence", preset.vad.confidence);
    setVad("start_secs", preset.vad.start_secs);
    setVad("stop_secs", preset.vad.stop_secs);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Turn-taking</CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            How quickly the examiner decides you have finished speaking.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {RESPONSIVENESS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active === preset.id}
                onClick={() => applyPreset(preset)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active === preset.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-accent",
                )}
              >
                <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                  {preset.label}
                  {active === preset.id && <Badge tone="primary">Active</Badge>}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {preset.description}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-5 border-t border-border pt-4 sm:grid-cols-2">
            <Slider
              label="Sensitivity (confidence)"
              value={vad.confidence}
              min={0.1}
              max={0.9}
              step={0.05}
              hint="Higher needs a clearer voice signal before it counts as speech."
              onChange={(v) => setVad("confidence", v)}
            />
            <Slider
              label="Pause before the examiner replies"
              value={vad.stop_secs}
              min={0.2}
              max={3}
              step={0.05}
              unit="s"
              hint="Also how long a mid-answer silence may run before your turn ends."
              onChange={(v) => setVad("stop_secs", v)}
            />
            <Slider
              label="Speech start delay"
              value={vad.start_secs}
              min={0.05}
              max={1}
              step={0.05}
              unit="s"
              hint="How much continuous sound is needed before it counts as you starting."
              onChange={(v) => setVad("start_secs", v)}
            />
            <Slider
              label="Minimum volume gate"
              value={vad.min_volume}
              min={0}
              max={MIN_VOLUME_CAP}
              step={0.05}
              onChange={(v) => setVad("min_volume", Math.min(v, MIN_VOLUME_CAP))}
              warning={
                vad.min_volume > 0.3
                  ? "Above ~0.3 quiet speakers start getting cut off. Leave it at 0 unless you have constant background noise."
                  : undefined
              }
              hint="Leave at 0 unless a fan or street noise keeps triggering the examiner."
            />
          </div>

          <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              The volume gate is capped at {MIN_VOLUME_CAP.toFixed(1)} on purpose. The voice
              library's own default sits at that value and it silently blocks normal
              conversational speech — the microphone looks dead. BandReady clamps it both
              here and in the sidecar.
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
