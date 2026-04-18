import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window.js';
import { installIpcRouter } from './ipc-router.js';
import { createLogger } from './logger.js';

/**
 * Boots the Electron main process:
 * 1. Enforces single-instance lock.
 * 2. Waits for app.whenReady.
 * 3. Creates the main window.
 * 4. Installs the IPC router.
 * 5. Wires up platform lifecycle events.
 */
export function bootstrap(): void {
  const logger = createLogger();

  // Single-instance guard. If a second instance is launched, focus the first window.
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    logger.info('Second instance detected — quitting');
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    const windows = BrowserWindow.getAllWindows();
    const first = windows[0];
    if (first !== undefined) {
      if (first.isMinimized()) first.restore();
      first.focus();
    }
  });

  void app.whenReady().then(() => {
    logger.info('App ready — creating window');

    installIpcRouter(logger);

    const win = createMainWindow();

    // Load the renderer entry point. In dev, Vite serves on localhost; in
    // production, load the bundled file:// URL. The entry point is resolved
    // by @word/app — shell only creates the window.
    const devUrl = process.env['ELECTRON_DEV_URL'];
    if (devUrl !== undefined) {
      void win.loadURL(devUrl);
    }
    // Production loading is wired in @word/app which calls loadFile().

    app.on('activate', () => {
      // macOS: re-create window if dock icon clicked with no open windows.
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  // Quit when all windows are closed, except on macOS (dock behaviour).
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    logger.info('App before-quit');
  });
}
