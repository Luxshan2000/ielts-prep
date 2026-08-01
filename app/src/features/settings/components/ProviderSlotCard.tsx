import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  PlayCircle,
  PlugZap,
} from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { SpecField } from "./SpecField";
import { useSettingsFeatureStore, type FieldSpec, type Modality, type Preset } from "../store";

const TITLES: Record<Modality, { title: string; description: string }> = {
  llm: {
    title: "Language model",
    description: "Runs the examiner conversation and every band evaluation.",
  },
  stt: {
    title: "Speech-to-text",
    description: "Transcribes what you say during speaking practice.",
  },
  tts: {
    title: "Text-to-speech",
    description: "The examiner's voice and generated listening audio.",
  },
};

function openDocs(url: string): void {
  if (!url) return;
  const bridge = typeof window !== "undefined" ? window.bandready : undefined;
  if (bridge?.openExternal) bridge.openExternal(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

function stateTone(state: string | undefined): "success" | "warning" | "destructive" | "default" {
  switch (state) {
    case "ready":
      return "success";
    case "needs_download":
    case "unconfigured":
      return "warning";
    case "unreachable":
    case "unauthorized":
    case "timeout":
    case "error":
      return "destructive";
    default:
      return "default";
  }
}

/**
 * The model list for this slot.
 *
 * Falls back to the flat `suggested_models` for presets that serve one modality, where the
 * two are the same list. The point of the per-modality version is the presets that serve
 * three: OpenRouter's chat models have no business appearing in the speech-to-text dropdown.
 */
function modelsFor(preset: Preset, modality: Modality): string[] {
  return preset.models_by_modality?.[modality] ?? preset.suggested_models ?? [];
}

export function ProviderSlotCard({ modality }: { modality: Modality }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const drafts = useSettingsFeatureStore((s) => s.drafts);
  const setField = useSettingsFeatureStore((s) => s.setField);
  const applyPreset = useSettingsFeatureStore((s) => s.applyPreset);
  const runVerify = useSettingsFeatureStore((s) => s.runVerify);
  const verifying = useSettingsFeatureStore((s) => s.verifying);
  const verify = useSettingsFeatureStore((s) => s.verify[modality]);
  const verifyError = useSettingsFeatureStore((s) => s.verifyError[modality]);
  const secretTouched = useSettingsFeatureStore((s) => s.secretTouched[modality]);
  const presets = useSettingsFeatureStore((s) => s.presets);
  const presetsFor = useSettingsFeatureStore((s) => s.presetsFor);
  const presetsError = useSettingsFeatureStore((s) => s.presetsError);

  const draft = drafts[modality];
  const available = useMemo(() => presetsFor(modality), [presetsFor, modality, presets]);
  const selected: Preset | undefined = available.find((p) => p.id === draft.preset);

  const options = useMemo(() => {
    const opts: { value: string; label: string; disabled?: boolean }[] = [];
    for (const preset of available) {
      if (preset.divider_before) {
        opts.push({ value: `__divider_${preset.id}`, label: "──────────", disabled: true });
      }
      opts.push({ value: preset.id, label: preset.label });
    }
    if (draft.preset && typeof draft.preset === "string" && !available.some((p) => p.id === draft.preset)) {
      opts.unshift({ value: draft.preset, label: `${draft.preset} (not in this build)` });
    }
    return opts;
  }, [available, draft.preset]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  /**
   * `POST /api/v1/providers/tts-preview` answers `audio/wav` bytes, so it needs a
   * raw fetch (the JSON client returns undefined for binary bodies).
   */
  const previewVoice = async () => {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const { baseUrl, token } = await api.contract();
      const res = await fetch(`${baseUrl}/api/v1/providers/tts-preview`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      if (!res.ok) {
        let detail = `the sidecar returned HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { detail?: string };
          if (body.detail) detail = body.detail;
        } catch {
          /* binary/empty error body */
        }
        throw new ApiError(res.status, "provider_error", detail);
      }
      const blob = await res.blob();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = URL.createObjectURL(blob);
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = objectUrlRef.current;
      await audio.play();
    } catch (err) {
      setPreviewError(
        err instanceof ApiError
          ? err.detail
          : "the voice preview could not be played on this machine",
      );
    } finally {
      setPreviewing(false);
    }
  };

  const specs: FieldSpec[] = selected?.config_spec ?? [];
  const connection = specs.filter((s) => (s.group ?? "connection") === "connection");
  const params = specs.filter((s) => s.group === "params");
  const models = verify?.models ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{TITLES[modality].title}</CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {TITLES[modality].description}
          </p>
        </div>
        {verify && (
          <Badge tone={verify.ok ? "success" : stateTone(verify.state)}>
            {verify.ok ? "Verified" : (verify.state ?? "not reachable")}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <Field
          label="Provider"
          hint={selected?.notes}
        >
          <Select
            aria-label={`${TITLES[modality].title} provider`}
            value={typeof draft.preset === "string" ? draft.preset : ""}
            options={options}
            placeholder={presetsError ? "Presets unavailable" : "Choose a provider…"}
            onChange={(id) => {
              const preset = available.find((p) => p.id === id);
              if (preset) applyPreset(modality, preset);
            }}
            disabled={options.length === 0}
          />
        </Field>

        {presetsError && (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">
            {presetsError}
          </p>
        )}

        {selected && (
          <div className="grid gap-4 sm:grid-cols-2">
            {connection.map((spec) => (
              <SpecField
                key={spec.key}
                spec={spec}
                draft={draft}
                verifiedModels={models}
                suggestedModels={modelsFor(selected, modality)}
                secretTouched={secretTouched}
                onChange={(key, value) => setField(modality, key, value)}
              />
            ))}
          </div>
        )}

        {params.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground"
            >
              {advancedOpen ? (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              )}
              Advanced
            </button>
            {advancedOpen && (
              <div className="mt-3 grid gap-4 border-t border-border pt-3 sm:grid-cols-2">
                {params.map((spec) => (
                  <SpecField
                    key={spec.key}
                    spec={spec}
                    draft={draft}
                    verifiedModels={models}
                    suggestedModels={selected ? modelsFor(selected, modality) : []}
                    secretTouched={secretTouched}
                    onChange={(key, value) => setField(modality, key, value)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <Button
            variant="outline"
            size="sm"
            loading={verifying === modality}
            disabled={!selected || verifying !== null}
            onClick={() => void runVerify(modality)}
          >
            <PlugZap className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Verify
          </Button>

          {modality === "tts" && selected && (
            <Button
              variant="ghost"
              size="sm"
              loading={previewing}
              onClick={() => void previewVoice()}
            >
              <PlayCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Preview voice
            </Button>
          )}

          {selected?.docs_url && (
            <Button variant="ghost" size="sm" onClick={() => openDocs(selected.docs_url as string)}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Provider docs
            </Button>
          )}

          {verify && (
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
              {verify.ok ? (
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
              )}
              <span>{verify.detail}</span>
              {typeof verify.latency_ms === "number" && verify.latency_ms > 0 && (
                <span className="tabular">· {verify.latency_ms} ms</span>
              )}
              {typeof verify.ttft_ms === "number" && (
                <span className="tabular">· first token {verify.ttft_ms} ms</span>
              )}
            </span>
          )}

          {verifyError && <span className="text-[13px] text-destructive">{verifyError}</span>}

          {previewError && <span className="text-[13px] text-destructive">{previewError}</span>}
        </div>

        {verify?.warnings && verify.warnings.length > 0 && (
          <ul className="space-y-1 text-[13px] text-warning">
            {verify.warnings.map((w) => (
              <li key={w}>· {w}</li>
            ))}
          </ul>
        )}

        {verify && !verify.ok && verify.state === "needs_download" && (
          <p className="text-[13px] text-muted-foreground">
            The weights for this engine are not on disk yet — download them in the Models
            section below.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
