import { Mic } from "lucide-react";
import { defineFeatureRoute } from "@/lib/featureRoute";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import { useSessionStore } from "@/stores";
import { SpeakingHome, SpeakingLayout } from "./page";
import { LiveSession } from "./LiveSession";
import { FeedbackReport } from "./FeedbackReport";
import { CoachPicker, TopicCoach } from "./components/teaching";

/**
 * The Speaking room's three sequential screens live behind one sidebar entry
 * (12 §6.2): the hub (device check + mode picker), the live call, and the report.
 * `SpeakingLayout` is just the `<Outlet />` those children render through.
 */
export default defineFeatureRoute({
  path: "/speaking",
  label: "Speaking",
  icon: Mic,
  order: 20,
  element: <SpeakingLayout />,
  children: [
    { path: "", index: true, element: <SpeakingHome /> },
    {
      path: "session/:sessionId",
      element: (
        // The live call owns a WebRTC peer connection and an events socket. If the
        // UI throws, drop those explicitly on reset — a bare remount would leak the
        // old socket and the learner would hear two examiners.
        <FeatureErrorBoundary
          feature="live speaking session"
          hint="The examiner call was stopped. Your recording so far is kept on disk — reload to return to the Speaking room and start again."
          onReset={() => useSessionStore.getState().detach()}
        >
          <LiveSession />
        </FeatureErrorBoundary>
      ),
    },
    {
      path: "report/:reportId",
      element: (
        <FeatureErrorBoundary feature="speaking report">
          <FeedbackReport />
        </FeatureErrorBoundary>
      ),
    },
    // The teaching layer: study a topic set outside a live call. Read-only against
    // the content pack and the learner's own history, so a crash here costs nothing
    // and the default boundary reset (a remount) is the correct recovery.
    {
      path: "coach",
      element: (
        <FeatureErrorBoundary feature="topic coach">
          <CoachPicker />
        </FeatureErrorBoundary>
      ),
    },
    {
      path: "coach/:cardSetId",
      element: (
        <FeatureErrorBoundary feature="topic coach">
          <TopicCoach />
        </FeatureErrorBoundary>
      ),
    },
  ],
});
