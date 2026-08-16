import { BookOpen } from "lucide-react";
import { defineFeatureRoute } from "@/lib/featureRoute";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import { ReadingPage } from "./page";
import { ReadingBrowser } from "./components/ReadingBrowser";
import { ReadingPlayer } from "./components/ReadingPlayer";
import { ReadingReview } from "./components/ReadingReview";
import { ReadingHistory } from "./components/ReadingHistory";
import { CoachPicker, ReadingCoach } from "./components/coach";
import { DrillPractice } from "./components/drills";
import { MockPreflight, MockReport, MockSitting } from "./components/mock";

export default defineFeatureRoute({
  path: "/reading",
  label: "Reading",
  icon: BookOpen,
  order: 40,
  element: <ReadingPage />,
  children: [
    { path: "", index: true, element: <ReadingBrowser /> },
    {
      path: "attempt/:attemptId",
      element: (
        // A crash in one question renderer must not take down the shell mid-test.
        <FeatureErrorBoundary
          feature="reading test"
          hint="Your answers are autosaved to the local sidecar as you type, so reloading this screen picks up where you left off."
        >
          <ReadingPlayer />
        </FeatureErrorBoundary>
      ),
    },
    {
      path: "review/:attemptId",
      element: (
        <FeatureErrorBoundary feature="reading review">
          <ReadingReview />
        </FeatureErrorBoundary>
      ),
    },
    // The learner's own ledger. It reads three list endpoints and renders the shared
    // history screen, so a crash costs nothing and remounting is the right recovery.
    {
      path: "history",
      element: (
        <FeatureErrorBoundary feature="reading history">
          <ReadingHistory />
        </FeatureErrorBoundary>
      ),
    },
    // The teaching layer: study one passage outside an attempt. Read-only against
    // the content pack and the learner's own attempt ledger, so a crash costs
    // nothing and remounting is the right recovery.
    {
      path: "coach",
      element: (
        <FeatureErrorBoundary feature="reading coach">
          <CoachPicker />
        </FeatureErrorBoundary>
      ),
    },
    {
      path: "coach/:passageId",
      element: (
        <FeatureErrorBoundary feature="reading coach">
          <ReadingCoach />
        </FeatureErrorBoundary>
      ),
    },
    // Standalone drill practice: selection by trap rather than by question type,
    // items built from the authored teaching payload, and a reveal that opens per
    // item. Distinct from `DrillPane`, which is the type drill inside a scored
    // attempt and keeps its own route under `attempt/:attemptId`.
    {
      path: "drills",
      element: (
        <FeatureErrorBoundary feature="reading drills">
          <DrillPractice />
        </FeatureErrorBoundary>
      ),
    },
    // The mock paper. It reuses the attempt endpoints but is its own room: a
    // commitment screen, an hour with no teaching surface anywhere in it, and a
    // report that leads with the time split.
    {
      path: "mock",
      element: (
        <FeatureErrorBoundary feature="mock reading paper">
          <MockPreflight />
        </FeatureErrorBoundary>
      ),
    },
    {
      path: "mock/sitting/:attemptId",
      element: (
        <FeatureErrorBoundary
          feature="mock sitting"
          hint="The clock kept running. Every answer is autosaved on the local sidecar, so reload to pick the paper up where it is."
        >
          <MockSitting />
        </FeatureErrorBoundary>
      ),
    },
    {
      path: "mock/report/:attemptId",
      element: (
        <FeatureErrorBoundary feature="mock reading report">
          <MockReport />
        </FeatureErrorBoundary>
      ),
    },
  ],
});
