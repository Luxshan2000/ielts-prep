/**
 * Pre-call device check (12 §6.2 A). This screen is NOT skippable: Pipecat gotcha
 * G3 requires `initDevices()` before `connect()`, and the only way a learner can
 * tell their mic works before a timed test is a live level meter.
 */

import { useEffect } from "react";
import { Headphones, Mic, MicOff, RefreshCw, Settings } from "lucide-react";
import { Button, Card, CardContent, Field, Select, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { MicLevelMeter } from "./MicLevelMeter";
import { describeError, isMicPermissionError } from "./phases";
import { useMicCheck } from "./useMicCheck";

export interface PreCallCheckProps {
  micId: string | null;
  onMicChange: (id: string | null) => void;
  /** Called with `true` when a live capture is confirmed on the selected device. */
  onReadyChange?: (ready: boolean) => void;
  /** Rendered under the meter — the mode picker's start button lives there. */
  footer?: React.ReactNode;
}

export function PreCallCheck({
  micId,
  onMicChange,
  onReadyChange,
  footer,
}: PreCallCheckProps) {
  const mic = useMicCheck(micId);

  useEffect(() => {
    onReadyChange?.(mic.listening);
  }, [mic.listening, onReadyChange]);

  // Release the device when leaving the screen — Pipecat opens its own capture.
  useEffect(() => mic.close, [mic.close]);

  const options = mic.devices.map((d, i) => ({
    value: d.deviceId,
    label: d.label || `Microphone ${i + 1}`,
  }));

  const permissionDenied = isMicPermissionError(mic.error);

  return (
    <Card>
      <CardContent className="space-y-5 pt-5">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              mic.listening ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            {mic.listening ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Check your microphone</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              The examiner hears whatever this meter shows. Test it before the timer starts.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field
            label="Microphone"
            hint={
              mic.labelled
                ? undefined
                : "Device names appear after you allow microphone access once."
            }
          >
            <Select
              value={micId}
              onChange={(value) => {
                onMicChange(value);
                void mic.open(value);
              }}
              options={options}
              placeholder={options.length ? "System default" : "No microphone found"}
              aria-label="Microphone input device"
              disabled={options.length === 0}
            />
          </Field>
          <Button
            variant={mic.listening ? "outline" : "primary"}
            onClick={() => void mic.open(micId)}
          >
            {mic.listening ? (
              <>
                <RefreshCw className="h-4 w-4" />
                Re-test
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />
                Test microphone
              </>
            )}
          </Button>
        </div>

        <MicLevelMeter level={mic.level} active={mic.listening} />

        {mic.error !== null && (
          <div
            role="alert"
            className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/8 p-3"
          >
            <p className="text-[13px] text-destructive">{describeError(mic.error)}</p>
            <div className="flex flex-wrap gap-2">
              {permissionDenied && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void window.bandready?.openExternal?.(
                      "https://support.apple.com/guide/mac-help/control-access-to-your-microphone-mchla1b1e1fe/mac",
                    );
                  }}
                >
                  <Settings className="h-4 w-4" />
                  How to allow the microphone
                </Button>
              )}
              <Button size="sm" onClick={() => void mic.open(micId)}>
                Retry
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3">
          <Headphones className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground">Headphones recommended.</span> On open
            speakers the examiner's voice can be picked up by your microphone and transcribed as
            your own speech, which lowers your fluency metrics.
          </p>
        </div>

        {footer}
      </CardContent>
    </Card>
  );
}

/** Small inline spinner row used while a session is being created. */
export function StartingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <Spinner className="h-4 w-4" />
      {label}
    </div>
  );
}
