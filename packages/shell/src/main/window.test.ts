import { describe, it, expect, vi } from 'vitest';

// Capture the constructor argument passed to BrowserWindow.
let capturedOptions: Electron.BrowserWindowConstructorOptions | undefined;

const mockOnHeadersReceived = vi.fn();
const mockOnce = vi.fn();

const MockBrowserWindow = vi
  .fn()
  .mockImplementation((opts: Electron.BrowserWindowConstructorOptions) => {
    capturedOptions = opts;
    return {
      once: mockOnce,
      loadURL: vi.fn(),
      show: vi.fn(),
    };
  });

vi.mock('electron', () => ({
  BrowserWindow: MockBrowserWindow,
  session: {
    defaultSession: {
      webRequest: {
        onHeadersReceived: mockOnHeadersReceived,
      },
    },
  },
}));

const { createMainWindow } = await import('./window.js');

describe('createMainWindow', () => {
  it('creates a BrowserWindow with the required security preferences', () => {
    createMainWindow({ preloadPath: '/fake/preload/index.js' });

    expect(MockBrowserWindow).toHaveBeenCalledOnce();
    const prefs = capturedOptions?.webPreferences;
    expect(prefs).toBeDefined();
    expect(prefs!.contextIsolation).toBe(true);
    expect(prefs!.nodeIntegration).toBe(false);
    expect(prefs!.sandbox).toBe(true);
    expect(prefs!.webSecurity).toBe(true);
    expect(prefs!.spellcheck).toBe(false);
  });

  it('sets the preload path from opts', () => {
    const preloadPath = '/custom/preload/index.js';
    createMainWindow({ preloadPath });

    const prefs = capturedOptions?.webPreferences;
    expect(prefs!.preload).toBe(preloadPath);
  });

  it('installs a CSP header via onHeadersReceived', () => {
    createMainWindow({ preloadPath: '/fake/preload/index.js' });

    expect(mockOnHeadersReceived).toHaveBeenCalled();

    // Invoke the registered callback and verify the CSP header is set.
    const [callback] = mockOnHeadersReceived.mock.calls[
      mockOnHeadersReceived.mock.calls.length - 1
    ] as [
      (
        details: { responseHeaders: Record<string, string[]> },
        cb: (r: { responseHeaders: Record<string, string[]> }) => void,
      ) => void,
    ];

    let captured: Record<string, string[]> = {};
    callback({ responseHeaders: { 'content-type': ['text/html'] } }, (result) => {
      captured = result.responseHeaders;
    });

    expect(captured['Content-Security-Policy']).toBeDefined();
    const csp = captured['Content-Security-Policy']![0]!;
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain("connect-src 'none'");
  });

  it('does not enable nodeIntegrationInWorker', () => {
    createMainWindow({ preloadPath: '/fake/preload/index.js' });
    const prefs = capturedOptions?.webPreferences;
    // Should be falsy (undefined or false).
    expect(prefs!.nodeIntegrationInWorker).toBeFalsy();
  });
});
