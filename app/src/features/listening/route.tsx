import { Headphones } from "lucide-react";
import { defineFeatureRoute } from "@/lib/featureRoute";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import { ListeningHome, ListeningLayout } from "./page";
import { TestRunner } from "./components/TestRunner";
import { ReviewScreen } from "./components/ReviewScreen";
import { AccentDrill } from "./components/AccentDrill";

export default defineFeatureRoute({
  path: "/listening",
  label: "Listening",
  icon: Headphones,
  order: 50,
  element: <ListeningLayout />,
  children: [
    { index: true, path: "", element: <ListeningHome /> },
    {
      path: "test/:testId",
      element: (
        // Audio decoding and the answer sheet are the riskiest code in the app;
        // scope their failures to the player instead of the whole window.
        <FeatureErrorBoundary
          feature="listening test"
          hint="Your answers are autosaved to the local sidecar, so reloading this screen keeps them."
        >
          <TestRunner />
        </FeatureErrorBoundary>
      ),
    },
    {
      path: "part/:scriptId",
      element: (
        <FeatureErrorBoundary
          feature="listening practice"
          hint="Your answers are autosaved to the local sidecar, so reloading this screen keeps them."
        >
          <TestRunner />
        </FeatureErrorBoundary>
      ),
    },
    {
      path: "review/:attemptId",
      element: (
        <FeatureErrorBoundary feature="listening review">
          <ReviewScreen />
        </FeatureErrorBoundary>
      ),
    },
    { path: "accents", element: <AccentDrill /> },
  ],
});
