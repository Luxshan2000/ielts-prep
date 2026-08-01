import { AudioLines } from "lucide-react";
import { defineFeatureRoute } from "@/lib/featureRoute";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import { PronPage } from "./page";

export default defineFeatureRoute({
  path: "/pronunciation",
  label: "Pronunciation",
  icon: AudioLines,
  // Grammar is 65 and Progress is 70: this belongs with the practice modules, not after
  // the reporting one.
  order: 66,
  element: (
    <FeatureErrorBoundary
      feature="pronunciation"
      hint="Nothing here is scored or saved against you, so reloading loses nothing."
    >
      <PronPage />
    </FeatureErrorBoundary>
  ),
});
