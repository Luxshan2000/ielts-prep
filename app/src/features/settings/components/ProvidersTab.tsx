import { Fragment } from "react";
import { JobSection } from "./JobSection";
import { ModelDownloads } from "./ModelDownloads";
import { OpenRouterKeyCard } from "./OpenRouterKeyCard";
import { LOCAL_PRESET, OPENROUTER_PRESET, useSettingsFeatureStore, type Modality } from "../store";

/**
 * Three jobs, three choices.
 *
 * The order is the order they matter in: the examiner marks, the voice reads aloud, and the
 * microphone listens. Each one picks its own place to run, so marking through OpenRouter
 * with the voice and the microphone staying on this computer is one click, not a trip
 * through a screen of base URLs.
 */
const ORDER: Modality[] = ["llm", "tts", "stt"];

export function ProvidersTab() {
  const drafts = useSettingsFeatureStore((s) => s.drafts);
  const presetsError = useSettingsFeatureStore((s) => s.presetsError);

  const usesOpenRouter = ORDER.filter((m) => drafts[m].preset === OPENROUTER_PRESET);
  // The key card sits directly under the first job that needs it, rather than at the top or
  // the foot of the pane, so it is on screen where the learner just clicked. The pane is
  // short and it scrolls; a card two sections away is a card nobody finds.
  const keyAfter = usesOpenRouter[0];

  const needsWeights = ORDER.some(
    (m) => m !== "llm" && drafts[m].preset === LOCAL_PRESET[m],
  );

  return (
    <div className="space-y-4">
      {presetsError && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">
          {presetsError}
        </p>
      )}

      {ORDER.map((modality) => (
        <Fragment key={modality}>
          <JobSection modality={modality} />
          {modality === keyAfter && <OpenRouterKeyCard />}
        </Fragment>
      ))}

      {needsWeights && <ModelDownloads />}
    </div>
  );
}
