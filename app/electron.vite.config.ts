/**
 * SECOND vite config — builds ONLY the Electron main + preload bundles.
 * The renderer has its own `vite.config.ts`; this file must never touch it.
 *
 * Output: app/dist-electron/{main.js,preload.js} as CommonJS. A generated
 * `dist-electron/package.json` with `{"type":"commonjs"}` pins the module system,
 * because app/package.json declares `"type": "module"` while sandboxed Electron
 * preload scripts must be CJS.
 */
import { builtinModules } from 'node:module';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const nodeExternals = [
  'electron',
  'electron-updater',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

function emitCommonJsMarker(): Plugin {
  return {
    name: 'bandready-emit-cjs-marker',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'package.json',
        source: `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig({
  root: __dirname,
  plugins: [emitCommonJsMarker()],
  build: {
    outDir: path.resolve(__dirname, 'dist-electron'),
    emptyOutDir: true,
    target: 'node18',
    minify: false,
    sourcemap: true,
    reportCompressedSize: false,
    lib: {
      entry: {
        main: path.resolve(__dirname, 'electron/main.ts'),
        preload: path.resolve(__dirname, 'electron/preload.ts'),
      },
      formats: ['cjs'],
    },
    rollupOptions: {
      external: nodeExternals,
      output: {
        format: 'cjs',
        exports: 'auto',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
