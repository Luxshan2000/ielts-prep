import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { bootstrapTheme } from "./lib/theme";
import "./styles/index.css";

// Apply the persisted theme BEFORE the first paint — no flash of the wrong theme.
bootstrapTheme();

/**
 * Last-resort diagnostics. Nothing here changes behaviour — React's error
 * boundaries own what the learner sees — but a rejection that reaches the window
 * would otherwise vanish silently in a packaged app, where there is no devtools
 * console open. Logging it with a clear prefix is what makes `sidecar.log`-style
 * bug reports possible on the renderer side too.
 */
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason as unknown;
  console.error(
    "[BandReady] unhandled promise rejection —",
    reason instanceof Error ? `${reason.name}: ${reason.message}` : reason,
    reason instanceof Error ? reason.stack : undefined,
  );
});

window.addEventListener("error", (event) => {
  if (event.error) console.error("[BandReady] uncaught error —", event.error);
});

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
