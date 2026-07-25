import type { ComponentType, ReactElement } from "react";
import type { LucideProps } from "lucide-react";

/** A lucide-react icon component (the only icon set the design system allows). */
export type FeatureIcon = ComponentType<LucideProps>;

export interface FeatureChildRoute {
  /** Path relative to the parent feature route. */
  path: string;
  element: ReactElement;
  /** Renders at the parent path when true (react-router `index` route). */
  index?: boolean;
  children?: FeatureChildRoute[];
}

/**
 * The contract every `app/src/features/<name>/route.tsx` default-exports.
 * `App.tsx` discovers these with `import.meta.glob('./features/*\/route.tsx')`
 * — never edit App.tsx or Sidebar.tsx to add navigation.
 */
export interface FeatureRoute {
  /** react-router path, e.g. "/speaking". */
  path: string;
  /** Sidebar label. Omit or leave empty to hide the route from the sidebar. */
  label?: string;
  /** lucide-react icon component shown in the sidebar. */
  icon?: FeatureIcon;
  /** Sidebar sort order (ascending). */
  order?: number;
  /** Element rendered at `path`. */
  element: ReactElement;
  /** Optional nested routes. */
  children?: FeatureChildRoute[];
  /** Match the path exactly for the sidebar active state (used by "/"). */
  end?: boolean;
}

/** Identity helper that gives feature authors type-checking at the export site. */
export function defineFeatureRoute(route: FeatureRoute): FeatureRoute {
  return route;
}
