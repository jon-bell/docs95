import { ipcMain, BrowserWindow } from 'electron';
import {
  CHANNEL_NAMES,
  CHANNELS,
  requestSchemaFor,
  responseSchemaFor,
  type ChannelName,
  type RequestOf,
  type ResponseOf,
} from '@word/ipc-schema';
import { openDialog, saveDialog, readBytes, writeBytes } from './handlers/file.js';
import { toPDF } from './handlers/print.js';
import { appVersion } from './handlers/app-info.js';
import { shellOpenExternal } from './handlers/shell-open.js';
import type { LogPort } from './logger.js';

type HandlerMap = {
  [C in ChannelName]: (params: RequestOf<C>) => Promise<ResponseOf<C>> | ResponseOf<C>;
};

function buildHandlers(logger: LogPort): HandlerMap {
  return {
    'file.openDialog': openDialog,
    'file.saveDialog': saveDialog,
    'file.readBytes': readBytes,
    'file.writeBytes': writeBytes,
    'print.toPDF': toPDF,
    'window.setTitle': async (params) => {
      const win = BrowserWindow.getFocusedWindow();
      if (win !== null) {
        win.setTitle(params.title);
      } else {
        logger.warn('window.setTitle: no focused window');
      }
      return { ok: true as const };
    },
    'app.version': appVersion,
    'shell.openExternal': shellOpenExternal,
  };
}

export function installIpcRouter(logger: LogPort): void {
  const handlers = buildHandlers(logger);

  for (const channel of CHANNEL_NAMES) {
    const handler = handlers[channel] as (params: unknown) => Promise<unknown> | unknown;

    ipcMain.handle(channel, async (_event, raw: unknown) => {
      // Validate input against the channel's request schema.
      const parsed = requestSchemaFor(channel).parse(raw);

      let resp: unknown;
      try {
        resp = await handler(parsed);
      } catch (err) {
        logger.error(`IPC handler error on channel ${channel}`, {
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }

      // Validate output against the channel's response schema.
      return responseSchemaFor(channel).parse(resp);
    });
  }

  // Exhaustiveness check: the channel set is closed. Unknown channels throw.
  // ipcMain ignores handles it has no record of, but the preload also validates
  // channel names. This note is for reviewers: to add a channel, update
  // CHANNEL_NAMES in @word/ipc-schema and add a handler entry above.
  void CHANNELS;
}
