// @word/shell — Electron main + preload. Re-exports the entry points consumed by @word/app.

export { createMainWindow } from './main/window.js';
export type { CreateMainWindowOpts } from './main/window.js';
export { installIpcRouter } from './main/ipc-router.js';
export { createLogger } from './main/logger.js';
export type { LogPort } from './main/logger.js';
export type { WordApi } from './types/index.js';
