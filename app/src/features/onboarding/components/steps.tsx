import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Download,
  ExternalLink,
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
import { openExternal } from "@/lib/openExternal";
import { useSettingsStore } from "@/stores";
import { ChoiceCard } from "./WizardChrome";
import { scoringStateSentence, useOnboardingStore } from "../store";
import {
  ARTIFACT_KIND_LABELS,
  ENGINE_LABELS,
  LLM_ENGINE_IDS,
  SELF_LEVELS,
  WEEKDAYS,
  type EngineEntry,
  type EngineSettingsView,
  type ExamFormat,
  type ProfileDraft,
  type ProviderPreset,
  type SelfLevel,
  type SetupFlow,
} from "../types";

/**
 * One sentence about what works, used verbatim on both the marking step and the
 * speech step. They used to disagree — step 4 said Writing was fine without a
 * model and step 5 said the opposite — which is the single most confusing thing
 * a first-run learner can read.
 */
export const WHAT_WORKS_NOW =
  "Reading, Listening, Vocabulary and Grammar work right now, with nothing to set up. " +
  "Writing and Speaking need a marking model before anything you do there is scored.";

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
          Applied immediately. Change it any time from Settings.
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
            error={
              dateInvalid
                ? "That date has already passed."
                : draft.exam_date === null
                  ? 'Add your date, or choose "Not booked yet". Otherwise the plan is paced on a rolling 8 weeks.'
                  : undefined
            }
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

/**
 * True when step 2's answers are usable.
 *
 * The step renders "That date has already passed." for a date in the past, but this
 * returned true anyway, so Continue stayed live and the wizard carried a date the plan
 * cannot be built back from. A visible error has to block the button that ignores it.
 */
export function examStepValid(draft: ProfileDraft): boolean {
  if (draft.exam_date === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.exam_date)) return false;
  return draft.exam_date >= new Date().toISOString().slice(0, 10);
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
          BandReady falls back on for that skill, clearly marked as self-rated.
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
          Pick at least three. The days you leave out are rest days, and they never break a
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

// ------------------------------------------------------------------ 4 marking ---

const ENGINE_STATE_TONE: Record<string, "success" | "warning" | "default"> = {
  running: "success",
  ready: "success",
  installed: "warning",
  unknown_server: "warning",
  needs_download: "warning",
  absent: "default",
};

/** Detection states, in the words of somebody who has never run a model server. */
const ENGINE_STATE_LABEL: Record<string, string> = {
  running: "Ready to use",
  ready: "Ready to use",
  installed: "Installed, but not started",
  unknown_server: "Something is answering, but BandReady doesn't recognise it",
  needs_download: "Installed, needs its files",
  absent: "Not on this machine",
};

/**
 * A step BandReady will not run for you — an installer, a GUI app, or a piped
 * shell script. Show the exact command and a copy button; never execute it.
 */
function ManualSetup({ flow }: { flow: SetupFlow }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!flow.copy) return;
    try {
      await navigator.clipboard.writeText(flow.copy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the command is on screen to be typed */
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
      {flow.instructions && (
        <p className="text-[13px] text-muted-foreground">{flow.instructions}</p>
      )}
      {flow.copy && (
        <div className="flex items-center gap-2">
          <code className="scrollbar-thin flex h-8 min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground">
            {flow.copy}
          </code>
          <Button size="sm" variant="ghost" onClick={() => void copy()}>
            {copied ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
      {flow.url && (
        <Button size="sm" variant="outline" onClick={() => openExternal(flow.url as string)}>
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Open the download page
        </Button>
      )}
    </div>
  );
}

/**
 * One local engine, with the action that moves it forward attached. The old
 * version printed four "Not found" rows and no buttons, which left the learner
 * reading provider slugs with nothing to do about them.
 */
function EngineRow({ engine }: { engine: EngineEntry }) {
  const { detect, setupJobs, manualSetup, savingScoring, runEngineSetup, useLocalEngine } =
    useOnboardingStore();
  const flow = manualSetup[engine.id] ?? detect?.setup?.[engine.id];
  const job = setupJobs[engine.id];
  const busy = job?.state === "queued" || job?.state === "running";
  const usable = engine.state === "running";
  const showManual = flow !== undefined && !flow.runnable && !usable;

  return (
    <li className="rounded-lg border border-border px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <ServerCog className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">
          {ENGINE_LABELS[engine.id] ?? engine.id}
        </span>
        <Badge tone={ENGINE_STATE_TONE[engine.state] ?? "default"}>
          {ENGINE_STATE_LABEL[engine.state] ?? engine.state.replace(/_/g, " ")}
        </Badge>
        <span className="ml-auto flex items-center gap-2">
          {usable ? (
            <Button
              size="sm"
              loading={savingScoring}
              onClick={() => void useLocalEngine(engine)}
            >
              Use this one
            </Button>
          ) : flow?.runnable ? (
            <Button
              size="sm"
              variant="outline"
              loading={busy}
              onClick={() => void runEngineSetup(engine.id)}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Install it for me
            </Button>
          ) : null}
        </span>
      </div>
      {busy && (
        <Progress className="mt-2" value={job?.pct ?? null} detail={job?.detail ?? "working…"} />
      )}
      {job?.state === "error" && job.error && (
        <p className="mt-2 text-xs text-destructive">{job.error}</p>
      )}
      {showManual && flow && <ManualSetup flow={flow} />}
    </li>
  );
}

/** Cloud providers the wizard can finish on its own: a key, and a closed model list. */
function cloudLlmPresets(presets: ProviderPreset[]): ProviderPreset[] {
  return presets.filter(
    (p) =>
      !p.hidden &&
      p.needs_key === true &&
      p.modalities.includes("llm") &&
      cloudModels(p).length > 0,
  );
}

/** 03 §4: never a free-text model field. Settings picks from the live OpenRouter catalogue. */
function cloudModels(preset: ProviderPreset): string[] {
  return preset.models_by_modality?.llm ?? preset.suggested_models ?? [];
}

function CloudSetup() {
  const { presets, savingScoring, scoringError, saveCloudProvider } = useOnboardingStore();
  const options = useMemo(() => cloudLlmPresets(presets), [presets]);
  const [presetId, setPresetId] = useState("");
  const [key, setKey] = useState("");

  const preset = options.find((p) => p.id === presetId) ?? options[0];
  const chosenModel = preset ? (cloudModels(preset)[0] ?? "") : "";

  if (options.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        No cloud providers are listed in this build. You can still add one from Settings.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">
        You sign up with the provider and paste the key they give you. Only your essay text and
        the marking instructions are sent. Your recordings never leave this machine. The key is
        stored encrypted and you can remove it in Settings.
      </p>

      <Field label="Provider">
        {({ id }) => (
          <Select
            key={id}
            aria-label="Marking provider"
            value={preset?.id ?? ""}
            options={options.map((p) => ({ value: p.id, label: p.label }))}
            onChange={setPresetId}
          />
        )}
      </Field>

      {preset?.notes && <p className="text-[13px] text-muted-foreground">{preset.notes}</p>}

      <Field label="API key" hint="Pasted once, kept encrypted on this machine.">
        {({ id }) => (
          <Input
            id={id}
            type="password"
            autoComplete="off"
            placeholder="Paste the key from your provider"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        )}
      </Field>

      {/* Which model marks the essay is a question a first-run learner cannot
          answer. The preset's first entry is a sensible default and Settings has
          the full closed list (03 §4) for anyone who wants to change it. */}
      <p className="text-[13px] text-muted-foreground">
        BandReady picks a suitable model for you. Settings has the full list if you want a
        different one.
      </p>

      {scoringError && <p className="text-[13px] text-destructive">{scoringError}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          loading={savingScoring}
          disabled={key.trim().length === 0 || !preset}
          onClick={() => void saveCloudProvider(preset!.id, key, chosenModel)}
        >
          Save and check
        </Button>
        {preset?.docs_url && (
          <Button size="sm" variant="ghost" onClick={() => openExternal(preset.docs_url!)}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Where do I get a key?
          </Button>
        )}
      </div>
    </div>
  );
}

function LocalSetup() {
  const { detect, detecting, detectError, runDetect } = useOnboardingStore();
  const llm = (detect?.engines ?? []).filter((e) => LLM_ENGINE_IDS.includes(e.id));

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">
        A model server runs alongside BandReady and keeps every essay on this machine. It needs
        several gigabytes of disk and is slower than a cloud service on a modest laptop.
      </p>

      {detectError && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">
          {detectError}
        </p>
      )}

      {detecting && detect === null ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <ul className="space-y-2">
          {llm.map((engine) => (
            <EngineRow key={engine.id} engine={engine} />
          ))}
          {llm.length === 0 && (
            <li className="rounded-lg border border-border px-3 py-2.5 text-[13px] text-muted-foreground">
              Nothing to list. This build knows of no local model servers.
            </li>
          )}
        </ul>
      )}

      <Button variant="outline" size="sm" loading={detecting} onClick={() => void runDetect(true)}>
        <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
        Look again
      </Button>
    </div>
  );
}

export function StepEngines() {
  const {
    detect,
    detecting,
    scoring,
    scoringChecking,
    scoringChoice,
    runDetect,
    loadPresets,
    checkScoring,
    setScoringChoice,
  } = useOnboardingStore();

  useEffect(() => {
    if (detect === null && !detecting) void runDetect();
    void loadPresets();
    void checkScoring();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const working = scoring?.ok === true;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">{WHAT_WORKS_NOW}</p>

      <Card
        className={
          working
            ? "border-success/40 bg-success/[0.06]"
            : "border-border"
        }
      >
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          {scoringChecking ? (
            <Spinner />
          ) : working ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <p className="min-w-0 flex-1 text-[13px] text-foreground">
            {scoringChecking ? "Checking your marking model…" : scoringStateSentence(scoring)}
          </p>
          <Button
            variant="ghost"
            size="sm"
            loading={scoringChecking}
            onClick={() => void checkScoring()}
          >
            Check again
          </Button>
        </CardContent>
      </Card>

      {working ? (
        <p className="text-[13px] text-muted-foreground">
          Nothing else to do here. You can change this any time in Settings.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-foreground">
            How would you like your writing and speaking marked?
          </p>

          <ChoiceCard
            name="scoring_choice"
            selected={scoringChoice === "later"}
            title="Not now, I'll start with the modules that already work"
            description="Reading, Listening, Vocabulary and Grammar are fully available. Settings has this screen again whenever you want it."
            onSelect={() => setScoringChoice("later")}
          />
          <ChoiceCard
            name="scoring_choice"
            selected={scoringChoice === "cloud"}
            title="Use an online marking service"
            description="Needs an account and a key from the provider. The most reliable option on a modest laptop."
            onSelect={() => setScoringChoice("cloud")}
          />
          <ChoiceCard
            name="scoring_choice"
            selected={scoringChoice === "local"}
            title="Run a model on this machine"
            description="Everything stays offline. Needs a few gigabytes of disk and a capable machine."
            onSelect={() => setScoringChoice("local")}
          />

          {scoringChoice === "cloud" && (
            <Card>
              <CardContent className="p-4">
                <p className="mb-3 flex items-center gap-2 text-[13px] font-medium text-foreground">
                  <Cloud className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Online marking service
                </p>
                <CloudSetup />
              </CardContent>
            </Card>
          )}
          {scoringChoice === "local" && (
            <Card>
              <CardContent className="p-4">
                <p className="mb-3 flex items-center gap-2 text-[13px] font-medium text-foreground">
                  <ServerCog className="h-4 w-4 shrink-0" aria-hidden="true" />
                  A model on this machine
                </p>
                <LocalSetup />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- 5 models ---

function sizeLabel(mb: number | null | undefined): string | null {
  if (!mb) return null;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

/**
 * True when the current settings would actually load these weights.
 *
 * The wizard used to offer the recommended STT artifact — 1.5 GB — as the one
 * "required" download, while the configured engine was a small Whisper that was
 * already installed. On a slow connection that is the most expensive thing the
 * app asks for, and it changes nothing.
 */
function artifactInUse(
  artifact: { kind: string | null; engine: string | null },
  settings: EngineSettingsView | null,
): boolean {
  if (!artifact.kind || !artifact.engine || !settings) return false;
  const slot = artifact.kind === "stt" ? settings.stt : artifact.kind === "tts" ? settings.tts : undefined;
  if (!slot) return false;
  return artifact.engine === slot.engine || artifact.engine === slot.preset;
}

const OPTIONAL_BENEFIT: Record<string, string> = {
  stt: "Optional: a more accurate speech model. The one you already have works.",
  tts: "Optional: an alternative examiner voice.",
};

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
  const settingsDoc = useSettingsStore((s) => s.doc);
  const loadSettings = useSettingsStore((s) => s.load);

  useEffect(() => {
    if (recommended === null && !loadingModels) void loadModels();
    if (settingsDoc === null) void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settings = settingsDoc as EngineSettingsView | null;
  // Weights the app will actually load come first; anything else is an upgrade
  // the learner can decline without losing a feature.
  const ordered = useMemo(
    () =>
      [...artifacts].sort(
        (a, b) => Number(artifactInUse(b, settings)) - Number(artifactInUse(a, settings)),
      ),
    [artifacts, settings],
  );
  const missingInUse = ordered.filter((a) => artifactInUse(a, settings) && a.state !== "installed");

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Speaking practice turns your recording into words and reads the examiner&apos;s
        questions aloud. Both run from files on this machine, downloaded once and resumed if
        interrupted. {WHAT_WORKS_NOW}
      </p>

      {recommended?.cloud_alternative?.advice && (
        <Card>
          <CardContent className="space-y-1.5 p-4 text-[13px]">
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Cloud className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {recommended.cloud_alternative.label ?? "Using an online service instead"}
            </p>
            <p className="text-muted-foreground">{recommended.cloud_alternative.advice}</p>
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
          {ordered.map((artifact) => {
            const job = downloads[artifact.artifact_id];
            const installed = artifact.state === "installed" || job?.state === "done";
            const busy = job?.state === "queued" || job?.state === "running";
            const resumable =
              !installed &&
              (artifact.state === "partial" ||
                job?.state === "cancelled" ||
                job?.state === "error");
            const inUse = artifactInUse(artifact, settings);
            const jobName = artifact.kind ? ARTIFACT_KIND_LABELS[artifact.kind] : undefined;

            return (
              <li key={artifact.artifact_id} className="rounded-lg border border-border px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <HardDrive
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 text-sm font-medium text-foreground">
                    {jobName ?? artifact.label}
                  </span>
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
                  ) : inUse ? (
                    <Badge tone="warning">Needed for Speaking</Badge>
                  ) : (
                    <Badge tone="outline">Optional</Badge>
                  )}
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
                        variant={resumable || inUse ? "secondary" : "ghost"}
                        onClick={() => void startDownload(artifact.artifact_id)}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        {resumable ? "Resume" : "Download"}
                      </Button>
                    )}
                  </span>
                </div>
                {!installed && !inUse && artifact.kind && OPTIONAL_BENEFIT[artifact.kind] && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {OPTIONAL_BENEFIT[artifact.kind]}
                  </p>
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
                    Cancelled. The partial file was kept, so Resume picks it back up.
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

      <p className="text-[13px] text-muted-foreground">
        {missingInUse.length > 0
          ? "You can continue now and let these finish in the background."
          : "Nothing here is required to continue. Downloads can wait until you first open the Speaking room."}
      </p>
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
        moment you discover it is muted. Skipping this is fine. Every other module works
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
              ? "Sounds good, the meter is moving."
              : 'Say something: "The weather today is…"'
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
  const scoring = useOnboardingStore((s) => s.scoring);
  const checkScoring = useOnboardingStore((s) => s.checkScoring);
  const selfLevel = useMemo(
    () => SELF_LEVELS.find((l) => l.value === draft.self_level),
    [draft.self_level],
  );
  const markingReady = scoring?.ok === true;

  // A restored draft can land straight on this step without step 4 ever having
  // mounted, and warning about marking that actually works would be a lie.
  useEffect(() => {
    if (scoring === null) void checkScoring();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        The placement test is a short sampler: one reading passage, one listening part, a
        writing task of 100 to 150 words and four short written answers to speaking questions,
        typed the way you would say them. It takes about 30 minutes and gives every skill a starting
        band within about ±1.0, which is what the plan needs to weight your week.
      </p>

      {scoring !== null && !markingReady && (
        <Card className="border-warning/40 bg-warning/[0.06]">
          <CardContent className="space-y-1 p-4 text-[13px]">
            <p className="font-medium text-foreground">
              The Writing and Speaking sections can&apos;t be marked yet
            </p>
            <p className="text-muted-foreground">
              Those two halves are read by a marking model, and none is set up. Reading and
              Listening are marked here on this machine and will give you real starting bands;
              Writing and Speaking would fall back to the self-rating you gave earlier. You can
              go back a few steps to set marking up, skip those two sections, or place now and
              retake them later. Nothing is lost either way.
            </p>
          </CardContent>
        </Card>
      )}

      <ul className="space-y-2 text-[13px]">
        {[
          "Every section is skippable on its own, and a skipped section falls back to your self-rating for that skill.",
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
            All four skills start at {selfLevel?.label.toLowerCase() ?? "your self-rating"},
            about band{" "}
            {formatBand(
              { beginner: 4.5, intermediate: 5.5, upper: 6.5, advanced: 7.5 }[draft.self_level],
            )}
            , with low confidence, and the dashboard keeps a dismissible reminder until you
            place or complete three scored attempts per skill.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
