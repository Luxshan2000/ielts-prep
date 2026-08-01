import { Check, CircleAlert, Cpu, Cloud, Loader2 } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useSettingsFeatureStore, type Modality, type RecommendedEntry } from "../store";
import { ProviderSlotCard } from "./ProviderSlotCard";

/**
 * Settings for somebody who is here to practise English, not to configure an inference stack.
 *
 * The Providers tab shows, on one screen: seven local engines, three provider slots with
 * base-URL fields, five downloadable weights, and copy like "faster-whisper, int8 on CPU",
 * "82M ONNX voice model" and `mlx-community/Qwen3-14B-4bit`. All of it is true and none of it
 * means anything to the learner this app is for — and it is the first screen they hit when
 * something is not working.
 *
 * So the default view answers one question — *where should the thinking happen?* — and says,
 * in plain words, which of the three jobs is currently working. Everything else moves behind
 * "Advanced settings", unchanged, for the people who want it.
 */

const JOBS: { modality: Modality; label: string; what: string }[] = [
  { modality: "llm", label: "The examiner", what: "asks you questions and marks your answers" },
  { modality: "stt", label: "Hearing you", what: "turns what you say into text" },
  { modality: "tts", label: "The voice", what: "reads questions and listening audio aloud" },
];

export function SimpleSetup({ onAdvanced }: { onAdvanced: () => void }) {
  const drafts = useSettingsFeatureStore((s) => s.drafts);
  const recommended = useSettingsFeatureStore((s) => s.recommended);
  const presetById = useSettingsFeatureStore((s) => s.presetById);
  const applyPreset = useSettingsFeatureStore((s) => s.applyPreset);
  const setField = useSettingsFeatureStore((s) => s.setField);
  const verifyState = useSettingsFeatureStore((s) => s.verify);
  const verifying = useSettingsFeatureStore((s) => s.verifying);
  const runVerify = useSettingsFeatureStore((s) => s.runVerify);

  const apply = (entry: RecommendedEntry) => {
    const preset = entry.preset ? presetById(entry.preset) : undefined;
    if (preset) applyPreset(entry.modality, preset);
    if (entry.preset_only) {
      const first = preset?.suggested_models?.[0];
      if (first) setField(entry.modality, "model", first);
      return;
    }
    setField(entry.modality, entry.modality === "tts" ? "voice" : "model", entry.model);
  };

  /** Everything the recommendation table suggests for one route, applied in one click. */
  const useRoute = (wantsCloud: boolean) => {
    for (const entry of recommended ?? []) {
      const isCloud = Boolean(entry.preset_only);
      // Audio always stays local: recordings of the learner's voice never need to leave the
      // machine, and the cloud route is only ever about scoring quality.
      if (entry.modality !== "llm") {
        if (!isCloud) apply(entry);
      } else if (isCloud === wantsCloud) {
        apply(entry);
      }
    }
  };

  const cloudEntry = (recommended ?? []).find((e) => e.modality === "llm" && e.preset_only);
  // A slot draft is Record<string, unknown> and each preset names its own fields, so the
  // route in use is read from where the endpoint points rather than from a guessed key.
  const baseUrl = String(drafts.llm?.base_url ?? "");
  const usingCloud = baseUrl !== "" && !/(localhost|127\.0\.0\.1|\[::1\])/.test(baseUrl);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Where should the thinking happen?</CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Your recordings never leave this machine either way. This only decides what marks
            your answers.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <RouteCard
            icon={Cpu}
            title="On this computer"
            selected={!usingCloud}
            points={[
              "Free, and works with no internet",
              "Nothing ever leaves the machine",
              "Marking is a little less consistent",
            ]}
            action={
              <Button variant={usingCloud ? "outline" : "primary"} onClick={() => useRoute(false)}>
                Use my computer
              </Button>
            }
          />
          <RouteCard
            icon={Cloud}
            title="Use an online service"
            selected={usingCloud}
            points={[
              "The most consistent band scores",
              "Needs an internet connection and a key",
              "Your voice recordings still stay local",
            ]}
            action={
              cloudEntry ? (
                <Button
                  variant={usingCloud ? "primary" : "outline"}
                  onClick={() => useRoute(true)}
                >
                  Use an online service
                </Button>
              ) : null
            }
          />
        </CardContent>
      </Card>

      {/* The key field is spec-driven per preset, so the slot card owns it rather than
          this screen guessing a field name. */}
      {usingCloud && <ProviderSlotCard modality="llm" />}

      <Card>
        <CardHeader>
          <CardTitle>Is everything working?</CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Three jobs have to work for a full practice session.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {JOBS.map((job) => {
            const ok = verifyState?.[job.modality]?.ok === true;
            const busy = verifying === job.modality;
            return (
              <div
                key={job.modality}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    ok ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : ok ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <CircleAlert className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium">{job.label}</span>
                  <span className="block text-[13px] text-muted-foreground">{job.what}</span>
                </span>
                {ok ? (
                  <Badge tone="success">Working</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void runVerify(job.modality)}
                  >
                    {busy ? "Checking…" : "Check"}
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button variant="ghost" size="sm" onClick={onAdvanced}>
          Advanced settings
        </Button>
      </div>
    </div>
  );
}

function RouteCard({
  icon: Icon,
  title,
  points,
  action,
  selected,
}: {
  icon: typeof Cpu;
  title: string;
  points: string[];
  action: React.ReactNode;
  selected: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3",
        selected ? "border-primary/50 bg-primary/5" : "border-border",
      )}
    >
      <p className="flex items-center gap-2 text-[14px] font-semibold">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        {title}
        {selected && <Badge tone="primary">In use</Badge>}
      </p>
      <ul className="space-y-1 text-[13px] text-muted-foreground">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <div className="mt-auto pt-1">{action}</div>
    </div>
  );
}
