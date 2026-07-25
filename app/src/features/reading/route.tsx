import { BookOpen } from "lucide-react";
import { defineFeatureRoute } from "@/lib/featureRoute";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import { ReadingPage } from "./page";
import { ReadingBrowser } from "./components/ReadingBrowser";
import { ReadingPlayer } from "./components/ReadingPlayer";
import { ReadingReview } from "./components/ReadingReview";

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
  ],
});
