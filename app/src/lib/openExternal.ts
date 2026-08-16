/**
 * Send a URL out of BandReady and into the user's own browser.
 *
 * This is ONE function rather than the five private copies it replaced because
 * both of its lines are promises the app has to keep everywhere or not at all.
 * Inside a packaged Electron shell, a link that is not handed to the bridge
 * navigates the app's own window to a web page and there is no way back — so
 * the bridge check cannot be something a new call site remembers to write.
 * And `noopener,noreferrer` on the fallback is a security property: without it
 * the opened page gets a live `window.opener` handle back into the renderer.
 * Five copies meant five places to update when the bridge changes and five
 * places for the `rel` pair to be quietly dropped.
 *
 * Callers guard their own empty URLs; this does not.
 */
export function openExternal(url: string): void {
  const bridge = typeof window !== "undefined" ? window.bandready : undefined;
  if (bridge?.openExternal) bridge.openExternal(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
