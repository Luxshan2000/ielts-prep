import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  Download,
  HardDrive,
  Mic,
  MicOff,
  Moon,
  RotateCw,
  ServerCog,
  Sun,
  X,
} from "lucide-react";
import {
  AudioWaveform,
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  Input,
  Progress,
  Select,
  Skeleton,
  Spinner,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatBand } from "@/lib/format";
import { useSettingsStore } from "@/stores";
import { ChoiceCard } from "./WizardChrome";
import { useOnboardingStore } from "../store";
import {
  ENGINE_LABELS,
  LLM_ENGINE_IDS,
  SELF_LEVELS,
  WEEKDAYS,
  type EngineEntry,
  type ExamFormat,
  type ProfileDraft,
  type SelfLevel,
} from "../types";

// ------------------------------------------------------------------ 1 welcome ---

export function StepWelcome() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-muted-foreground">
        BandReady runs entirely on this machine. Your essays, recordings and scores stay in a
        local database; nothing is uploaded unless you deliberately configure a cloud model.
        Setup takes about two minutes, and every answer is editable later in Settings.
      </p>

      <div className="space-y-2">
        <p className="text-[13px] font-medium text-foreground">Pick a theme</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <ChoiceCard
            name="theme"
            selected={theme === "dark"}
            title="Dark"
            description="The default. Easier on the eyes for long reading passages."
            onSelect={() => setTheme("dark")}
          />
          <ChoiceCard
            name="theme"
            selected={theme === "light"}
            title="Light"
            description="Closer to the paper test and to a bright room."
            onSelect={() => setTheme("light")}
          />
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {theme === "dark" ? (
            <Moon className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Sun className="h-3 w-3" aria-hidden="true" />
          )}
          Applied immediately — change it any time from Settings.
        </p>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- 2 exam ---

const TARGET_BANDS = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];

export function StepExam({
  draft,
  setDraft,
}: {
  draft: ProfileDraft;
  setDraft: (patch: Partial<ProfileDraft>) => void;
}) {
  const [booked, setBooked] = useState(draft.exam_date !== null);
  const today = new Date().toISOString().slice(0, 10);
  const dateInvalid = booked && draft.exam_date !== null && draft.exam_date < today;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-[13px] font-medium text-foreground">Which test are you taking?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              [
                "academic",
                "Academic",
                "University entry and professional registration. Task 1 describes a chart.",
              ],
              [
                "general_training",
                "General Training",
                "Migration and work. Task 1 is a letter.",
              ],
            ] as [ExamFormat, string, string][]
          ).map(([value, title, description]) => (
            <ChoiceCard
              key={value}
              name="exam_format"
              selected={draft.exam_format === value}
              title={title}
              description={description}
              onSelect={() => setDraft({ exam_format: value })}
            />
          ))}
        </div>
      </div>

      <Field
        label="Target band"
        hint="Half-band steps, the same granularity the real test reports."
      >
        {({ id }) => (
          <Select
            className="max-w-[12rem]"
            aria-label="Target band"
            value={String(draft.target_band)}
            options={TARGET_BANDS.map((band) => ({
              value: String(band),
              label: formatBand(band),
            }))}
            onChange={(value) => setDraft({ target_band: Number(value) })}
            key={id}
          />
        )}
      </Field>

      <div className="space-y-2">
        <p className="text-[13px] font-medium text-foreground">Have you booked a date?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <ChoiceCard
            name="booked"
            selected={!booked}
            title="Not booked yet"
            description="BandReady paces you on a rolling 8-week horizon."
            onSelect={() => {
              setBooked(false);
              setDraft({ exam_date: null });
            }}
          />
          <ChoiceCard
            name="booked"
            selected={booked}
            title="Yes, I have a date"
            description="The plan is built back from it, with a two-week taper."
            onSelect={() => setBooked(true)}
          />
        </div>
        {booked && (
          <Field
            label="Exam date"
            error={dateInvalid ? "That date has already passed." : undefined}
          >
            {({ id }) => (
              <Input
                id={id}
                type="date"
                className="max-w-[14rem]"
                min={today}
                value={draft.exam_date ?? ""}
                onChange={(e) => setDraft({ exam_date: e.target.value || null })}
              />
            )}
          </Field>
        )}
      </div>
    </div>
  );
}

/** True when step 2's answers are usable. */
export function examStepValid(draft: ProfileDraft): boolean {
  if (draft.exam_date === null) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(draft.exam_date);
}

// -------------------------------------------------------------------- 3 level ---

const MINUTE_OPTIONS: { value: 30 | 60 | 90; label: string; hint: string }[] = [
  { value: 30, label: "30 minutes", hint: "5 min warm-up · 20 min main · 5 min drill" },
  { value: 60, label: "60 minutes", hint: "10 min warm-up · 40 min main · 10 min drill" },
  { value: 90, label: "90 minutes", hint: "10 min warm-up · 60 min main · 15 min drill" },
];

export function StepLevel({
  draft,
  setDraft,
}: {
  draft: ProfileDraft;
  setDraft: (patch: Partial<ProfileDraft>) => void;
}) {
  const toggleDay = (day: string) => {
    const next = draft.study_days.includes(day)
      ? draft.study_days.filter((d) => d !== day)
      : [...draft.study_days, day];
    setDraft({ study_days: next });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-[13px] font-medium text-foreground">
          Where would you put yourself today?
        </p>
        <p className="text-[13px] text-muted-foreground">
          This is only a starting point. If you skip a placement section, this is what
          BandReady falls back on for that skill — clearly marked as self-rated.
        </p>
        <div className="grid gap-2">
          {SELF_LEVELS.map((level) => (
            <ChoiceCard
              key={level.value}
              name="self_level"
              selected={draft.self_level === level.value}
              title={level.label}
              description={level.hint}
              onSelect={() => setDraft({ self_level: level.value as SelfLevel })}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[13px] font-medium text-foreground">How long per study day?</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {MINUTE_OPTIONS.map((option) => (
            <ChoiceCard
              key={option.value}
              name="daily_minutes"
              selected={draft.daily_minutes === option.value}
              title={option.label}
              description={option.hint}
              onSelect={() => setDraft({ daily_minutes: option.value })}
            />
          ))}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-foreground">
          Which days will you study?
        </legend>
        <p className="text-[13px] text-muted-foreground">
          Pick at least three. The days you leave out are rest days — they never break a
          streak.
        </p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((day) => {
            const on = draft.study_days.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => toggleDay(day.value)}
                className={cn(
                  "h-9 min-w-[3.25rem] rounded-lg border px-3 text-[13px] font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
                  on
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-input text-muted-foreground hover:bg-accent",
                )}
              >
                {day.label}
              </button>
            );
          })}
        </div>
        {draft.study_days.length < 3 && (
          <p className="text-xs text-destructive">Select at least three study days.</p>
        )}
      </fieldset>
    </div>
  );
}

export function levelStepValid(draft: ProfileDraft): boolean {
  return draft.study_days.length >= 3;
}

// ------------------------------------------------------------------ 4 engines ---

const STATE_TONE: Record<string, "success" | "warning" | "default"> = {
  running: "success",
  ready: "success",
  installed: "warning",
  unknown_server: "warning",
  needs_download: "warning",
  absent: "default",
};

const STATE_LABEL: Record<string, string> = {
  running: "Running",
  ready: "Weights installed",
  installed: "Installed, not running",
  unknown_server: "Unrecognised server",
  needs_download: "Weights not downloaded yet",
  absent: "Not found",
};

function EngineRow({ engine }: { engine: EngineEntry }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border px-3 py-2.5">
      <ServerCog className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="text-sm font-medium text-foreground">
        {ENGINE_LABELS[engine.id] ?? engine.id}
      </span>
      <Badge tone={STATE_TONE[engine.state] ?? "default"}>
        {STATE_LABEL[engine.state] ?? engine.state.replace(/_/g, " ")}
      </Badge>
      {engine.models && engine.models.length > 0 && (
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">
          {engine.models.slice(0, 3).join(", ")}
          {engine.models.length > 3 ? ` +${engine.models.length - 3} more` : ""}
        </span>
      )}
      {engine.detail && (
        <span className="text-[11px] text-muted-foreground">{engine.detail}</span>
      )}
    </li>
  );
}

export function StepEngines() {
  const { detect, detecting, detectError, runDetect } = useOnboardingStore();

  useEffect(() => {
    if (detect === null && !detecting) void runDetect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const engines = detect?.engines ?? [];
  const llm = engines.filter((e) => LLM_ENGINE_IDS.includes(e.id));
  const speech = engines.filter((e) => !LLM_ENGINE_IDS.includes(e.id));
  const running = llm.filter((e) => e.state === "running");

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        BandReady needs a language model to score your writing and speaking. It looks for one
        already running on this machine; if there is none, you can point it at a cloud key in
        Settings later. Nothing here blocks Reading or Listening practice.
      </p>

      {detectError && (
        <Card className="border-warning/40 bg-warning/[0.06]">
          <CardContent className="p-4 text-[13px] text-foreground">{detectError}</CardContent>
        </Card>
      )}

      {detecting && detect === null ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Language models — scoring and feedback
            </p>
            <ul className="space-y-2">
              {llm.map((engine) => (
                <EngineRow key={engine.id} engine={engine} />
              ))}
              {llm.length === 0 && (
                <li className="rounded-lg border border-border px-3 py-2.5 text-[13px] text-muted-foreground">
                  No local engine responded. Reading and Listening still work in full; add a
                  provider from Settings whenever you like.
                </li>
              )}
            </ul>
            {running.length === 0 && llm.length > 0 && (
              <p className="text-[13px] text-muted-foreground">
                Nothing is serving a model right now. Start one of these, or add a cloud key in
                Settings, and scored writing and speaking switch on.
              </p>
            )}
          </div>

          {speech.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Speech — handled on the next step
              </p>
              <ul className="space-y-2">
                {speech.map((engine) => (
                  <EngineRow key={engine.id} engine={engine} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" loading={detecting} onClick={() => void runDetect(true)}>
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          Detect again
        </Button>
        {running.length > 0 && (
          <span className="flex items-center gap-1.5 text-[13px] text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {running.length} engine{running.length === 1 ? "" : "s"} ready
          </span>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- 5 models ---

function sizeLabel(mb: number | null | undefined): string | null {
  if (!mb) return null;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

export function StepModels() {
  const {
    recommended,
    artifacts,
    downloads,
    modelsError,
    loadingModels,
    loadModels,
    startDownload,
    cancelDownload,
  } = useOnboardingStore();

  useEffect(() => {
    if (recommended === null && !loadingModels) void loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const missing = artifacts.filter((a) => a.state !== "installed");

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Speech recognition and the examiner voice run from local weights. They are downloaded
        once into your data folder, checksum-verified, and resumed if interrupted. Downloads
        continue in the background — Reading and Writing work immediately; the Speaking room
        waits for its weights.
      </p>

      {recommended?.recommended && (
        <Card>
          <CardContent className="space-y-1.5 p-4 text-[13px]">
            <p className="font-medium text-foreground">
              Detected:{" "}
              {[
                recommended.platform?.ram_gb
                  ? `${Math.round(recommended.platform.ram_gb)} GB RAM`
                  : null,
                recommended.platform?.apple_silicon ? "Apple silicon" : null,
              ]
                .filter(Boolean)
                .join(" · ") || "this machine"}
            </p>
            {recommended.recommended.llm_model && (
              <p className="text-muted-foreground">
                Suggested scoring model: {recommended.recommended.llm_model}
                {recommended.recommended.llm_engine
                  ? ` via ${recommended.recommended.llm_engine}`
                  : ""}
                .
              </p>
            )}
            {recommended.recommended.advice && (
              <p className="text-muted-foreground">{recommended.recommended.advice}</p>
            )}
            {recommended.cloud_alternative?.advice && (
              <p className="flex items-start gap-1.5 text-muted-foreground">
                <Cloud className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {recommended.cloud_alternative.advice}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {modelsError && (
        <Card className="border-warning/40 bg-warning/[0.06]">
          <CardContent className="p-4 text-[13px] text-foreground">{modelsError}</CardContent>
        </Card>
      )}

      {loadingModels && artifacts.length === 0 ? (
        <Skeleton className="h-24 w-full" />
      ) : artifacts.length === 0 ? (
        <p className="rounded-lg border border-border px-3 py-2.5 text-[13px] text-muted-foreground">
          No downloadable weights are listed for this build.
        </p>
      ) : (
        <ul className="space-y-2">
          {artifacts.map((artifact) => {
            const job = downloads[artifact.artifact_id];
            const installed = artifact.state === "installed" || job?.state === "done";
            const busy = job?.state === "queued" || job?.state === "running";
            const resumable =
              !installed &&
              (artifact.state === "partial" ||
                job?.state === "cancelled" ||
                job?.state === "error");

            return (
              <li key={artifact.artifact_id} className="rounded-lg border border-border px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <HardDrive
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium text-foreground">{artifact.label}</span>
                  {artifact.kind && (
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {artifact.kind}
                    </span>
                  )}
                  {sizeLabel(artifact.approx_mb) && (
                    <span className="tabular text-xs text-muted-foreground">
                      {sizeLabel(artifact.approx_mb)}
                    </span>
                  )}
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
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Cancel
                      </Button>
                    )}
                    {!busy && !installed && (
                      <Button
                        size="sm"
                        variant={resumable ? "secondary" : "outline"}
                        onClick={() => void startDownload(artifact.artifact_id)}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        {resumable ? "Resume" : "Download"}
                      </Button>
                    )}
                  </span>
                </div>
                {busy && (
                  <Progress
                    className="mt-2"
                    value={job?.pct ?? null}
                    detail={job?.detail ?? "downloading…"}
                  />
                )}
                {job?.state === "cancelled" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Cancelled — the partial file was kept, so Resume picks it back up.
                  </p>
                )}
                {job?.state === "error" && job.error && (
                  <p className="mt-2 text-xs text-destructive">{job.error}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {missing.length > 0 && (
        <p className="text-[13px] text-muted-foreground">
          You can continue now and let these finish in the background.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------- 6 mic ---

interface MicState {
  status: "idle" | "requesting" | "listening" | "denied" | "unsupported" | "error";
  detail: string | null;
  level: number;
  devices: { deviceId: string; label: string }[];
}

export function StepMic() {
  const [state, setState] = useState<MicState>({
    status: "idle",
    detail: null,
    level: 0,
    devices: [],
  });
  const [deviceId, setDeviceId] = useState<string>("");
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const peakRef = useRef(0);

  const stop = () => {
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    frameRef.current = undefined;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
  };

  useEffect(() => stop, []);

  const start = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState((s) => ({
        ...s,
        status: "unsupported",
        detail: "This build has no microphone API available.",
      }));
      return;
    }
    stop();
    setState((s) => ({ ...s, status: "requesting", detail: null }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      streamRef.current = stream;
      const devices = (await navigator.mediaDevices.enumerateDevices())
        .filter((d) => d.kind === "audioinput")
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));

      const context = new AudioContext();
      contextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      peakRef.current = 0;

      const tick = () => {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (const sample of buffer) sum += sample * sample;
        const rms = Math.sqrt(sum / buffer.length);
        peakRef.current = Math.max(peakRef.current, rms);
        setState((s) => ({ ...s, level: Math.min(1, rms * 6) }));
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
      setState({ status: "listening", detail: null, level: 0, devices });
    } catch (err) {
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      setState((s) => ({
        ...s,
        status: denied ? "denied" : "error",
        detail: denied
          ? "Microphone access was refused. Grant it in your system settings and try again."
          : err instanceof Error
            ? err.message
            : "The microphone could not be opened.",
      }));
    }
  };

  const heard = peakRef.current > 0.02;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        The Speaking room needs a microphone. Check it now so the first live session is not the
        moment you discover it is muted. Skipping this is fine — every other module works
        without a mic.
      </p>

      {state.devices.length > 1 && (
        <Field label="Input device">
          {() => (
            <Select
              aria-label="Microphone input device"
              value={deviceId || state.devices[0]?.deviceId || ""}
              options={state.devices.map((d) => ({ value: d.deviceId, label: d.label }))}
              onChange={(value) => {
                setDeviceId(value);
                void start();
              }}
            />
          )}
        </Field>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3">
        {state.status === "listening" ? (
          <Mic className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        ) : (
          <MicOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <AudioWaveform
          level={state.level}
          active={state.status === "listening"}
          bars={9}
          status={state.status === "listening" ? "Microphone is live" : "Microphone is idle"}
        />
        <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">
          {state.status === "listening"
            ? heard
              ? "Sounds good — the meter is moving."
              : "Say something: “The weather today is…”"
            : state.status === "requesting"
              ? "Waiting for permission…"
              : (state.detail ?? "Not tested yet.")}
        </span>
        <Button
          size="sm"
          variant={state.status === "listening" ? "outline" : "primary"}
          onClick={() => (state.status === "listening" ? stop() : void start())}
        >
          {state.status === "requesting" ? (
            <Spinner />
          ) : state.status === "listening" ? (
            "Stop"
          ) : (
            "Test my microphone"
          )}
        </Button>
      </div>
    </div>
  );
}

// --------------------------------------------------------- 7 placement offer ---

export function StepPlacementOffer({ draft }: { draft: ProfileDraft }) {
  const selfLevel = useMemo(
    () => SELF_LEVELS.find((l) => l.value === draft.self_level),
    [draft.self_level],
  );

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        The placement test is a short sampler — one reading passage, one listening part, a
        100–150 word writing task and four speaking questions. It takes about 30 minutes and
        gives every skill a starting band within about ±1.0, which is what the plan needs to
        weight your week.
      </p>

      <ul className="space-y-2 text-[13px]">
        {[
          "Every section is skippable on its own — a skipped section falls back to your self-rating for that skill.",
          "You can stop between sections; the sitting is saved on this machine and resumes where you left it.",
          "Nothing here is graded against you. It only sets a starting point.",
        ].map((line) => (
          <li key={line} className="flex items-start gap-2 text-muted-foreground">
            <CheckCircle2
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
              aria-hidden="true"
            />
            {line}
          </li>
        ))}
      </ul>

      <Card className="border-border">
        <CardContent className="p-4 text-[13px]">
          <p className="font-medium text-foreground">If you skip it</p>
          <p className="mt-1 text-muted-foreground">
            All four skills start at {selfLevel?.label.toLowerCase() ?? "your self-rating"} —
            about band{" "}
            {formatBand(
              { beginner: 4.5, intermediate: 5.5, upper: 6.5, advanced: 7.5 }[draft.self_level],
            )}{" "}
            — with low confidence, and the dashboard keeps a dismissible reminder until you
            place or complete three scored attempts per skill.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
