import * as path from 'path';
import { BrowserWindow, session } from 'electron';

export interface CreateMainWindowOpts {
  /** Absolute path to the preload script. Defaults to sibling preload/index.js. */
  readonly preloadPath?: string;
}

/**
 * Content-Security-Policy per ADR-0017:
 * - style-src allows 'unsafe-inline' because React 18 emits inline style attributes
 *   for dynamic layout values (caret, selection overlays).
 * - script-src is strict: no 'unsafe-inline', no eval, self only.
 * - connect-src 'none' — renderer never fetches from the network.
 */
const CSP =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "font-src 'self' data:; " +
  "connect-src 'none'";

export function createMainWindow(opts: CreateMainWindowOpts = {}): BrowserWindow {
  const resolvedPreload = opts.preloadPath ?? path.resolve(__dirname, '../preload/index.js');

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: resolvedPreload,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  // Defence-in-depth CSP via response headers (HTML meta tag alone is not enough).
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    });
  });

  // Prevent white flash by only showing once content has rendered.
  win.once('ready-to-show', () => {
    win.show();
  });

  return win;
}
