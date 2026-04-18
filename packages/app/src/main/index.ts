// Electron main process entry for @word/app. Composes @word/shell primitives.
import { app, BrowserWindow } from 'electron';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMainWindow } from '@word/shell';
import { installIpcRouter } from '@word/shell';
import { createLogger } from '@word/shell';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows();
    const first = wins[0];
    if (first) {
      if (first.isMinimized()) first.restore();
      first.focus();
    }
  });

  void app.whenReady().then(() => {
    const logger = createLogger();
    installIpcRouter(logger);

    // Preload lives alongside main in the compiled output.
    const preloadPath = path.resolve(__dirname, '../preload/index.cjs');
    const win = createMainWindow({ preloadPath });

    const devUrl = process.env['ELECTRON_DEV_URL'];
    if (devUrl) {
      void win.loadURL(devUrl);
    } else {
      // In production the renderer bundle is emitted by Vite into ../renderer
      const indexHtml = path.resolve(__dirname, '../renderer/index.html');
      void win.loadFile(indexHtml);
    }

    win.once('ready-to-show', () => win.show());
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
