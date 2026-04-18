// Zod-typed IPC schemas. Fleet agent owns the full surface.
// See overview.md rule 7 and electron.md. No ad-hoc channels anywhere.

import type { z } from 'zod';
import { encodeBytes, decodeBytes } from './helpers';

import * as fileSchemas from './channels/file';
import * as printSchemas from './channels/print';
import * as windowSchemas from './channels/window';
import * as appSchemas from './channels/app';
import * as shellSchemas from './channels/shell';
import * as eventSchemas from './channels/events';

export const IPC_VERSION = 1 as const;

// --- Channel Names ---

export const CHANNEL_NAMES = [
  'file.openDialog',
  'file.saveDialog',
  'file.readBytes',
  'file.writeBytes',
  'print.toPDF',
  'window.setTitle',
  'app.version',
  'shell.openExternal',
] as const;

export type ChannelName = (typeof CHANNEL_NAMES)[number];

// --- Event Names ---

export const EVENT_NAMES = ['menu.command', 'document.externalChange'] as const;

export type EventName = (typeof EVENT_NAMES)[number];

// --- Channels Object ---

export const CHANNELS = {
  'file.openDialog': {
    request: fileSchemas.openDialogRequest,
    response: fileSchemas.openDialogResponse,
  },
  'file.saveDialog': {
    request: fileSchemas.saveDialogRequest,
    response: fileSchemas.saveDialogResponse,
  },
  'file.readBytes': {
    request: fileSchemas.readBytesRequest,
    response: fileSchemas.readBytesResponse,
  },
  'file.writeBytes': {
    request: fileSchemas.writeBytesRequest,
    response: fileSchemas.writeBytesResponse,
  },
  'print.toPDF': {
    request: printSchemas.toPdfRequest,
    response: printSchemas.toPdfResponse,
  },
  'window.setTitle': {
    request: windowSchemas.setTitleRequest,
    response: windowSchemas.setTitleResponse,
  },
  'app.version': {
    request: appSchemas.versionRequest,
    response: appSchemas.versionResponse,
  },
  'shell.openExternal': {
    request: shellSchemas.openExternalRequest,
    response: shellSchemas.openExternalResponse,
  },
} as const;

// --- Events Object ---

export const EVENTS = {
  'menu.command': {
    payload: eventSchemas.menuCommandPayload,
  },
  'document.externalChange': {
    payload: eventSchemas.documentExternalChangePayload,
  },
} as const;

// --- Type Helpers ---

export type RequestOf<C extends ChannelName> = z.infer<(typeof CHANNELS)[C]['request']>;

export type ResponseOf<C extends ChannelName> = z.infer<(typeof CHANNELS)[C]['response']>;

export type EventOf<E extends EventName> = z.infer<(typeof EVENTS)[E]['payload']>;

// --- Schema Dispatch Functions ---

export function requestSchemaFor(channel: ChannelName) {
  return CHANNELS[channel].request;
}

export function responseSchemaFor(channel: ChannelName) {
  return CHANNELS[channel].response;
}

export function eventSchemaFor(event: EventName) {
  return EVENTS[event].payload;
}

// --- Exports ---

export { encodeBytes, decodeBytes };

// Re-export channel-specific types for convenience
export type {
  OpenDialogRequest,
  OpenDialogResponse,
  SaveDialogRequest,
  SaveDialogResponse,
  ReadBytesRequest,
  ReadBytesResponse,
  WriteBytesRequest,
  WriteBytesResponse,
} from './channels/file';

export type { ToPdfRequest, ToPdfResponse } from './channels/print';

export type { SetTitleRequest, SetTitleResponse } from './channels/window';

export type { VersionRequest, VersionResponse } from './channels/app';

export type { OpenExternalRequest, OpenExternalResponse } from './channels/shell';

export type { MenuCommandPayload, DocumentExternalChangePayload } from './channels/events';
