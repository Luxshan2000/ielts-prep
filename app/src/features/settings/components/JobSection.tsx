import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, CircleAlert, Cloud, Cpu, ExternalLink, Loader2, RotateCw } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Disclosure,
  Field,
  Select,
} from "@/components/ui";
import { SearchInput } from "@/components/ui/SearchInput";
import { cn } from "@/lib/cn";
import { openExternal } from "@/lib/openExternal";
import {
  LOCAL_PRESET,
  OPENROUTER_PRESET,
  useSettingsFeatureStore,
  type CatalogueModel,
  type Modality,
} from "../store";

/**
 * One job, one section: what it is, where it runs, which model, and whether it works.
 *
 * The Providers pane used to ask a single question — where should the thinking happen? —
 * and answered it for all three jobs at once. That is one question too few. Marking through
 * OpenRouter while the voice and the microphone stay on this computer is an ordinary,
 * sensible arrangement, and it was unreachable without opening a screen of base URLs.
 *
 * So each job chooses for itself. Nothing here is a route-wide switch, and nothing in one
 * section moves anything in another except the key, which is deliberately shared.
 */

interface JobCopy {
  /** The learner's name for the job, and the section's accessible name. */
  title: string;
  /** What the job IS, in one sentence, before any provider is named. */
  what: string;
  /** What still works when this job does not. The honest answer, not a softening. */
  without: string;
  /** The local engine, named the way the learner would describe it. */
  localName: string;
  localNote: string;
  remoteNote: string;
}

const COPY: Record<Modality, JobCopy> = {
  llm: {
    title: "The examiner",
    what: "Asks you questions and marks your answers.",
    without:
      "Without it: reading, listening, grammar and vocabulary practice all still work, but nothing can be marked and no band can be estimated.",
    localName: "Ollama",
    localNote: "Free, and needs a capable machine",
    remoteNote: "The most consistent band scores",
  },
  tts: {
    title: "The voice",
    what: "Reads questions and listening audio aloud.",
    without:
      "Without it: your computer's own voice is used instead, which is fine for single words but not for listening papers.",
    localName: "Kokoro",
    localNote: "Free, and works with no internet",
    remoteNote: "More natural voices, paid per character",
  },
  stt: {
    title: "Hearing you",
    what: "Turns what you say into text.",
    without: "Without it: you can type your answers everywhere you would otherwise speak.",
    localName: "Whisper",
    localNote: "Your recordings never leave this computer",
    remoteNote: "More accurate, and your recordings are sent to OpenRouter",
  },
};

/**
 * The second half of the examiner's two-way choice.
 *
 * The recommended id always comes from the sidecar, which serves exactly one per job. There
 * is no "second recommendation" field to read, and the owner's two tiles are a genuine
 * choice a learner can make, so the cheap one is named here. It is offered only when the
 * live catalogue confirms it exists, or when the catalogue could not be read at all.
 */
const QUICK_LLM = "google/gemini-2.5-flash";

const KEYS_URL = "https://openrouter.ai/keys";
const OLLAMA_URL = "https://ollama.com/download";

type Route = "local" | "openrouter" | "other" | "none";

/**
 * What to tell the learner when a check comes back unhappy.
 *
 * Every sentence ends in something to do, and none of them points at a screen that no longer
 * exists: the choices they name are all in this section or the one card above it.
 */
export function failureSentence(
  result: { state?: string; detail?: string } | undefined,
): string | null {
  if (result === undefined) return null;
  switch (result.state) {
    case "needs_download":
      return 'This one needs its files downloaded first. Press Download under "Model weights" at the foot of this page.';
    case "unreachable":
      return "Not answering. If it runs on this computer, start it first, then check again.";
    case "timeout":
      return "It took too long to reply. It may still be starting up, so wait a moment and check again.";
    case "unauthorized":
      return "The key was rejected. Paste it again in the key card above, then check again.";
    case "no_key":
      return "No usable key. Paste your OpenRouter key in the card above, then check again.";
    case "unconfigured":
      return "Nothing is set up for this yet. Choose where this job should run above.";
    case "no_model":
      return "It replied, but no usable model is chosen. Pick one above.";
    case "error":
      return "It answered, but with an error. Try again in a moment, or pick a different model above.";
    default:
      return "It could not be reached. Try again, or change where this job runs above.";
  }
}

function modelLabel(model: CatalogueModel): string {
  return model.name?.trim() || model.id;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => v !== "")));
}

export function JobSection({ modality }: { modality: Modality }) {
  const copy = COPY[modality];
  const draft = useSettingsFeatureStore((s) => s.drafts[modality]);
  const presetById = useSettingsFeatureStore((s) => s.presetById);
  const presetsFor = useSettingsFeatureStore((s) => s.presetsFor);
  const applyPreset = useSettingsFeatureStore((s) => s.applyPreset);
  const setField = useSettingsFeatureStore((s) => s.setField);
  const drafts = useSettingsFeatureStore((s) => s.drafts);
  const catalogue = useSettingsFeatureStore((s) => s.catalogue[modality]);
  const loadCatalogue = useSettingsFeatureStore((s) => s.loadCatalogue);
  const verifyState = useSettingsFeatureStore((s) => s.verify[modality]);
  const verifying = useSettingsFeatureStore((s) => s.verifying);
  const verifyThrew = useSettingsFeatureStore((s) => s.verifyError[modality]);
  const runVerify = useSettingsFeatureStore((s) => s.runVerify);

  const localId = LOCAL_PRESET[modality];
  const presetId = String(draft.preset ?? "");
  const route: Route =
    presetId === OPENROUTER_PRESET
      ? "openrouter"
      : presetId === localId
        ? "local"
        : presetId === ""
          ? "none"
          : "other";

  const localPreset = presetById(localId);
  // Looked up among the presets that serve THIS job, not merely by id. OpenRouter exists as a
  // preset but no longer serves the voice, and a by-id lookup would still light its button and
  // then apply a provider that cannot do the work.
  const remotePreset = presetsFor(modality).find((p) => p.id === OPENROUTER_PRESET);

  const model = String(draft.model ?? "");
  const voice = String(draft.voice ?? "");

  // The catalogue is only worth a request once this section is actually pointed at
  // OpenRouter. Three sections fetching three lists on every Settings open is three
  // requests for a screen most people never change.
  useEffect(() => {
    if (route === "openrouter") void loadCatalogue(modality);
  }, [route, modality, loadCatalogue]);

  const recommended = catalogue?.recommended ?? null;

  // Preselecting the recommendation is what stops "Through OpenRouter" from being a click
  // that leaves the job with no model at all. It waits for the catalogue rather than
  // guessing, and it never overwrites a model the learner already has.
  useEffect(() => {
    if (route !== "openrouter" || model !== "" || !recommended) return;
    setField(modality, "model", recommended);
  }, [route, model, recommended, modality, setField]);

  const chosenModel = useMemo(
    () => catalogue?.models.find((m) => m.id === model),
    [catalogue, model],
  );
  const voices = useMemo(() => chosenModel?.voices ?? [], [chosenModel]);

  // A speech model's voices are the model's own, so a voice left over from another model is
  // a request the provider will refuse.
  useEffect(() => {
    if (modality !== "tts" || route !== "openrouter" || voices.length === 0) return;
    if (voices.includes(voice)) return;
    setField(modality, "voice", voices[0]);
  }, [modality, route, voices, voice, setField]);

  const choose = (next: "local" | "openrouter") => {
    const preset = next === "local" ? localPreset : remotePreset;
    if (!preset) return;
    applyPreset(modality, preset);
    if (next !== "openrouter") return;
    void loadCatalogue(modality);
    // `applyPreset` clears the key, because a different provider means a different key. Here
    // it is the same provider, so whatever the other sections hold is this section's key too.
    const shared = shareableKey(drafts, modality);
    if (shared) setField(modality, "api_key", shared);
  };

  const busy = verifying === modality;
  const ok = verifyState?.ok === true;
  const failure = busy || ok ? null : (failureSentence(verifyState) ?? verifyThrew ?? null);

  return (
    <Card role="group" aria-label={copy.title}>
      <CardHeader className="pb-2">
        <CardTitle>{copy.title}</CardTitle>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{copy.what}</p>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* A job with only one route shows one button across the row, rather than a second
            one greyed out. A disabled control still reads as a choice that exists and is
            unavailable to you, which is the wrong story: the voice is local because listening
            audio is exam content, not because something is missing here. */}
        <div className={cn("grid gap-2", remotePreset ? "grid-cols-2" : "grid-cols-1")}>
          <RouteButton
            icon={Cpu}
            label="On this computer"
            note={copy.localNote}
            selected={route === "local"}
            disabled={!localPreset}
            onClick={() => choose("local")}
          />
          {remotePreset && (
            <RouteButton
              icon={Cloud}
              label="Through OpenRouter"
              note={copy.remoteNote}
              selected={route === "openrouter"}
              onClick={() => choose("openrouter")}
            />
          )}
        </div>

        {route === "other" && (
          <p className="text-[13px] text-foreground">
            This job is still set to <code className="font-mono text-[12px]">{presetId}</code>,
            which this version of BandReady no longer runs. Pick one of the two above.
          </p>
        )}
        {route === "none" && (
          <p className="text-[13px] text-muted-foreground">
            {localPreset || remotePreset
              ? "Not set up yet. Pick one above."
              : "The provider list has not loaded yet."}
          </p>
        )}

        {route === "local" && (
          <LocalChoice
            modality={modality}
            localName={copy.localName}
            model={model}
            voice={voice}
          />
        )}

        {route === "openrouter" && (
          <RemoteChoice
            modality={modality}
            model={model}
            voice={voice}
            voices={voices}
            chosenModel={chosenModel}
          />
        )}

        <CheckRow
          without={copy.without}
          busy={busy}
          ok={ok}
          failure={failure}
          detail={verifyState?.detail}
          onCheck={() => void runVerify(modality)}
          extra={
            route === "local" && modality === "llm" && !ok ? (
              <Button variant="ghost" size="sm" onClick={() => openExternal(OLLAMA_URL)}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Get Ollama
              </Button>
            ) : route === "openrouter" && verifyState?.state === "no_key" ? (
              <Button variant="ghost" size="sm" onClick={() => openExternal(KEYS_URL)}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Get a key from OpenRouter
              </Button>
            ) : null
          }
        />
      </CardContent>
    </Card>
  );
}

/**
 * The key any other OpenRouter section can legitimately reuse.
 *
 * A stored key comes back from the sidecar masked, and a mask is stripped from every save,
 * so copying one into a second slot would store an empty key and produce a rejected-key
 * message on a screen that says a key is saved. A `${VAR}` reference and a key the learner
 * has just typed are both real values, and both copy across.
 */
export function shareableKey(
  drafts: { llm: Record<string, unknown>; stt: Record<string, unknown>; tts: Record<string, unknown> },
  except: Modality,
): string | null {
  const modalities: Modality[] = ["llm", "stt", "tts"];
  for (const m of modalities) {
    if (m === except) continue;
    if (drafts[m].preset !== OPENROUTER_PRESET) continue;
    const value = String(drafts[m].api_key ?? "");
    if (value === "" || value.startsWith("••••")) continue;
    return value;
  }
  return null;
}

function RouteButton({
  icon: Icon,
  label,
  note,
  selected,
  disabled,
  onClick,
}: {
  icon: typeof Cpu;
  label: string;
  note: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "rounded-xl border p-2.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
      )}
    >
      <span className="flex items-center gap-1.5 text-[13px] font-semibold">
        <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        {label}
        {selected && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
      </span>
      <span className="mt-0.5 block text-[12px] text-muted-foreground">{note}</span>
    </button>
  );
}

/** What is running on this computer, and the one setting worth changing about it. */
function LocalChoice({
  modality,
  localName,
  model,
  voice,
}: {
  modality: Modality;
  localName: string;
  model: string;
  voice: string;
}) {
  const setField = useSettingsFeatureStore((s) => s.setField);
  const presetById = useSettingsFeatureStore((s) => s.presetById);
  const detectReport = useSettingsFeatureStore((s) => s.detectReport);
  const verifyModels = useSettingsFeatureStore((s) => s.verify[modality]?.models);

  const preset = presetById(LOCAL_PRESET[modality]);
  const spec = preset?.config_spec ?? [];

  if (modality === "llm") {
    // Only models this machine actually has. Offering the preset's suggestions would let a
    // learner pick something that was never pulled, and the failure surfaces two screens
    // away as "the practice engine reported an error".
    const detected = detectReport?.engines.find((e) => e.id === LOCAL_PRESET.llm)?.models ?? [];
    const options = unique([...(verifyModels ?? []), ...detected, model]);
    return (
      <>
        <Using>
          {localName}
          {model ? `, ${model}` : ", no model chosen yet"}
        </Using>
        {options.length > 0 ? (
          <Field label="Model">
            <Select
              value={model || null}
              onChange={(next) => setField("llm", "model", next)}
              options={options.map((id) => ({ value: id, label: id }))}
              placeholder="Choose a model"
              aria-label="Ollama model"
            />
          </Field>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            No models are installed for Ollama on this computer yet. Install Ollama and pull one,
            then press Check below.
          </p>
        )}
      </>
    );
  }

  const key = modality === "tts" ? "voice" : "model";
  const current = modality === "tts" ? voice : model;
  const field = spec.find((f) => f.key === key);
  const options = field?.options ?? [];

  return (
    <>
      <Using>
        {localName}
        {current ? `, ${current}` : ""}
      </Using>
      {options.length > 0 && (
        <Field
          label={modality === "tts" ? "Voice" : "Accuracy"}
          hint={
            modality === "tts"
              ? "British voices (bf_ and bm_) are the closest to the exam."
              : "Bigger is more accurate and slower. Small suits most computers."
          }
        >
          <Select
            value={current || null}
            onChange={(next) => setField(modality, key, next)}
            options={options.map((o) => ({ value: o, label: o }))}
            aria-label={modality === "tts" ? "Kokoro voice" : "Whisper model size"}
          />
        </Field>
      )}
    </>
  );
}

/** What OpenRouter will run, with the recommendation already chosen. */
function RemoteChoice({
  modality,
  model,
  voice,
  voices,
  chosenModel,
}: {
  modality: Modality;
  model: string;
  voice: string;
  voices: string[];
  chosenModel: CatalogueModel | undefined;
}) {
  const setField = useSettingsFeatureStore((s) => s.setField);
  const catalogue = useSettingsFeatureStore((s) => s.catalogue[modality]);
  const loadCatalogue = useSettingsFeatureStore((s) => s.loadCatalogue);

  const models = catalogue?.models ?? [];
  const recommended = catalogue?.recommended ?? null;
  const label = chosenModel ? modelLabel(chosenModel) : model || "no model chosen yet";

  return (
    <>
      <Using>
        {label} through OpenRouter
        {modality === "tts" && voice ? `, voice ${voice}` : ""}
        {model && model === recommended && (
          <Badge tone="primary" className="ml-2">
            Recommended
          </Badge>
        )}
      </Using>

      {modality === "llm" ? (
        <ExaminerQuality model={model} recommended={recommended} models={models} />
      ) : (
        <ModelSelect
          modality={modality}
          model={model}
          models={models}
          recommended={recommended}
          loading={catalogue?.loading === true}
        />
      )}

      {modality === "llm" && (
        <Disclosure
          title="Choose a specific model"
          subtitle={
            models.length > 0
              ? `${models.length} models are available through OpenRouter`
              : "The full list could not be read"
          }
        >
          <ModelBrowser
            modality={modality}
            model={model}
            models={models}
            recommended={recommended}
          />
        </Disclosure>
      )}

      {modality === "tts" && voices.length > 0 && (
        <Field label="Voice" hint={`${voices.length} voices come with this model.`}>
          <Select
            value={voice || null}
            onChange={(next) => setField("tts", "voice", next)}
            options={voices.map((v) => ({ value: v, label: v }))}
            aria-label="OpenRouter voice"
          />
        </Field>
      )}

      {catalogue?.error && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
          <p className="text-[13px] text-foreground">{catalogue.error}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            The recommended model above still works. You can pick from the full list once the
            listing loads.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1"
            onClick={() => void loadCatalogue(modality, true)}
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Try the list again
          </Button>
        </div>
      )}
    </>
  );
}

/**
 * The examiner's front door: two choices a learner can genuinely make, over two model ids
 * they cannot. The full list stays one disclosure away for anybody who wants it.
 */
function ExaminerQuality({
  model,
  recommended,
  models,
}: {
  model: string;
  recommended: string | null;
  models: CatalogueModel[];
}) {
  const setField = useSettingsFeatureStore((s) => s.setField);
  const quickExists = models.length === 0 || models.some((m) => m.id === QUICK_LLM);

  const tiles = [
    recommended
      ? {
          model: recommended,
          label: "Careful marking",
          what: "The closest to a real examiner, and the best written feedback. Costs a little more.",
        }
      : null,
    quickExists
      ? {
          model: QUICK_LLM,
          label: "Quick and cheap",
          what: "Marks in a couple of seconds for a fraction of the cost. Slightly blunter feedback.",
        }
      : null,
  ].filter((t): t is { model: string; label: string; what: string } => t !== null);

  if (tiles.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[14px] font-medium">How carefully should it mark?</p>
      <div className="grid gap-2">
        {tiles.map((choice) => {
          const picked = model === choice.model;
          return (
            <button
              key={choice.model}
              type="button"
              onClick={() => setField("llm", "model", choice.model)}
              aria-pressed={picked}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                picked ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
              )}
            >
              <span className="flex items-center gap-2 text-[14px] font-semibold">
                {choice.label}
                {picked && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
              </span>
              <span className="mt-0.5 block text-[13px] text-muted-foreground">{choice.what}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Eighteen speech models is a dropdown. Four hundred chat models is not. */
function ModelSelect({
  modality,
  model,
  models,
  recommended,
  loading,
}: {
  modality: Modality;
  model: string;
  models: CatalogueModel[];
  recommended: string | null;
  loading: boolean;
}) {
  const setField = useSettingsFeatureStore((s) => s.setField);

  const options = useMemo(() => {
    const sorted = [...models].sort((a, b) => {
      if (a.id === recommended) return -1;
      if (b.id === recommended) return 1;
      return modelLabel(a).localeCompare(modelLabel(b));
    });
    const rows = sorted.map((m) => ({
      value: m.id,
      label: m.id === recommended ? `${modelLabel(m)} (recommended)` : modelLabel(m),
    }));
    // A model the listing does not carry is still what this job is set to, and a picker that
    // silently showed nothing would read as "no model chosen".
    if (model !== "" && !rows.some((r) => r.value === model)) {
      rows.unshift({ value: model, label: model });
    }
    return rows;
  }, [models, recommended, model]);

  if (options.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        {loading ? "Reading the model list…" : "No models could be listed for this job."}
      </p>
    );
  }

  return (
    <Field label="Model">
      <Select
        value={model || null}
        onChange={(next) => setField(modality, "model", next)}
        options={options}
        placeholder="Choose a model"
        aria-label={modality === "tts" ? "OpenRouter speech model" : "OpenRouter transcription model"}
      />
    </Field>
  );
}

/** The full catalogue, searchable, for the people who came here to pick one. */
function ModelBrowser({
  modality,
  model,
  models,
  recommended,
}: {
  modality: Modality;
  model: string;
  models: CatalogueModel[];
  recommended: string | null;
}) {
  const setField = useSettingsFeatureStore((s) => s.setField);
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const hits = needle
      ? models.filter(
          (m) =>
            m.id.toLowerCase().includes(needle) ||
            (m.name ?? "").toLowerCase().includes(needle),
        )
      : models;
    return [...hits].sort((a, b) => {
      if (a.id === recommended) return -1;
      if (b.id === recommended) return 1;
      return modelLabel(a).localeCompare(modelLabel(b));
    });
  }, [models, query, recommended]);

  // Four hundred rows in a dialog is a scrollbar nobody reaches the end of, and four hundred
  // buttons in the tree for a list that is meant to be searched.
  const shown = matches.slice(0, 40);

  if (models.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        The list could not be read, so only the recommended model is on offer for now.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search models"
        aria-label="Search OpenRouter models"
      />
      {matches.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Nothing matches {`"${query}"`}. Try part of the maker's name, like anthropic or google.
        </p>
      ) : (
        <ul className="scrollbar-thin max-h-56 space-y-1 overflow-y-auto">
          {shown.map((m) => {
            const picked = m.id === model;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setField(modality, "model", m.id)}
                  aria-pressed={picked}
                  className={cn(
                    "w-full rounded-lg border p-2 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    picked ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                      {modelLabel(m)}
                    </span>
                    {m.id === recommended && <Badge tone="primary">Recommended</Badge>}
                    {picked && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                    {m.id}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {matches.length > shown.length && (
        <p className="text-[12px] text-muted-foreground">
          Showing {shown.length} of {matches.length}. Type above to narrow it down.
        </p>
      )}
    </div>
  );
}

/** What this job is set to, readable without opening anything. */
function Using({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-wrap items-center text-[13px] text-foreground">
      <span className="mr-1 text-muted-foreground">Using:</span>
      {children}
    </p>
  );
}

function CheckRow({
  without,
  busy,
  ok,
  failure,
  detail,
  onCheck,
  extra,
}: {
  without: string;
  busy: boolean;
  ok: boolean;
  failure: string | null;
  detail?: string;
  onCheck: () => void;
  extra: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        failure ? "border-warning/50 bg-warning/[0.06]" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
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
        <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">
          Is this working?
        </span>
        {ok ? (
          <Badge tone="success">Working</Badge>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={onCheck}>
            {busy ? "Checking…" : failure ? "Check again" : "Check"}
          </Button>
        )}
      </div>

      {failure && (
        <div className="mt-2">
          <p className="text-[13px] text-foreground">{failure}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{without}</p>
          {/* The provider's own words, kept where somebody debugging can find them and out
              of the way of somebody who cannot use them. */}
          {detail && (
            <p className="mt-0.5 text-[12px] text-muted-foreground">Reported: {detail}</p>
          )}
          {extra && <div className="mt-1">{extra}</div>}
        </div>
      )}
    </div>
  );
}
