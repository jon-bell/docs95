import * as fs from 'fs';
import * as path from 'path';
import { dialog, app } from 'electron';
import type {
  OpenDialogRequest,
  OpenDialogResponse,
  SaveDialogRequest,
  SaveDialogResponse,
  ReadBytesRequest,
  ReadBytesResponse,
  WriteBytesRequest,
  WriteBytesResponse,
} from '@word/ipc-schema';
import { encodeBytes, decodeBytes } from '@word/ipc-schema';
import { isPathAllowed } from '../path-allowlist.js';

export async function openDialog(params: OpenDialogRequest): Promise<OpenDialogResponse> {
  const opts: Electron.OpenDialogOptions = { properties: ['openFile'] };
  if (params.title !== undefined) opts.title = params.title;
  if (params.filters !== undefined) opts.filters = params.filters;
  const result = await dialog.showOpenDialog(opts);

  if (result.canceled || result.filePaths.length === 0) {
    return { cancelled: true };
  }

  const chosen = result.filePaths[0];
  if (chosen === undefined) {
    return { cancelled: true };
  }

  return { cancelled: false, path: chosen };
}

export async function saveDialog(params: SaveDialogRequest): Promise<SaveDialogResponse> {
  const opts: Electron.SaveDialogOptions = {};
  if (params.title !== undefined) opts.title = params.title;
  if (params.defaultPath !== undefined) opts.defaultPath = params.defaultPath;
  if (params.filters !== undefined) opts.filters = params.filters;
  const result = await dialog.showSaveDialog(opts);

  if (result.canceled || result.filePath === undefined) {
    return { cancelled: true };
  }

  return { cancelled: false, path: result.filePath };
}

export async function readBytes(params: ReadBytesRequest): Promise<ReadBytesResponse> {
  if (!isPathAllowed(params.path)) {
    throw new Error(`Path not in allowed roots: ${path.basename(params.path)}`);
  }

  const data = await fs.promises.readFile(params.path);
  return {
    bytes: encodeBytes(new Uint8Array(data)),
    size: data.byteLength,
  };
}

export async function writeBytes(params: WriteBytesRequest): Promise<WriteBytesResponse> {
  if (!isPathAllowed(params.path)) {
    throw new Error(`Path not in allowed roots: ${path.basename(params.path)}`);
  }

  const data = Buffer.from(decodeBytes(params.bytes));
  const atomic = params.atomic !== false; // default true

  if (atomic) {
    const rand = Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
    const tmp = `${params.path}.tmp-${process.pid}-${rand}`;
    await fs.promises.writeFile(tmp, data);
    await fs.promises.rename(tmp, params.path);
  } else {
    await fs.promises.writeFile(params.path, data);
  }

  return { ok: true, bytesWritten: data.byteLength };
}

// Unused import suppression — app is used by openDialog's implicit BrowserWindow parent
void app;
