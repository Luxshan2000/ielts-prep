import { useState } from "react";
import { Button } from "@/components/ui";
import { DetectPanel } from "./DetectPanel";
import { ModelDownloads } from "./ModelDownloads";
import { ProviderSlotCard } from "./ProviderSlotCard";
import { RecommendedModels } from "./RecommendedModels";
import { SimpleSetup } from "./SimpleSetup";
import { MODALITIES } from "../store";

const ADVANCED_KEY = "br-settings-advanced";

function readAdvanced(): boolean {
  try {
    return window.localStorage.getItem(ADVANCED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Two audiences, one tab.
 *
 * Everything below `SimpleSetup` is unchanged and still exactly what somebody wiring up a
 * local inference stack needs. But it was also the *default* — so a learner whose microphone
 * had stopped working landed on seven engine rows, three base-URL fields and five model
 * weights, and had no way to tell which of them was their problem. The simple view answers
 * the one question they actually have; this is one click away for the people who want it.
 */
export function ProvidersTab() {
  const [advanced, setAdvanced] = useState(readAdvanced);

  const show = (next: boolean) => {
    setAdvanced(next);
    try {
      window.localStorage.setItem(ADVANCED_KEY, next ? "1" : "0");
    } catch {
      /* storage disabled — the choice stays session-local */
    }
  };

  if (!advanced) return <SimpleSetup onAdvanced={() => show(true)} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => show(false)}>
          Back to simple settings
        </Button>
      </div>
      <DetectPanel />
      <RecommendedModels />
      {MODALITIES.map((modality) => (
        <ProviderSlotCard key={modality} modality={modality} />
      ))}
      <ModelDownloads />
    </div>
  );
}
