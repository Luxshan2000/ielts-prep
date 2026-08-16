import { Settings } from "lucide-react";
import { defineFeatureRoute } from "@/lib/featureRoute";
import { SettingsDialog } from "./dialog";

// Settings is a dialog, but it is still a route: every "open Settings and paste your key"
// link in the app points at /settings, and the section links point at /settings?tab=X.
// Mounting the dialog from the route is what keeps those working, and what makes the
// browser Back button close it.
export default defineFeatureRoute({
  path: "/settings",
  label: "Settings",
  icon: Settings,
  order: 90,
  element: <SettingsDialog />,
});
