import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Renderer-only config. Electron packaging (vite-plugin-electron, electron/main.ts,
// electron/preload.ts) is owned by the Electron agent and layered on top of this file's
// exported config in its own entry — do not add Electron plugins here.
export default defineConfig({
  plugins: [react()],
  // Relative base: Electron loads the built SPA from disk via file://.
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5273,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
