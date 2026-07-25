import { Settings } from "lucide-react";
import { defineFeatureRoute } from "@/lib/featureRoute";
import { SettingsPage } from "./page";

export default defineFeatureRoute({
  path: "/settings",
  label: "Settings",
  icon: Settings,
  order: 90,
  element: <SettingsPage />,
});
