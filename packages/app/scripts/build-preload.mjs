/**
 * Bundles Electron process-specific artifacts that cannot be loaded as raw
 * workspace ESM by Electron's Node runtime.
 *
 * Problem 1 — Extension-less imports: Workspace packages are compiled with
 * TypeScript's Bundler moduleResolution, which emits imports without .js
 * extensions. Node 20 strict-ESM requires explicit extensions, so bare dist
 * files fail with ERR_MODULE_NOT_FOUND.
 *
 * Problem 2 — Playwright loader injection: Playwright's _electron.launch injects
 * its loader with Node's -r flag (CommonJS require). This is incompatible with
 * an ESM main process ("type":"module" package). The loader silently fails to
 * intercept app.whenReady and the browser context is never established.
 *
 * Solution: Bundle both the preload and the main into self-contained CommonJS
 * bundles. CJS main works with Electron 31, avoids the ESM extension issue,
 * and is fully compatible with Playwright's -r loader injection.
 *
 * Only 'electron' and Node built-ins are left external; all workspace deps are
 * inlined. Vite is used because it is already a dev-dependency of @word/app.
 */

import { build } from 'vite';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

// Externals: only electron + Node built-ins. Everything workspace-internal
// is inlined so the bundle is self-contained at runtime.
const external = [
  'electron',
  /^node:/,
  'path',
  'fs',
  'os',
  'url',
  'crypto',
  'stream',
  'events',
  'util',
  'buffer',
  'child_process',
  'net',
  'http',
  'https',
  'zlib',
  'assert',
  'constants',
  'module',
  'worker_threads',
  'process',
];

// ── 1. Preload → CommonJS bundle ──────────────────────────────────────────────
// Sandboxed preloads must be CommonJS. Bundles @word/shell preload + all deps.
await build({
  root: appRoot,
  logLevel: 'warn',
  build: {
    lib: {
      entry: path.resolve(appRoot, '../../packages/shell/dist/preload/index.js'),
      formats: ['cjs'],
      fileName: () => 'index.cjs',
    },
    outDir: path.resolve(appRoot, 'dist/preload'),
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      external,
      output: { exports: 'named' },
    },
  },
  configFile: false,
});

console.log('Preload CJS bundle written to dist/preload/index.cjs');

// ── 2. Main process → CommonJS bundle ────────────────────────────────────────
// CJS main is required for Playwright's _electron.launch to work: Playwright
// injects its interceptor via Node -r (CommonJS require), which only runs
// before a CJS entry point, not an ESM one. Electron 31 supports CJS main.
// Output replaces the tsc-compiled index.js so package.json "main" stays valid.
await build({
  root: appRoot,
  logLevel: 'warn',
  build: {
    lib: {
      // Entry is the tsc-compiled app main (imports @word/shell, etc.).
      entry: path.resolve(appRoot, 'dist/main/index.js'),
      formats: ['cjs'],
      fileName: () => 'index.cjs',
    },
    outDir: path.resolve(appRoot, 'dist/main'),
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      external,
      output: {
        exports: 'named',
        // Wrap in IIFE-friendly CJS: the main is a side-effecting module,
        // not a library. Rollup wraps it correctly with formats:['cjs'].
        format: 'cjs',
      },
    },
  },
  configFile: false,
});

console.log('Main CJS bundle written to dist/main/index.cjs');
