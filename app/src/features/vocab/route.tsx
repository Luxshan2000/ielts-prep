import { Outlet } from "react-router-dom";
import { Library } from "lucide-react";
import { defineFeatureRoute } from "@/lib/featureRoute";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import { ReviewSessionPage } from "./components/ReviewSessionPage";
import { VocabPage } from "./page";

/** `/vocab` is a shell: the bank at the index, the review player one level down. */
function VocabLayout() {
  return <Outlet />;
}

export default defineFeatureRoute({
  path: "/vocab",
  label: "Vocabulary",
  icon: Library,
  order: 60,
  element: <VocabLayout />,
  children: [
    { path: "", index: true, element: <VocabPage /> },
    {
      // Six exercise renderers, audio playback and a grader run in here. A crash in
      // one card must not cost the learner the whole queue or the shell.
      path: "review",
      element: (
        <FeatureErrorBoundary
          feature="vocabulary review"
          hint="Every card you already rated was saved as you went, so nothing is lost — reloading returns you to the queue."
        >
          <ReviewSessionPage />
        </FeatureErrorBoundary>
      ),
    },
  ],
});
