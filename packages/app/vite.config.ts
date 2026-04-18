import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // base './' emits relative asset paths (./assets/...) in index.html so
  // win.loadFile() works over the file:// protocol. Without this, Vite emits
  // absolute /assets/... paths which resolve to the filesystem root, not the
  // dist directory, causing ERR_FILE_NOT_FOUND in Electron.
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    target: 'chrome124',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    preserveSymlinks: false,
  },
});
