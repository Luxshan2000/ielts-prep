import { Outlet } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { defineFeatureRoute } from "@/lib/featureRoute";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import { BoardScreen } from "./components/BoardScreen";
import { PointScreen } from "./components/PointScreen";
import { SessionScreen } from "./components/SessionScreen";
import { GrammarPage } from "./page";

/** `/grammar` is a shell: the syllabus at the index, the rooms one level down. */
function GrammarLayout() {
  return <Outlet />;
}

export default defineFeatureRoute({
  path: "/grammar",
  label: "Grammar",
  icon: GraduationCap,
  order: 65,
  element: <GrammarLayout />,
  children: [
    { path: "", index: true, element: <GrammarPage /> },
    // One lesson. Read-only against the content pack and this learner's card, so
    // a crash costs nothing and remounting is the right recovery.
    {
      path: "point/:pointId",
      element: (
        <FeatureErrorBoundary feature="grammar lesson">
          <PointScreen />
        </FeatureErrorBoundary>
      ),
    },
    // The practice session. Fourteen item renderers and a grader run in here, and
    // every answer is written server-side the moment it is given — so a crash in
    // one renderer must not cost the learner the set, and reloading resumes it.
    {
      path: "practice",
      element: (
        <FeatureErrorBoundary
          feature="grammar practice"
          hint="Every answer you gave was saved as you gave it, so nothing is lost — starting the set again picks up from where the schedule now stands."
        >
          <SessionScreen />
        </FeatureErrorBoundary>
      ),
    },
    // A contrast board: the screen a learner returns to after getting the same
    // choice wrong in a real essay.
    {
      path: "board/:boardId",
      element: (
        <FeatureErrorBoundary feature="contrast board">
          <BoardScreen />
        </FeatureErrorBoundary>
      ),
    },
  ],
});
