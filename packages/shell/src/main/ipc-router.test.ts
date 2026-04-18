import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';

// --- Electron mock ---
const mockHandle = vi.fn();
const mockGetFocusedWindow = vi.fn().mockReturnValue(null);

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockHandle,
  },
  BrowserWindow: {
    getFocusedWindow: mockGetFocusedWindow,
  },
}));

// --- Handler mocks ---
vi.mock('./handlers/file.js', () => ({
  openDialog: vi.fn().mockResolvedValue({ cancelled: true }),
  saveDialog: vi.fn().mockResolvedValue({ cancelled: true }),
  readBytes: vi.fn().mockResolvedValue({ bytes: '', size: 0 }),
  writeBytes: vi.fn().mockResolvedValue({ ok: true, bytesWritten: 0 }),
}));

vi.mock('./handlers/print.js', () => ({
  toPDF: vi.fn().mockResolvedValue({ cancelled: true }),
}));

vi.mock('./handlers/app-info.js', () => ({
  appVersion: vi.fn().mockReturnValue({
    app: '0.0.0',
    electron: '31.0.0',
    chrome: '122.0.0',
    node: '20.0.0',
  }),
}));

vi.mock('./handlers/shell-open.js', () => ({
  shellOpenExternal: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('./logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Dynamic import AFTER all mocks are set up.
const { installIpcRouter } = await import('./ipc-router.js');
const { createLogger } = await import('./logger.js');

/**
 * Captures the registered ipcMain handlers for each channel by collecting
 * the callbacks passed to ipcMain.handle().
 */
function captureHandlers(): Map<string, (event: unknown, raw: unknown) => Promise<unknown>> {
  const map = new Map<string, (event: unknown, raw: unknown) => Promise<unknown>>();
  for (const call of mockHandle.mock.calls) {
    const [channel, fn] = call as [string, (event: unknown, raw: unknown) => Promise<unknown>];
    map.set(channel, fn);
  }
  return map;
}

describe('installIpcRouter', () => {
  beforeEach(() => {
    mockHandle.mockClear();
    installIpcRouter(createLogger());
  });

  it('registers a handle for every CHANNEL_NAME', async () => {
    const { CHANNEL_NAMES } = await import('@word/ipc-schema');
    const registeredChannels = new Set(mockHandle.mock.calls.map((c) => (c as [string])[0]));
    for (const name of CHANNEL_NAMES) {
      expect(registeredChannels.has(name)).toBe(true);
    }
  });

  it('calls the handler with parsed params when given valid input', async () => {
    const handlers = captureHandlers();
    const handler = handlers.get('app.version');
    expect(handler).toBeDefined();

    const result = await handler!({}, {});
    expect(result).toMatchObject({ app: expect.any(String) });
  });

  it('rejects with ZodError when given malformed payload', async () => {
    const handlers = captureHandlers();
    const handler = handlers.get('window.setTitle');
    expect(handler).toBeDefined();

    // title must be a string ≤512 chars; passing a number should fail.
    await expect(handler!({}, { title: 12345 })).rejects.toBeInstanceOf(ZodError);
  });

  it('rejects with ZodError when a required field is missing', async () => {
    const handlers = captureHandlers();
    const handler = handlers.get('file.readBytes');
    expect(handler).toBeDefined();

    // readBytes requires a path field.
    await expect(handler!({}, {})).rejects.toBeInstanceOf(ZodError);
  });
});
