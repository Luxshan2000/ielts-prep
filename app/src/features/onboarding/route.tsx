import { Rocket } from "lucide-react";
import { defineFeatureRoute } from "@/lib/featureRoute";
import { OnboardingPage } from "./page";

/** No `label` — onboarding stays out of the sidebar but is always reachable. */
export default defineFeatureRoute({
  path: "/onboarding",
  icon: Rocket,
  order: 900,
  element: <OnboardingPage />,
});
