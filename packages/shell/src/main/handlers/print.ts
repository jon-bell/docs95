import * as fs from 'fs';
import { BrowserWindow } from 'electron';
import type { ToPdfRequest, ToPdfResponse } from '@word/ipc-schema';
import { saveDialog } from './file.js';
import { writeBytes } from './file.js';
import { encodeBytes } from '@word/ipc-schema';

export async function toPDF(params: ToPdfRequest): Promise<ToPdfResponse> {
  const win = BrowserWindow.getFocusedWindow();
  if (win === null) {
    throw new Error('No focused window available for PDF export');
  }

  const opts = params.options ?? {};
  const pdfOptions: Electron.PrintToPDFOptions = {};
  if (opts.landscape !== undefined) pdfOptions.landscape = opts.landscape;
  if (opts.scale !== undefined) pdfOptions.scale = opts.scale;
  if (opts.marginsMM !== undefined) {
    pdfOptions.margins = {
      top: opts.marginsMM.top / 25.4, // mm → inches
      bottom: opts.marginsMM.bottom / 25.4,
      left: opts.marginsMM.left / 25.4,
      right: opts.marginsMM.right / 25.4,
    };
  }

  // Resolve destination path, prompting if not provided.
  let destPath: string;
  if (params.path !== undefined) {
    destPath = params.path;
  } else {
    const saved = await saveDialog({
      title: 'Export as PDF',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (saved.cancelled) {
      return { cancelled: true };
    }
    destPath = saved.path;
  }

  const pdfBuffer = await win.webContents.printToPDF(pdfOptions);
  const bytes = encodeBytes(new Uint8Array(pdfBuffer));

  await writeBytes({ path: destPath, bytes, atomic: true });

  const stat = await fs.promises.stat(destPath);
  return {
    cancelled: false,
    path: destPath,
    bytesWritten: stat.size,
  };
}
