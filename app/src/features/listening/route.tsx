import { Headphones } from "lucide-react";
import { defineFeatureRoute } from "@/lib/featureRoute";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import { ListeningHome, ListeningLayout } from "./page";
import { TestRunner } from "./components/TestRunner";
import { ReviewScreen } from "./components/ReviewScreen";
import { AccentDrill } from "./components/AccentDrill";
import { CoachPicker, ListeningCoach } from "./components/coach";
import { MockPreflight, MockReport, MockSitting } from "./components/mock";

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
    // The teaching layer: study one part outside an attempt. Read-only against the
    // content pack and the learner's own attempt ledger, so a crash costs nothing
    // and remounting is the right recovery.
    {
      path: "coach",
      element: (
        <FeatureErrorBoundary feature="listening coach">
          <CoachPicker />
        </FeatureErrorBoundary>
      ),
    },
    {
      path: "coach/:scriptId",
      element: (
        <FeatureErrorBoundary feature="listening coach">
          <ListeningCoach />
        </FeatureErrorBoundary>
      ),
    },
    // The mock paper. It reuses the attempt endpoints but is its own room: a
    // commitment screen that renders the audio before the clock starts, a sitting
    // with no teaching surface anywhere in it, and a report that leads with the raw
    // score and ends in the coach.
    {
      path: "mock",
      element: (
        <FeatureErrorBoundary feature="mock listening paper">
          <MockPreflight />
        </FeatureErrorBoundary>
      ),
    },
    {
      path: "mock/sitting/:attemptId",
      element: (
        <FeatureErrorBoundary
          feature="mock sitting"
          hint="The clock kept running and each part still plays only once. Every answer is autosaved on the local sidecar — reload to pick the paper up where it is."
        >
          <MockSitting />
        </FeatureErrorBoundary>
      ),
    },
    {
      path: "mock/report/:attemptId",
      element: (
        <FeatureErrorBoundary feature="mock listening report">
          <MockReport />
        </FeatureErrorBoundary>
      ),
    },
  ],
});
