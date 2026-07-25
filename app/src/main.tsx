import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { bootstrapTheme } from "./lib/theme";
import "./styles/index.css";

// Apply the persisted theme BEFORE the first paint — no flash of the wrong theme.
bootstrapTheme();

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
