/**
 * What the browser edition shows when the page arrived without its token: opened from a
 * bookmark, typed by hand, or in a new tab, rather than through the launcher.
 *
 * The sidecar only puts the token in the page on the launcher's own visit (see
 * sidecar/bandready/server/web.py). Without it every API call would fail, and the app
 * would look broken rather than locked, so main.tsx renders this instead.
 */
export function OpenFromShortcut() {
  return (
    <main className="mx-auto mt-24 max-w-md px-6 font-sans leading-relaxed text-foreground">
      <h1 className="text-xl font-semibold">Open BandReady from its shortcut</h1>
      <p className="mt-3 text-muted-foreground">
        For your privacy, BandReady only opens through its shortcut, or by typing{" "}
        <code className="rounded bg-muted px-1">bandready</code> in a terminal. Close
        this tab and open BandReady again. Your work is all still there.
      </p>
    </main>
  );
}

/** True in the browser edition when this page was not opened by the launcher. */
export function needsLauncher(): boolean {
  const injected = typeof window !== "undefined" ? window.__BANDREADY_SIDECAR__ : undefined;
  return injected !== undefined && !injected.token;
}
