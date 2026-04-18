import { contextBridge, ipcRenderer } from 'electron';
import {
  CHANNEL_NAMES,
  EVENT_NAMES,
  type ChannelName,
  type EventName,
  type RequestOf,
  type ResponseOf,
  type EventOf,
} from '@word/ipc-schema';

/**
 * IPC timeout per ADR-0016: 30 s default, 120 s for heavy operations.
 * Heavy channels are those that may block on large file I/O or PDF generation.
 */
const HEAVY_CHANNELS = new Set<ChannelName>(['file.readBytes', 'file.writeBytes', 'print.toPDF']);
const DEFAULT_TIMEOUT_MS = 30_000;
const HEAVY_TIMEOUT_MS = 120_000;

function timeoutFor(channel: ChannelName): number {
  return HEAVY_CHANNELS.has(channel) ? HEAVY_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}

function isValidChannel(channel: string): channel is ChannelName {
  return (CHANNEL_NAMES as readonly string[]).includes(channel);
}

function isValidEvent(event: string): event is EventName {
  return (EVENT_NAMES as readonly string[]).includes(event);
}

/**
 * invoke wraps ipcRenderer.invoke with:
 * - channel allowlist validation (client-side, defence-in-depth)
 * - per-channel timeout per ADR-0016
 */
async function invoke<C extends ChannelName>(
  channel: C,
  req: RequestOf<C>,
): Promise<ResponseOf<C>> {
  if (!isValidChannel(channel)) {
    throw new Error(`Unknown IPC channel: ${String(channel)}`);
  }

  const timeoutMs = timeoutFor(channel);

  const timeoutPromise = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      reject(new Error(`IPC timeout on channel ${channel} after ${timeoutMs}ms`));
    }, timeoutMs);
    // Prevent the timer from keeping Node alive if the promise resolves first.
    // In the renderer there is no Node, but be defensive.
    if (typeof id === 'object' && id !== null && 'unref' in id) {
      (id as NodeJS.Timeout).unref();
    }
  });

  const result = await Promise.race([
    ipcRenderer.invoke(channel, req) as Promise<ResponseOf<C>>,
    timeoutPromise,
  ]);

  return result;
}

type EventCallback<E extends EventName> = (payload: EventOf<E>) => void;
type DisposeFunction = () => void;

/**
 * on attaches a listener for a typed main→renderer event.
 * Returns a dispose function that removes the listener.
 */
function on<E extends EventName>(event: E, cb: EventCallback<E>): DisposeFunction {
  if (!isValidEvent(event)) {
    throw new Error(`Unknown IPC event: ${String(event)}`);
  }

  const listener = (_: Electron.IpcRendererEvent, payload: unknown): void => {
    cb(payload as EventOf<E>);
  };

  ipcRenderer.on(event, listener);

  return () => {
    ipcRenderer.off(event, listener);
  };
}

/**
 * off removes a previously registered event listener.
 * Prefer using the dispose function returned by `on`. This overload exists
 * for callers that need to remove a named callback.
 */
function off<E extends EventName>(event: E, cb: EventCallback<E>): void {
  if (!isValidEvent(event)) {
    throw new Error(`Unknown IPC event: ${String(event)}`);
  }
  ipcRenderer.off(event, cb as unknown as Parameters<typeof ipcRenderer.off>[1]);
}

const wordAPI = { invoke, on, off } as const;

contextBridge.exposeInMainWorld('wordAPI', wordAPI);

// Exported so @word/app can derive the concrete type if needed.
export type WordApiImpl = typeof wordAPI;
