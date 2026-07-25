import { TrendingUp } from "lucide-react";
import { defineFeatureRoute } from "@/lib/featureRoute";
import { ProgressPage } from "./page";

export default defineFeatureRoute({
  path: "/progress",
  label: "Progress",
  icon: TrendingUp,
  order: 70,
  element: <ProgressPage />,
});
