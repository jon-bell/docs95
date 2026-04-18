import type { WordApi } from '@word/shell';

declare global {
  interface Window {
    /** Populated by the preload script when running inside Electron; undefined in the browser dev harness. */
    wordAPI?: WordApi;
  }
}

export {};
