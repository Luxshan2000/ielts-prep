import { Sparkles } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { useSettingsFeatureStore, type Modality, type RecommendedEntry } from "../store";

const MODALITY_LABEL: Record<Modality, string> = {
  llm: "Language model",
  stt: "Speech-to-text",
  tts: "Text-to-speech",
};

const TIER_COPY: Record<string, string> = {
  "8gb": "8 GB RAM",
  "16gb": "16 GB RAM",
  "32gb+": "32 GB RAM or more",
  unknown: "unknown hardware",
};

/**
 * 03 §7 — model suggestions keyed to the detected hardware tier. Served by the
 * sidecar when it exposes them, otherwise from the shipped table in `store.ts`
 * (the recommendations are static content, so the offline path is not degraded).
 */
export function RecommendedModels() {
  const recommended = useSettingsFeatureStore((s) => s.recommended);
  const source = useSettingsFeatureStore((s) => s.recommendedSource);
  const platform = useSettingsFeatureStore((s) => s.detectReport?.platform);
  const presetById = useSettingsFeatureStore((s) => s.presetById);
  const applyPreset = useSettingsFeatureStore((s) => s.applyPreset);
  const setField = useSettingsFeatureStore((s) => s.setField);

  if (!recommended || recommended.length === 0) return null;

  const tier = platform?.tier ?? "unknown";

  const use = (entry: RecommendedEntry) => {
    const preset = entry.preset ? presetById(entry.preset) : undefined;
    if (preset) applyPreset(entry.modality, preset);
    if (entry.preset_only) {
      const first = preset?.suggested_models?.[0];
      if (first) setField(entry.modality, "model", first);
      return;
    }
    setField(entry.modality, entry.modality === "tts" ? "voice" : "model", entry.model);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          Recommended for this machine
        </CardTitle>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Tuned for {TIER_COPY[tier] ?? tier}
          {platform?.apple_silicon ? " on Apple Silicon" : ""}. Band scoring is the harder
          job — it degrades noticeably below ~14B parameters.
          {source === "builtin" && " Shipped with the app; no network was used."}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {recommended.map((entry) => (
          <div
            key={`${entry.modality}-${entry.model}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border px-3 py-2.5"
          >
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {MODALITY_LABEL[entry.modality] ?? entry.modality}
            </span>
            <span className="font-mono text-[13px] text-foreground">
              {entry.preset_only
                ? (presetById(entry.preset)?.label ?? entry.model)
                : entry.model}
            </span>
            {entry.recommended && <Badge tone="primary">Default</Badge>}
            {entry.preset_only && <Badge tone="outline">cloud key</Badge>}
            {entry.note && (
              <span className="text-[13px] text-muted-foreground">{entry.note}</span>
            )}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => use(entry)}>
              Use this
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
