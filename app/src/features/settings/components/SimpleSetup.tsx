import { Check, CircleAlert, Cpu, Cloud, Loader2 } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useSettingsFeatureStore, type Modality, type RecommendedEntry } from "../store";
import { CloudKeyCard } from "./CloudKeyCard";

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

/**
 * `without` is what still works when this job does not — and it is the honest answer, not a
 * softening. Somebody with no key can still do every reading and listening paper, every
 * grammar and vocabulary drill, and every sound-pair exercise in the app; only marking stops.
 * The card used to say "three jobs have to work for a full practice session" above a red
 * cross, which reads as *the app is broken* to somebody for whom nearly all of it works.
 */
const JOBS: { modality: Modality; label: string; what: string; without: string }[] = [
  {
    modality: "llm",
    label: "The examiner",
    what: "asks you questions and marks your answers",
    without: "Without it: reading, listening, grammar and vocabulary practice all still work — but nothing can be marked and no band can be estimated.",
  },
  {
    modality: "stt",
    label: "Hearing you",
    what: "turns what you say into text",
    without: "Without it: you can type your answers everywhere you would otherwise speak.",
  },
  {
    modality: "tts",
    label: "The voice",
    what: "reads questions and listening audio aloud",
    without: "Without it: your computer's own voice is used instead, which is fine for single words but not for listening papers.",
  },
];

/**
 * What to tell the learner when a check comes back unhappy.
 *
 * The row used to have two states — "Working" or a bare Check button — so a failed check
 * looked exactly like a check nobody had run yet: the button was pressed, the request went
 * out, and the screen said nothing. Every sentence here ends in something to do next.
 */
function failureSentence(result: { state?: string; detail?: string } | undefined): string | null {
  if (result === undefined) return null;
  switch (result.state) {
    case "unreachable":
      return "Not answering. If it runs on this computer, start it first, then check again.";
    case "timeout":
      return "It took too long to reply — it may still be starting up. Wait a moment and check again.";
    case "unauthorized":
      return "The key was rejected. Open Advanced settings and paste it again.";
    case "no_key":
      // The single commonest failure, and until now the one that said nothing at all: the
      // check threw instead of answering, so the row fell back to looking un-run.
      return "No usable key. Paste your key above, then check again.";
    case "unconfigured":
      return "Nothing is set up for this yet. Choose where the thinking should happen above.";
    case "no_model":
      return "It replied, but no usable model is chosen. Pick one in Advanced settings.";
    default:
      return "It could not be reached. Try again, or open Advanced settings to change it.";
  }
}

export function SimpleSetup({ onAdvanced }: { onAdvanced: () => void }) {
  const drafts = useSettingsFeatureStore((s) => s.drafts);
  const recommended = useSettingsFeatureStore((s) => s.recommended);
  const presetById = useSettingsFeatureStore((s) => s.presetById);
  const applyPreset = useSettingsFeatureStore((s) => s.applyPreset);
  const setField = useSettingsFeatureStore((s) => s.setField);
  const verifyState = useSettingsFeatureStore((s) => s.verify);
  const verifying = useSettingsFeatureStore((s) => s.verifying);
  const runVerify = useSettingsFeatureStore((s) => s.runVerify);
  const verifyErrors = useSettingsFeatureStore((s) => s.verifyError);

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

      {usingCloud && <CloudKeyCard />}

      <Card>
        <CardHeader>
          <CardTitle>Is everything working?</CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Three jobs sit behind a full practice session. If one is unhappy, the row says
            what stops and what carries on.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {JOBS.map((job) => {
            const result = verifyState?.[job.modality];
            const ok = result?.ok === true;
            const busy = verifying === job.modality;
            // The check can fail as a *result* (`result.state`) or as a request that never
            // produced one (`verifyError`). Both used to leave the row silent in the second
            // case; a row that says a job is broken owes a sentence either way.
            const thrown = verifyErrors?.[job.modality];
            const failure = busy || ok ? null : (failureSentence(result) ?? thrown ?? null);
            return (
              <div
                key={job.modality}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-lg border p-3",
                  failure ? "border-warning/50 bg-warning/[0.06]" : "border-border",
                )}
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
                  {failure && (
                    <>
                      <span className="mt-1 block text-[13px] text-foreground">{failure}</span>
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">
                        {job.without}
                      </span>
                      {/* The provider's own words, kept where somebody debugging can find
                          them and out of the way of somebody who cannot use them. */}
                      {result?.detail && (
                        <span className="mt-0.5 block text-[12px] text-muted-foreground">
                          Reported: {result.detail}
                        </span>
                      )}
                    </>
                  )}
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
                    {busy ? "Checking…" : failure ? "Check again" : "Check"}
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
