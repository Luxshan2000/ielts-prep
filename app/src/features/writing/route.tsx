import { PenLine } from "lucide-react";
import { defineFeatureRoute } from "@/lib/featureRoute";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import { WritingLayout } from "./page";
import { AttemptWorkspace } from "./components/AttemptWorkspace";
import { WritingCoach } from "./components/coach";
import { MockPreflight, MockReport, MockSitting } from "./components/mock";

export default defineFeatureRoute({
  path: "/writing",
  label: "Writing",
  icon: PenLine,
  order: 30,
  element: <WritingLayout />,
  children: [
    // One route for the whole attempt: the editor while it is a draft, the
    // evaluation report once it is scored (05 §3 and §6).
    {
      path: "attempt/:attemptId",
      element: (
        // The chart renderers and the annotated-essay overlay are the two places a
        // malformed pack row or an odd LLM payload can throw. Contain it here so the
        // draft stays reachable.
        <FeatureErrorBoundary
          feature="writing desk"
          hint="Your draft is autosaved to the local sidecar as you type, so reloading this screen picks it up again."
        >
          <AttemptWorkspace />
        </FeatureErrorBoundary>
      ),
    },
    // The teaching layer: study one prompt outside an attempt. Read-only against the
    // content pack and the learner's own history, so a crash costs nothing and the
    // default boundary reset (a remount) is the right recovery.
    {
      path: "coach/:promptId",
      element: (
        <FeatureErrorBoundary feature="writing coach">
          <WritingCoach />
        </FeatureErrorBoundary>
      ),
    },
    // The mock paper. It reuses the attempt endpoints but is its own room: a
    // commitment screen, an hour with no teaching surface anywhere in it, and a
    // report that leads with the time split.
    {
      path: "mock",
      element: (
        <FeatureErrorBoundary feature="mock writing paper">
          <MockPreflight />
        </FeatureErrorBoundary>
      ),
    },
    {
      path: "mock/sitting/:mockId",
      element: (
        <FeatureErrorBoundary
          feature="mock sitting"
          hint="The clock kept running. Both drafts are autosaved on the local sidecar. Reload to pick the sitting up where it is."
        >
          <MockSitting />
        </FeatureErrorBoundary>
      ),
    },
    {
      path: "mock/report/:mockId",
      element: (
        <FeatureErrorBoundary feature="mock writing report">
          <MockReport />
        </FeatureErrorBoundary>
      ),
    },
  ],
});
