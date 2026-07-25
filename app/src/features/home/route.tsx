import { Home } from "lucide-react";
import { defineFeatureRoute } from "@/lib/featureRoute";
import { HomePage } from "./page";

export default defineFeatureRoute({
  path: "/",
  label: "Home",
  icon: Home,
  order: 0,
  end: true,
  element: <HomePage />,
});
