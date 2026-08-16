/**
 * Chart primitives for the Academic Task 1 renderer (05 §2.2).
 *
 * COLOR — the categorical palette below is the validated reference instance from
 * the house dataviz method, snapped to BandReady's two surfaces
 * (light `hsl(var(--card))` = #ffffff, dark = #18181a):
 *
 *   node scripts/validate_palette.js "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4" \
 *        --mode light --surface "#ffffff"      → ALL CHECKS PASS (1 contrast WARN)
 *   node scripts/validate_palette.js "#3987e5,#d95926,#199e70,#c98500,#d55181" \
 *        --mode dark  --surface "#18181a"      → ALL CHECKS PASS
 *
 * The light-mode contrast WARN (aqua/yellow/magenta below 3:1 on white) obligates
 * relief, which this renderer always ships: every mark carries a visible value or
 * end label, and every chart has a "View as table" toggle (12 §6 also requires the
 * table toggle for *every* chart). Slots are assigned in fixed order and never
 * cycled — 05 §2.2 clamps a spec to five series, and `ChartRenderer` forces the
 * table view rather than reusing a hue if a spec ever exceeds that.
 *
 * The band tokens (`--band-low` … `--band-strong`) are deliberately NOT used here:
 * 12 §1.1 reserves them for band semantics and forbids them as series colors.
 */

/** Maximum series a spec may paint (05 §2.2 validator clamp). */
export const SERIES_MAX = 5;

/**
 * Slot → Tailwind text-color pair. Marks read the slot through `currentColor`
 * (`fill="currentColor"` / `stroke="currentColor"` on the series `<g>`), so one
 * class drives fills, strokes and the legend swatch in both themes.
 */
export const SERIES_INK: readonly string[] = [
  "text-[#2a78d6] dark:text-[#3987e5]",
  "text-[#eb6834] dark:text-[#d95926]",
  "text-[#1baf7a] dark:text-[#199e70]",
  "text-[#eda100] dark:text-[#c98500]",
  "text-[#e87ba4] dark:text-[#d55181]",
];

export function seriesInk(index: number): string {
  return SERIES_INK[Math.min(Math.max(index, 0), SERIES_INK.length - 1)];
}

/** How many pie segments can be told apart: five hues × plain/hatched. */
export const SEGMENT_MAX = SERIES_MAX * 2;

export interface SegmentStyle {
  /** Tailwind text-color pair driving `currentColor`. */
  ink: string;
  /** Second encoding for slots 6–10, so no two segments share an appearance. */
  hatched: boolean;
}

/**
 * Pie segments, unlike series, routinely run to seven — more than the five
 * validated hues. The rule "assign categorical hues in fixed order, never
 * cycled" is kept by *not* inventing a sixth hue: slots 6–10 reuse the fixed
 * order with a 45° hatch laid over the fill, which is the same composite
 * encoding the palette's colour-vision-deficiency and print cases rely on. A
 * pie pair therefore stays readable when the same segment must be matched
 * across two rings.
 */
export function segmentStyle(index: number): SegmentStyle {
  const safe = Math.max(0, index);
  return { ink: seriesInk(safe % SERIES_MAX), hatched: safe >= SERIES_MAX };
}

/** CSS for a legend swatch that matches a hatched segment. */
export const HATCH_CSS =
  "repeating-linear-gradient(45deg, transparent 0 2px, hsl(var(--card)) 2px 3.5px)";

// ------------------------------------------------------------------ numbers ---

/** Locale thousands separators, at most one decimal, no trailing ".0". */
export function formatValue(value: number): string {
  if (!Number.isFinite(value)) return "-";
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** Axis-tick form: compact past 10 000 so ticks never collide ("12k", "1.2M"). */
export function formatTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
  if (abs >= 10_000) return `${Math.round(value / 100) / 10}k`;
  return formatValue(value);
}

function niceStep(rough: number): number {
  const exponent = Math.floor(Math.log10(rough));
  const magnitude = Math.pow(10, exponent);
  const fraction = rough / magnitude;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * magnitude;
}

export interface Scale {
  min: number;
  max: number;
  ticks: number[];
}

/**
 * Round tick values covering [dataMin, dataMax]. Explicit `y_axis.min`/`max`
 * from the spec win — the prompt author chose them and the learner must read the
 * chart the examiner intended.
 */
export function niceScale(
  dataMin: number,
  dataMax: number,
  forced: { min?: number; max?: number } = {},
  targetTicks = 5,
): Scale {
  let lo = Number.isFinite(forced.min as number) ? (forced.min as number) : Math.min(0, dataMin);
  let hi = Number.isFinite(forced.max as number) ? (forced.max as number) : dataMax;
  if (!Number.isFinite(lo)) lo = 0;
  if (!Number.isFinite(hi)) hi = 1;
  if (hi === lo) hi = lo + 1;
  if (hi < lo) [lo, hi] = [hi, lo];

  const step = niceStep((hi - lo) / Math.max(2, targetTicks));
  const min = Number.isFinite(forced.min as number) ? lo : Math.floor(lo / step) * step;
  const max = Number.isFinite(forced.max as number) ? hi : Math.ceil(hi / step) * step;

  const ticks: number[] = [];
  const decimals = step < 1 ? 2 : 0;
  for (let v = min; v <= max + step / 1000; v += step) {
    ticks.push(Number(v.toFixed(decimals)));
    if (ticks.length > 24) break;
  }
  if (ticks[ticks.length - 1] < max) ticks.push(max);
  return { min, max, ticks };
}

// -------------------------------------------------------------------- text ---

/** Inter's average advance width is ~0.52em; good enough to avoid clipping. */
export function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.54;
}

/** Hard-truncate with an ellipsis rather than let a label overflow its mark. */
export function truncateToWidth(text: string, maxWidth: number, fontSize: number): string {
  if (textWidth(text, fontSize) <= maxWidth) return text;
  const chars = Math.max(1, Math.floor(maxWidth / (fontSize * 0.54)) - 1);
  return `${text.slice(0, chars).trimEnd()}…`;
}

/**
 * Greedy word wrap to a pixel width, for SVG `<tspan>` label stacks. The final
 * allowed line absorbs whatever is left and is ellipsised, so a long label is
 * never silently dropped and never runs outside its box.
 */
export function wrapLines(text: string, maxWidth: number, fontSize: number, maxLines = 4): string[] {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < words.length; i += 1) {
    const candidate = current ? `${current} ${words[i]}` : words[i];
    if (current && textWidth(candidate, fontSize) > maxWidth) {
      if (lines.length === maxLines - 1) {
        const remainder = words.slice(i).join(" ");
        lines.push(truncateToWidth(`${current} ${remainder}`, maxWidth, fontSize));
        return lines;
      }
      lines.push(current);
      current = words[i];
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(truncateToWidth(current, maxWidth, fontSize));
  return lines;
}

/** Rounded-top bar path — 4px data-end radius, square at the baseline. */
export function barPath(x: number, y: number, w: number, h: number, radius = 4): string {
  const r = Math.max(0, Math.min(radius, w / 2, Math.abs(h)));
  if (h <= 0) return "";
  if (r === 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return [
    `M${x},${y + r}`,
    `a${r},${r} 0 0 1 ${r},${-r}`,
    `h${w - 2 * r}`,
    `a${r},${r} 0 0 1 ${r},${r}`,
    `v${h - r}`,
    `h${-w}`,
    "Z",
  ].join(" ");
}

export const AXIS_FONT = 11;
export const LABEL_FONT = 10.5;
/** 2px of surface between touching marks (stack segments, adjacent bars). */
export const SURFACE_GAP = 2;
