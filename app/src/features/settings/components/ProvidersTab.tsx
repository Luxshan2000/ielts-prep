import { DetectPanel } from "./DetectPanel";
import { ModelDownloads } from "./ModelDownloads";
import { ProviderSlotCard } from "./ProviderSlotCard";
import { RecommendedModels } from "./RecommendedModels";
import { MODALITIES } from "../store";

export function ProvidersTab() {
  return (
    <div className="space-y-4">
      <DetectPanel />
      <RecommendedModels />
      {MODALITIES.map((modality) => (
        <ProviderSlotCard key={modality} modality={modality} />
      ))}
      <ModelDownloads />
    </div>
  );
}
