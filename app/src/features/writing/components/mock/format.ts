/** Clock and minute formatting for the mock. Shared so the sitting and the report agree. */

/** `59:12`, and past zero `2:06 over`. Never a negative sign — it reads as a bug. */
export function clockLabel(seconds: number): string {
  const s = Math.abs(Math.round(seconds));
  const body = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return seconds < 0 ? `${body} over` : body;
}

/** `21 min` — the unit the report talks about time in. */
export function minutesLabel(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

/** `+6 min` / `−4 min` against a target, with a true minus sign. */
export function deltaMinutes(seconds: number, targetSeconds: number): string {
  const delta = Math.round((seconds - targetSeconds) / 60);
  if (delta === 0) return "on target";
  return delta > 0 ? `+${delta} min` : `−${Math.abs(delta)} min`;
}
