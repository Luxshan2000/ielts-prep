import { Mic } from "lucide-react";
import { defineFeatureRoute } from "@/lib/featureRoute";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import { useSessionStore } from "@/stores";
import { SpeakingHome, SpeakingLayout } from "./page";
import { LiveSession } from "./LiveSession";
import { FeedbackReport } from "./FeedbackReport";
import { SessionTranscript } from "./SessionTranscript";
import { SpeakingHistoryPage } from "./history";
import { CoachPicker, TopicCoach } from "./components/teaching";
import {
  MockHistoryPage,
  MockPreflight,
  MockReport,
  MockSitting,
} from "./components/mock";

/**
 * The Speaking room's three sequential screens live behind one sidebar entry
 * (12 §6.2): the hub (device check + mode picker), the live call, and the report.
 * `SpeakingLayout` is just the `<Outlet />` those children render through.
 */
export default defineFeatureRoute({
  path: "/speaking",
  label: "Speaking",
  icon: Mic,
  order: 50,
  group: "skills",
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
          hint="The examiner call was stopped. Your recording so far is kept on disk. Reload to return to the Speaking room and start again."
          onReset={() => useSessionStore.getState().detach()}
        >
          <LiveSession />
        </FeatureErrorBoundary>
      ),
    },
    // Read a past conversation back. Declared before the report so the two screens that
    // can show a transcript sit together: this is the one for the three modes that are
    // never scored and therefore never get a report to show it in.
    {
      path: "session/:sessionId/transcript",
      element: (
        <FeatureErrorBoundary feature="speaking transcript">
          <SessionTranscript />
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
    // One searchable list of everything this room has recorded — mocks, single parts,
    // drills and chats alike. Reached from the header button, not from the foot of the
    // hub, which is where it used to be and where nobody found it.
    {
      path: "history",
      element: (
        <FeatureErrorBoundary feature="speaking history">
          <SpeakingHistoryPage />
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
    // The mock exam. It reuses the speaking session machinery but is its own room:
    // a commitment screen, a sitting with no teaching surface anywhere in it, a
    // whole-test report, and the history that makes the trend readable.
    {
      path: "mock",
      element: (
        <FeatureErrorBoundary feature="mock test">
          <MockPreflight />
        </FeatureErrorBoundary>
      ),
    },
    {
      path: "mock/sitting/:sessionId",
      element: (
        // Same rule as the practice call: the sitting owns a peer connection and an
        // events socket, so a crash must drop them explicitly rather than leave a
        // second examiner talking over the remount.
        <FeatureErrorBoundary
          feature="mock sitting"
          hint="The test was stopped. Everything you said up to that point is saved on disk. Reload to return to the mock room."
          onReset={() => useSessionStore.getState().detach()}
        >
          <MockSitting />
        </FeatureErrorBoundary>
      ),
    },
    {
      path: "mock/report/:reportId",
      element: (
        <FeatureErrorBoundary feature="mock test report">
          <MockReport />
        </FeatureErrorBoundary>
      ),
    },
    {
      path: "mock/history",
      element: (
        <FeatureErrorBoundary feature="mock test history">
          <MockHistoryPage />
        </FeatureErrorBoundary>
      ),
    },
  ],
});
