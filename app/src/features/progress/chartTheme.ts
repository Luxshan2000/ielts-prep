/**
 * Chart palette for the progress screen.
 *
 * Recharts writes colors into SVG *presentation attributes*, which do not
 * resolve `var(--token)` — so the values here are literal hex, selected per
 * theme rather than flipped automatically, and the same slot always means the
 * same skill in every chart on the page.
 *
 * Both columns were validated with the dataviz six-checks validator
 * (categorical, adjacent pairlist):
 *
 *   light  surface #ffffff → CVD ΔE 9.1 · normal ΔE 22.9 · lightness/chroma PASS
 *   dark   surface #1a1a1b → CVD ΔE 8.4 · normal ΔE 19.8 · contrast ≥ 3:1 PASS
 *
 * Light mode WARNs on contrast for the Writing (aqua) and Speaking (yellow)
 * slots, so the relief rule applies: the trajectory chart ships direct labels on
 * the final point of every line plus a "Show the numbers" data table. Do not
 * remove either — they are what makes those two hues legal on white.
 */

import { useEffect, useState } from "react";
import type { SkillKey } from "./types";

export type SeriesKey = SkillKey | "overall";

export interface ChartTheme {
  mode: "light" | "dark";
  /** One color per skill, fixed slot order — never cycled, never rank-based. */
  series: Record<SeriesKey, string>;
  grid: string;
  axis: string;
  axisText: string;
  target: string;
  surface: string;
  tooltipBorder: string;
  /** Translucent range-band fill for the selected skill. */
  bandFill: string;
}

const LIGHT: ChartTheme = {
  mode: "light",
  series: {
    listening: "#2a78d6", // slot 1 blue
    reading: "#eb6834", // slot 2 orange
    writing: "#1baf7a", // slot 3 aqua
    speaking: "#eda100", // slot 4 yellow
    overall: "#52514e", // neutral ink — the composite, not a 5th category
  },
  grid: "hsl(240 6% 90%)",
  axis: "hsl(240 6% 82%)",
  axisText: "hsl(240 4% 40%)",
  target: "hsl(240 5% 45%)",
  surface: "#ffffff",
  tooltipBorder: "hsl(240 6% 88%)",
  bandFill: "#2a78d6",
};

const DARK: ChartTheme = {
  mode: "dark",
  series: {
    listening: "#3987e5",
    reading: "#d95926",
    writing: "#199e70",
    speaking: "#c98500",
    overall: "#c3c2b7",
  },
  grid: "hsl(240 4% 20%)",
  axis: "hsl(240 4% 28%)",
  axisText: "hsl(240 5% 66%)",
  target: "hsl(240 5% 62%)",
  surface: "hsl(240 5% 10%)",
  tooltipBorder: "hsl(240 4% 22%)",
  bandFill: "#3987e5",
};

function currentMode(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * The palette for the theme currently applied to `<html>`. A MutationObserver
 * keeps charts in step with the theme toggle without coupling this module to the
 * settings store.
 */
export function useChartTheme(): ChartTheme {
  const [mode, setMode] = useState<"light" | "dark">(currentMode);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const sync = () => setMode(root.classList.contains("dark") ? "dark" : "light");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return mode === "dark" ? DARK : LIGHT;
}

/** Fixed y-domain for every band chart (10 §7: band axis pinned 4–9). */
export const BAND_DOMAIN: [number, number] = [4, 9];

/** 0.5-band gridlines across the whole axis. */
export const BAND_TICKS: number[] = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];
