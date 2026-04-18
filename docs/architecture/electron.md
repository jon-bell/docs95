# Electron Platform Architecture

Scope: the desktop shell that hosts the Word 95 parity word processor. This document specifies the process model, IPC, preload surface, window management, native menu bridging, file I/O, printing, clipboard, auto-update, packaging, OS integration, logging, crash handling, configuration, testing, and security review discipline for the Electron layer. Editor core, layout engine, DOCX parser internals, and UI component library are covered in their respective architecture documents; this document only describes how those modules are *hosted* and *isolated* by Electron.

## 1. Goals and Non-Goals

### 1.1 Goals

1. Host the React renderer with maximum isolation: sandboxed, no node integration, context-isolated preload, strict CSP.
2. Expose a small, typed, validated IPC surface (`window.wp.*`) rather than arbitrary Node or Electron APIs.
3. Off-load CPU-heavy parse/serialize/spell/indexing into Electron `utilityProcess` children so that renderer stays responsive and a crash cannot take down the app.
4. Implement atomic file I/O semantics compatible with LibreOffice / Office conventions (lock files, atomic rename, autosave, recovery).
5. Provide feature-parity OS integration: Windows Jump List, macOS Dock menu, Linux `.desktop` MIME associations, native print dialog, OS notifications, OS color scheme detection.
6. Ship signed, notarized, auto-updating bundles with a well-defined rollback path.
7. Deliver deterministic, reproducible packaging for Windows (MSI/NSIS), macOS (DMG), and Linux (AppImage/deb/rpm/snap/flatpak).
8. Expose deterministic, testable surfaces for Playwright and Vitest.

### 1.2 Non-Goals

- Editor core behavior (see `editor.md`).
- Layout / line-breaking / page breaking (see `layout.md`).
- DOCX parse / serialize internals (see `docx.md` — we only host it).
- UI component library (see `ui.md`).
- Server-side collaboration (not in v1).
- Cloud storage providers beyond `IFileProvider` abstraction stubs (v2+).

### 1.3 Non-Negotiables

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` on **every** `BrowserWindow` and `<webview>` (we don't use `<webview>` but the rule stands).
- All IPC channels enumerated, typed, validated, and deny-by-default.
- No `remote` module; `@electron/remote` is not a dependency.
- No `eval`, no `new Function`, no dynamic `import()` of remote content.
- CSP enforced in HTML *and* via `session.webRequest.onHeadersReceived` as a defense-in-depth.
- Signed binaries on all three platforms.
- No third-party telemetry by default; all telemetry opt-in.

## 2. Process Topology

### 2.1 ASCII Diagram

```
+------------------------------------------------------------------------------+
|                                  USER OS                                     |
|   (Windows 10+, macOS 11+ arm64/x64, Linux glibc>=2.31 x64/arm64)            |
+------------------------------------------------------------------------------+
               |
               | launch
               v
+------------------------------------------------------------------------------+
|  MAIN PROCESS  (Node.js + Electron APIs, FULL privilege)                     |
|  packages/shell/src/main.ts                                                  |
|                                                                              |
|  - app lifecycle (ready, activate, before-quit, window-all-closed)           |
|  - single-instance lock + second-instance handler                            |
|  - window manager (creates BrowserWindows)                                   |
|  - IPC router: ipcMain.handle(channel, validated-handler)                    |
|  - native menu (macOS) + menu event bridge                                   |
|  - native dialogs (open, save, message)                                      |
|  - file I/O (atomic write, lock file, autosave, recovery)                    |
|  - printing: webContents.print / printToPDF                                  |
|  - auto-update (electron-updater)                                            |
|  - OS integration (jump list, dock menu, .desktop handling)                  |
|  - utility-process supervisor (spawn, health, respawn)                       |
|  - crashReporter configuration                                               |
|  - electron-log configuration                                                |
|  - preferences store (electron-store)                                        |
+------------------------------------------------------------------------------+
    |          |              |                |               |
    | ipc      | ipc          | spawn          | spawn         | spawn
    v          v              v                v               v
+---------+ +---------+ +-----------------+ +-------------+ +-----------------+
| PRELOAD | | PRELOAD | | UTILITY: parser | | UTILITY:    | | UTILITY:        |
| (ctx    | | (ctx    | | docx-parser.ts  | | spell-check | | indexer /       |
| iso'd,  | | iso'd,  | | CPU-heavy parse | | hunspell    | | macro-sanitizer |
| node)   | | node)   | | & serialize     | | WASM        | | bg tasks        |
+---------+ +---------+ +-----------------+ +-------------+ +-----------------+
    |          |
    |ctxBridge |ctxBridge
    v          v
+------------------+  +------------------+
| RENDERER Window 1|  | RENDERER Window 2|   ... each BrowserWindow
| (React + MDI)    |  | (React + MDI)    |
|                  |  |                  |
| - React root     |  | - React root     |
| - editor engine  |  | - editor engine  |
| - layout-worker  |  | - layout-worker  |  Web Workers
|   pool           |  |   pool           |  inside renderer
| - search-worker  |  | - search-worker  |
| - hyphen-worker  |  | - hyphen-worker  |
| - SANDBOXED      |  | - SANDBOXED      |
| - NO node        |  | - NO node        |
| - strict CSP     |  | - strict CSP     |
+------------------+  +------------------+
```

### 2.2 Process Roles

| Process | Privilege | Lifetime | Purpose |
|---|---|---|---|
| **Main** | Full (Node + Electron) | App lifetime | Privileged operations, IPC router, window & process supervisor |
| **Preload** | Node, context-isolated | Per renderer | Expose typed, validated API via `contextBridge` to renderer world |
| **Renderer** | Sandboxed (Chromium-only) | Per window | React UI + editor engine + renderer workers |
| **Utility: docx-parser** | Node (restricted) | Per-doc-load (pool) | Parse / serialize DOCX off main thread |
| **Utility: spell-check** | Node (restricted) | App lifetime (per language) | Hunspell WASM for spell checking |
| **Utility: indexer** | Node (restricted) | On demand | Background Find-all index builder |
| **Utility: macro-sanitizer** | Node (restricted) | Per-doc-load | Inspects `vbaProject.bin` to classify risk (never executes) |
| **Web Worker: layout** | Sandboxed | App lifetime (pool, in renderer) | Paragraph layout |
| **Web Worker: search** | Sandboxed | On demand | Find/Replace streaming on large docs |
| **Web Worker: hyphen** | Sandboxed | App lifetime | Liang-Knuth hyphenation |

### 2.3 Why This Topology

- **Separation of concerns.** Only main touches the filesystem, the OS, native dialogs, printers, or the network. Renderer touches none of these directly. Utility processes touch compute-only; they cannot even open files other than those handed to them as byte buffers by main.
- **Crash domains.** A `utilityProcess` crash is contained: main respawns with backoff. A renderer crash takes one window; autosave restores the document. A main crash is terminal but minidump-reported and autosave remains intact.
- **Parallelism.** Parse (`unzip` + XML walk) and layout (line breaking) benefit from multicore execution. Hunspell suggestion ranking is embarrassingly parallel.
- **Security surface minimization.** The renderer is the largest attack surface (it renders user content, including pasted HTML). Because it is sandboxed and isolated, a successful exploit yields a Chromium renderer process with no filesystem or network privileges beyond the CSP allow-list (which is `self` only).

### 2.4 Why Not `fork` or `child_process.spawn`

- `utilityProcess` is Electron's blessed, integrated pathway: inherits command-line switches, survives single-instance migration, integrates with crashReporter, provides `MessagePortMain` for transferable binary payloads (essential for sending large `ArrayBuffer`s without copy).
- Node's `child_process.fork` lacks minidump integration and requires manual handling of the Electron environment.
- Worker Threads in main would not isolate crashes — a parser bug could still crash main.

### 2.5 Why In-Renderer Web Workers for Layout

- Layout must call into shared data structures (the editor model). Utility-process layout would require massive structured-clone overhead per paragraph. Web Workers in the renderer share memory cheaply via `SharedArrayBuffer` (gated behind cross-origin isolation) or via `Transferable`.
- Renderer crash domain already includes the document — if layout corrupts memory, the crash is no worse than a native renderer crash.

## 3. Security Baseline

### 3.1 BrowserWindow webPreferences (authoritative)

```ts
// packages/shell/src/windows.ts
import { BrowserWindow, session } from "electron";
import * as path from "path";

export function createMainWindow(preloadPath: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    show: false, // show on ready-to-show to avoid white flash
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      enableBlinkFeatures: "",
      disableBlinkFeatures: "Auxclick", // drop middle-click in our UI
      spellcheck: false, // we provide our own
      webgl: false, // we don't need it; reduces attack surface
      plugins: false,
      javascript: true,
      images: true,
      defaultEncoding: "UTF-8",
      safeDialogs: true,
      safeDialogsMessage: "This site is spamming dialogs.",
      autoplayPolicy: "user-gesture-required",
      navigateOnDragDrop: false
    }
  });
  hardenSession(win);
  return win;
}
```

### 3.2 Session Hardening

```ts
function hardenSession(win: BrowserWindow) {
  const s = win.webContents.session;

  // Deny permission requests (camera, microphone, geolocation, notifications-from-web, etc.)
  s.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  s.setPermissionCheckHandler(() => false);

  // Block any navigation away from our app://
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("app://")) { e.preventDefault(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void (async () => {
      const { shell } = await import("electron");
      if (/^https?:\/\//.test(url)) await shell.openExternal(url);
    })();
    return { action: "deny" };
  });

  // Defense-in-depth CSP (in addition to <meta> in HTML)
  s.webRequest.onHeadersReceived((details, cb) => {
    const csp =
      "default-src 'none'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; " +
      "font-src 'self' data:; " +
      "connect-src 'self'; " +
      "frame-ancestors 'none'; " +
      "base-uri 'none'; " +
      "form-action 'none'; " +
      "object-src 'none'";
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
        "X-Content-Type-Options": ["nosniff"],
        "X-Frame-Options": ["DENY"],
        "Referrer-Policy": ["no-referrer"],
        "Cross-Origin-Opener-Policy": ["same-origin"],
        "Cross-Origin-Embedder-Policy": ["require-corp"],
        "Cross-Origin-Resource-Policy": ["same-origin"]
      }
    });
  });
}
```

The CSP permits `'unsafe-inline'` only for `style-src` because React inline styles are unavoidable; we never allow inline scripts. All scripts load from `app://` via the custom protocol handler.

### 3.3 Custom Protocol

The renderer is served from `app://bundle/` via a custom protocol registered in main:

```ts
// packages/shell/src/protocol.ts
import { protocol, net } from "electron";
import * as path from "path";

export function registerAppProtocol(resourcesDir: string) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "app",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
        stream: true
      }
    }
  ]);

  protocol.handle("app", (req) => {
    const url = new URL(req.url);
    if (url.hostname !== "bundle") return new Response(null, { status: 404 });
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    // Path normalization — prevent traversal
    const resolved = path.normalize(path.join(resourcesDir, relative));
    if (!resolved.startsWith(resourcesDir)) {
      return new Response(null, { status: 403 });
    }
    return net.fetch("file://" + resolved);
  });
}
```

We do **not** use `file://` for the renderer because `file://` treats every file as a different origin which breaks origin-based storage partitioning.

### 3.4 Remote Content and Navigation

- No remote content is loaded in the renderer. All assets are bundled.
- `webContents.on('will-navigate')` denies every navigation except our `app://` origin.
- `setWindowOpenHandler` returns `{ action: 'deny' }` for `window.open`, and if the URL is HTTP/HTTPS it is handed to `shell.openExternal` after validation.

### 3.5 No Debugger in Production

```ts
if (process.env.NODE_ENV === "production") {
  app.commandLine.appendSwitch("disable-features", "RemoteDebugging");
  app.on("remote-debugging-port-changed", () => { app.quit(); });
}
```

### 3.6 OS Spellcheck Off

```ts
webPreferences.spellcheck = false;
session.defaultSession.setSpellCheckerEnabled(false);
```

Our spellcheck runs in a `utilityProcess` using Hunspell WASM; user dictionaries live in the user config folder.

### 3.7 `--inspect` Disabled in Production

The Electron binary disables `--inspect` via `app.commandLine.appendSwitch` in production builds. We also check `process.argv` at startup and exit with a non-zero code if inspect flags are present.

### 3.8 Fuse Flags (Electron Fuses)

Disable at build time via `@electron/fuses`:
- `runAsNode: false` (prevents use of ELECTRON_RUN_AS_NODE)
- `enableCookieEncryption: true`
- `enableNodeOptionsEnvironmentVariable: false`
- `enableNodeCliInspectArguments: false`
- `enableEmbeddedAsarIntegrityValidation: true`
- `onlyLoadAppFromAsar: true`
- `loadBrowserProcessSpecificV8Snapshot: false`
- `grantFileProtocolExtraPrivileges: false`

These are baked into the final binary during packaging; tampering invalidates ASAR integrity.

### 3.9 Summary Hardening Checklist

- [ ] `contextIsolation: true` on every window.
- [ ] `sandbox: true` on every window.
- [ ] `nodeIntegration: false` on every window.
- [ ] `webSecurity: true` (never disabled, not even in dev).
- [ ] CSP in HTML and headers.
- [ ] No eval, no Function constructor, no dynamic script injection.
- [ ] No `@electron/remote`, no deprecated `remote`.
- [ ] Window open handler denies all, channels to `shell.openExternal` when appropriate.
- [ ] Navigation handler denies leaving origin.
- [ ] Permission handler denies every request.
- [ ] Fuses set.
- [ ] Binaries signed + notarized.
- [ ] ASAR integrity validated at runtime.

## 4. IPC Design

### 4.1 Principles

1. **Typed, versioned schema.** Every channel has a zod schema for request and response; the same schema is used in main (handler-side validation) and preload (argument-side validation).
2. **Deny-by-default.** Channels not registered in the router reject immediately. No wildcards, no string interpolation of channel names from renderer input.
3. **Namespaced channel names.** `"<namespace>.<action>"` — never nested dots, never dynamic.
4. **Promise-based `invoke` for request-response; `on`/`send` for events.** We do not use `ipcRenderer.sendSync` (blocks renderer).
5. **Uniform envelope.** Every response is `{ ok: true, data } | { ok: false, error }`. Renderer client unwraps and throws typed errors.
6. **MessagePorts for streams.** Large document byte transfers use `MessagePortMain` to avoid structured clone overhead.

### 4.2 Channel Catalogue

Request/response (renderer → main, main answers):

| Channel | Purpose |
|---|---|
| `file.open` | Open the native file dialog, read the selected file, return bytes. |
| `file.openPath` | Open a known-path file (used by drag-drop / file assoc). |
| `file.save` | Save bytes to an existing path atomically. |
| `file.saveAs` | Show save dialog, then save. |
| `file.exists` | Query existence + size without reading. |
| `file.lockAcquire` | Create `.~lock.*#` marker. |
| `file.lockRelease` | Remove marker. |
| `file.lockCheck` | Read marker; return holder info if present. |
| `file.recentList` | Return recent files list. |
| `file.recentClear` | Clear recent files list. |
| `file.revealInFolder` | Show item in Explorer / Finder / file manager. |
| `autosave.write` | Write an autosave snapshot. |
| `autosave.list` | List orphan autosaves on startup. |
| `autosave.discard` | Delete an autosave file. |
| `window.new` | Create a new BrowserWindow (SDI mode). |
| `window.close` | Request close (fires save-confirm flow). |
| `window.minimize` / `window.maximize` / `window.restore` | Window control. |
| `window.setTitle` | Update OS title bar text. |
| `print.print` | Invoke native print dialog. |
| `print.toPdf` | Render current document to PDF. |
| `menu.setState` | Renderer publishes enabled/checked state for menu items. |
| `update.check` | Force update check. |
| `update.downloadAndRestart` | Install pending update. |
| `update.status` | Query current state. |
| `shell.openExternal` | URL-validated external open. |
| `shell.showItemInFolder` | Reveal file. |
| `dialog.message` | Show native message box. |
| `dialog.openFile` | Native open dialog (no read). |
| `dialog.saveFile` | Native save dialog. |
| `clipboard.read` | Read multi-format clipboard. |
| `clipboard.write` | Write multi-format clipboard. |
| `crash.report` | Submit a renderer-captured crash context. |
| `prefs.get` / `prefs.set` / `prefs.reset` | Preferences CRUD. |
| `telemetry.emit` | Opt-in event emission. |
| `util.spellcheck.check` | Call spell-check utility. |
| `util.spellcheck.suggest` | Get suggestions. |
| `util.spellcheck.addWord` | Add to user dictionary. |
| `util.parse.docx` | Parse DOCX bytes. |
| `util.serialize.docx` | Serialize document to DOCX bytes. |
| `util.indexer.build` | Build find-all index. |
| `util.macro.sanitize` | Inspect `vbaProject.bin` and return risk classification. |

Event channels (main → renderer):

| Channel | Purpose |
|---|---|
| `menu.command` | Native menu click dispatched by name. |
| `file.dropped` | User dropped file paths on window. |
| `file.openExternal` | File-assoc / `open-file` on macOS, `second-instance` with args elsewhere. |
| `print.started` / `print.completed` / `print.error` | Print lifecycle. |
| `update.checking` / `update.available` / `update.notAvailable` / `update.downloaded` / `update.error` | Update lifecycle. |
| `prefs.changed` | Reactive preferences update. |
| `theme.changed` | OS color scheme change. |
| `window.focus` / `window.blur` | Focus change (for menu state recalc). |
| `autosave.tick` | Main-scheduled autosave prompt. |

### 4.3 Schema Module

```ts
// packages/ipc-schema/src/index.ts
import { z } from "zod";

// --- primitive shapes ---
export const PathStr = z.string().min(1).max(32_768);
export const Bytes = z.instanceof(Uint8Array);

export const ErrorShape = z.object({
  code: z.enum([
    "E_NOT_FOUND", "E_PERMISSION", "E_IO", "E_LOCKED",
    "E_PARSE", "E_SERIALIZE", "E_DIALOG_CANCELED",
    "E_UNKNOWN", "E_VALIDATION", "E_TIMEOUT",
    "E_UTIL_CRASHED", "E_PRINT", "E_UPDATE", "E_BAD_CHANNEL"
  ]),
  message: z.string(),
  cause: z.string().optional(),
  path: z.string().optional()
});
export type ErrorShape = z.infer<typeof ErrorShape>;

export const Envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: ErrorShape })
  ]);

// --- file.* ---
export const FileOpenReq = z.object({
  startDir: PathStr.optional(),
  filters: z.array(z.object({
    name: z.string(),
    extensions: z.array(z.string())
  })).optional()
});
export const FileOpenRes = z.object({
  path: PathStr,
  mtimeMs: z.number(),
  size: z.number().int().nonnegative(),
  bytes: Bytes,
  readOnly: z.boolean()
});

export const FileOpenPathReq = z.object({ path: PathStr });
export const FileOpenPathRes = FileOpenRes;

export const FileSaveReq = z.object({
  path: PathStr,
  bytes: Bytes,
  overwriteMtime: z.number().optional() // conflict detection
});
export const FileSaveRes = z.object({
  path: PathStr,
  mtimeMs: z.number(),
  size: z.number().int().nonnegative()
});

export const FileSaveAsReq = z.object({
  suggestedName: PathStr.optional(),
  bytes: Bytes,
  filters: z.array(z.object({
    name: z.string(),
    extensions: z.array(z.string())
  })).optional()
});
export const FileSaveAsRes = FileSaveRes;

export const FileExistsReq = z.object({ path: PathStr });
export const FileExistsRes = z.object({
  exists: z.boolean(),
  size: z.number().int().nonnegative().optional(),
  mtimeMs: z.number().optional()
});

export const LockAcquireReq = z.object({ path: PathStr });
export const LockAcquireRes = z.object({ acquired: z.boolean(), holder: z.string().optional() });

export const LockReleaseReq = z.object({ path: PathStr });
export const LockReleaseRes = z.object({ released: z.boolean() });

export const LockCheckReq = z.object({ path: PathStr });
export const LockCheckRes = z.object({
  locked: z.boolean(),
  holder: z.string().optional(),
  acquiredAt: z.number().optional()
});

export const RecentListReq = z.object({});
export const RecentEntry = z.object({
  path: PathStr,
  displayName: z.string(),
  lastOpenedMs: z.number(),
  pinned: z.boolean()
});
export const RecentListRes = z.object({ entries: z.array(RecentEntry) });

export const RecentClearReq = z.object({});
export const RecentClearRes = z.object({ cleared: z.boolean() });

// --- autosave.* ---
export const AutosaveWriteReq = z.object({
  docId: z.string().uuid(),
  originalPath: PathStr.optional(),
  bytes: Bytes,
  rev: z.number().int().nonnegative()
});
export const AutosaveWriteRes = z.object({ path: PathStr, rev: z.number() });

export const AutosaveListReq = z.object({});
export const AutosaveListRes = z.object({
  entries: z.array(z.object({
    path: PathStr,
    docId: z.string().uuid(),
    originalPath: PathStr.optional(),
    mtimeMs: z.number(),
    size: z.number()
  }))
});

export const AutosaveDiscardReq = z.object({ path: PathStr });
export const AutosaveDiscardRes = z.object({ discarded: z.boolean() });

// --- window.* ---
export const WindowNewReq = z.object({
  openPath: PathStr.optional()
});
export const WindowNewRes = z.object({ id: z.number().int() });

export const WindowCloseReq = z.object({});
export const WindowCloseRes = z.object({ closed: z.boolean() });

export const WindowSetTitleReq = z.object({ title: z.string().max(1024) });
export const WindowSetTitleRes = z.object({ ok: z.boolean() });

// --- print.* ---
export const PrintPrintReq = z.object({
  silent: z.boolean().default(false),
  printBackground: z.boolean().default(true),
  deviceName: z.string().optional(),
  color: z.boolean().default(true),
  landscape: z.boolean().optional(),
  scaleFactor: z.number().min(10).max(200).optional(),
  pagesPerSheet: z.union([
    z.literal(1), z.literal(2), z.literal(4), z.literal(6), z.literal(9), z.literal(16)
  ]).optional(),
  collate: z.boolean().default(true),
  copies: z.number().int().min(1).max(999).default(1),
  pageRanges: z.array(z.object({ from: z.number().int(), to: z.number().int() })).optional(),
  duplexMode: z.enum(["simplex", "shortEdge", "longEdge"]).optional(),
  dpi: z.object({ horizontal: z.number(), vertical: z.number() }).optional(),
  headerFooter: z.object({
    title: z.string().optional(),
    url: z.string().optional()
  }).optional()
});
export const PrintPrintRes = z.object({ jobId: z.string() });

export const PrintToPdfReq = z.object({
  destination: PathStr.optional(),
  printBackground: z.boolean().default(true),
  landscape: z.boolean().optional(),
  pageRanges: z.string().optional(), // Electron accepts "1-3,5"
  margins: z.object({
    top: z.number().optional(),
    bottom: z.number().optional(),
    left: z.number().optional(),
    right: z.number().optional()
  }).optional(),
  pageSize: z.union([
    z.enum(["A3","A4","A5","Legal","Letter","Tabloid"]),
    z.object({ width: z.number(), height: z.number() })
  ]).optional(),
  preferCSSPageSize: z.boolean().default(true)
});
export const PrintToPdfRes = z.object({ path: PathStr, bytes: Bytes.optional() });

// --- menu.* ---
export const MenuItemState = z.object({
  id: z.string().min(1).max(256),
  enabled: z.boolean().optional(),
  checked: z.boolean().optional(),
  label: z.string().optional(),
  accelerator: z.string().optional(),
  visible: z.boolean().optional()
});
export const MenuSetStateReq = z.object({ items: z.array(MenuItemState) });
export const MenuSetStateRes = z.object({ applied: z.number().int() });

// --- update.* ---
export const UpdateCheckReq = z.object({ force: z.boolean().default(false) });
export const UpdateCheckRes = z.object({
  status: z.enum(["checking", "available", "not-available", "downloaded", "error"]),
  version: z.string().optional()
});

export const UpdateDownloadRestartReq = z.object({});
export const UpdateDownloadRestartRes = z.object({ restarting: z.boolean() });

export const UpdateStatusReq = z.object({});
export const UpdateStatusRes = UpdateCheckRes;

// --- shell.* ---
export const ShellOpenExternalReq = z.object({
  url: z.string().url()
});
export const ShellOpenExternalRes = z.object({ opened: z.boolean() });

export const ShellRevealReq = z.object({ path: PathStr });
export const ShellRevealRes = z.object({ revealed: z.boolean() });

// --- dialog.* ---
export const DialogMessageReq = z.object({
  type: z.enum(["none","info","error","question","warning"]).default("info"),
  message: z.string(),
  detail: z.string().optional(),
  buttons: z.array(z.string()).max(6),
  defaultId: z.number().int().optional(),
  cancelId: z.number().int().optional(),
  checkboxLabel: z.string().optional(),
  checkboxChecked: z.boolean().optional()
});
export const DialogMessageRes = z.object({
  clickedIndex: z.number().int(),
  checkboxChecked: z.boolean().optional()
});

// --- clipboard.* ---
export const ClipboardReadReq = z.object({
  formats: z.array(z.enum([
    "text/plain","text/html","text/rtf",
    "image/png",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.word95.internal+json"
  ]))
});
export const ClipboardReadRes = z.object({
  entries: z.record(z.string(), z.union([z.string(), Bytes]))
});

export const ClipboardWriteReq = z.object({
  entries: z.record(z.string(), z.union([z.string(), Bytes]))
});
export const ClipboardWriteRes = z.object({ written: z.number().int() });

// --- crash.* ---
export const CrashReportReq = z.object({
  kind: z.enum(["renderer", "worker", "parser", "spell", "indexer"]),
  message: z.string(),
  stack: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional()
});
export const CrashReportRes = z.object({ reported: z.boolean() });

// --- prefs.* ---
export const PrefsGetReq = z.object({ key: z.string().optional() });
export const PrefsGetRes = z.object({ value: z.unknown() });

export const PrefsSetReq = z.object({ key: z.string(), value: z.unknown() });
export const PrefsSetRes = z.object({ set: z.boolean() });

export const PrefsResetReq = z.object({ key: z.string().optional() });
export const PrefsResetRes = z.object({ reset: z.boolean() });

// --- telemetry.* ---
export const TelemetryEmitReq = z.object({
  name: z.string().min(1).max(128),
  ts: z.number().int(),
  props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  durationMs: z.number().optional()
});
export const TelemetryEmitRes = z.object({ emitted: z.boolean() });

// --- utility.* ---
export const UtilParseDocxReq = z.object({
  bytes: Bytes,
  options: z.object({
    lenient: z.boolean().default(true),
    maxSizeBytes: z.number().int().default(512 * 1024 * 1024)
  }).default({})
});
export const UtilParseDocxRes = z.object({
  docJson: z.string(),             // JSON-serialized document model
  warnings: z.array(z.string()),
  hasMacros: z.boolean(),
  vbaRisk: z.enum(["none","low","medium","high"]).optional()
});

export const UtilSerializeDocxReq = z.object({
  docJson: z.string(),
  options: z.object({
    compress: z.boolean().default(true),
    includeCustomXml: z.boolean().default(true)
  }).default({})
});
export const UtilSerializeDocxRes = z.object({
  bytes: Bytes,
  warnings: z.array(z.string())
});

export const UtilSpellCheckReq = z.object({
  language: z.string().min(2).max(8),
  words: z.array(z.string().max(128))
});
export const UtilSpellCheckRes = z.object({
  misspelled: z.array(z.number().int())
});

export const UtilSpellSuggestReq = z.object({
  language: z.string().min(2).max(8),
  word: z.string().max(128),
  max: z.number().int().min(1).max(20).default(7)
});
export const UtilSpellSuggestRes = z.object({
  suggestions: z.array(z.string())
});

export const UtilSpellAddReq = z.object({
  language: z.string(),
  word: z.string().max(128),
  scope: z.enum(["session","user"]).default("user")
});
export const UtilSpellAddRes = z.object({ added: z.boolean() });

export const UtilIndexerBuildReq = z.object({
  docJson: z.string(),
  caseFold: z.boolean().default(true)
});
export const UtilIndexerBuildRes = z.object({
  index: Bytes,
  tokens: z.number().int()
});

export const UtilMacroSanitizeReq = z.object({
  vbaProjectBin: Bytes
});
export const UtilMacroSanitizeRes = z.object({
  risk: z.enum(["none","low","medium","high"]),
  indicators: z.array(z.string()),
  streams: z.array(z.object({
    name: z.string(),
    size: z.number(),
    hash: z.string()
  }))
});

// --- events (main -> renderer payloads) ---
export const MenuCommandEvt = z.object({ id: z.string() });
export const FileDroppedEvt = z.object({ paths: z.array(PathStr) });
export const FileOpenExternalEvt = z.object({ path: PathStr });
export const PrintStartedEvt = z.object({ jobId: z.string() });
export const PrintCompletedEvt = z.object({ jobId: z.string() });
export const PrintErrorEvt = z.object({ jobId: z.string(), message: z.string() });
export const UpdateCheckingEvt = z.object({});
export const UpdateAvailableEvt = z.object({ version: z.string() });
export const UpdateNotAvailableEvt = z.object({});
export const UpdateDownloadedEvt = z.object({ version: z.string(), releaseNotes: z.string().optional() });
export const UpdateErrorEvt = z.object({ message: z.string() });
export const PrefsChangedEvt = z.object({ key: z.string(), value: z.unknown() });
export const ThemeChangedEvt = z.object({ shouldUseDarkColors: z.boolean() });
export const WindowFocusEvt = z.object({ id: z.number() });
export const WindowBlurEvt = z.object({ id: z.number() });
export const AutosaveTickEvt = z.object({ requestedAt: z.number() });

// --- channel map (single source of truth) ---
export const Channels = {
  "file.open":              { req: FileOpenReq,            res: FileOpenRes },
  "file.openPath":          { req: FileOpenPathReq,        res: FileOpenPathRes },
  "file.save":              { req: FileSaveReq,            res: FileSaveRes },
  "file.saveAs":            { req: FileSaveAsReq,          res: FileSaveAsRes },
  "file.exists":            { req: FileExistsReq,          res: FileExistsRes },
  "file.lockAcquire":       { req: LockAcquireReq,         res: LockAcquireRes },
  "file.lockRelease":       { req: LockReleaseReq,         res: LockReleaseRes },
  "file.lockCheck":         { req: LockCheckReq,           res: LockCheckRes },
  "file.recentList":        { req: RecentListReq,          res: RecentListRes },
  "file.recentClear":       { req: RecentClearReq,         res: RecentClearRes },
  "file.revealInFolder":    { req: ShellRevealReq,         res: ShellRevealRes },
  "autosave.write":         { req: AutosaveWriteReq,       res: AutosaveWriteRes },
  "autosave.list":          { req: AutosaveListReq,        res: AutosaveListRes },
  "autosave.discard":       { req: AutosaveDiscardReq,     res: AutosaveDiscardRes },
  "window.new":             { req: WindowNewReq,           res: WindowNewRes },
  "window.close":           { req: WindowCloseReq,         res: WindowCloseRes },
  "window.setTitle":        { req: WindowSetTitleReq,      res: WindowSetTitleRes },
  "print.print":            { req: PrintPrintReq,          res: PrintPrintRes },
  "print.toPdf":            { req: PrintToPdfReq,          res: PrintToPdfRes },
  "menu.setState":          { req: MenuSetStateReq,        res: MenuSetStateRes },
  "update.check":           { req: UpdateCheckReq,         res: UpdateCheckRes },
  "update.downloadAndRestart": { req: UpdateDownloadRestartReq, res: UpdateDownloadRestartRes },
  "update.status":          { req: UpdateStatusReq,        res: UpdateStatusRes },
  "shell.openExternal":     { req: ShellOpenExternalReq,   res: ShellOpenExternalRes },
  "shell.showItemInFolder": { req: ShellRevealReq,         res: ShellRevealRes },
  "dialog.message":         { req: DialogMessageReq,       res: DialogMessageRes },
  "clipboard.read":         { req: ClipboardReadReq,       res: ClipboardReadRes },
  "clipboard.write":        { req: ClipboardWriteReq,      res: ClipboardWriteRes },
  "crash.report":           { req: CrashReportReq,         res: CrashReportRes },
  "prefs.get":              { req: PrefsGetReq,            res: PrefsGetRes },
  "prefs.set":              { req: PrefsSetReq,            res: PrefsSetRes },
  "prefs.reset":            { req: PrefsResetReq,          res: PrefsResetRes },
  "telemetry.emit":         { req: TelemetryEmitReq,       res: TelemetryEmitRes },
  "util.parse.docx":        { req: UtilParseDocxReq,       res: UtilParseDocxRes },
  "util.serialize.docx":    { req: UtilSerializeDocxReq,   res: UtilSerializeDocxRes },
  "util.spellcheck.check":  { req: UtilSpellCheckReq,      res: UtilSpellCheckRes },
  "util.spellcheck.suggest":{ req: UtilSpellSuggestReq,    res: UtilSpellSuggestRes },
  "util.spellcheck.addWord":{ req: UtilSpellAddReq,        res: UtilSpellAddRes },
  "util.indexer.build":     { req: UtilIndexerBuildReq,    res: UtilIndexerBuildRes },
  "util.macro.sanitize":    { req: UtilMacroSanitizeReq,   res: UtilMacroSanitizeRes }
} as const;

export type ChannelName = keyof typeof Channels;
export type ChannelReq<C extends ChannelName> = z.infer<typeof Channels[C]["req"]>;
export type ChannelRes<C extends ChannelName> = z.infer<typeof Channels[C]["res"]>;

export const EventChannels = {
  "menu.command":        MenuCommandEvt,
  "file.dropped":        FileDroppedEvt,
  "file.openExternal":   FileOpenExternalEvt,
  "print.started":       PrintStartedEvt,
  "print.completed":     PrintCompletedEvt,
  "print.error":         PrintErrorEvt,
  "update.checking":     UpdateCheckingEvt,
  "update.available":    UpdateAvailableEvt,
  "update.notAvailable": UpdateNotAvailableEvt,
  "update.downloaded":   UpdateDownloadedEvt,
  "update.error":        UpdateErrorEvt,
  "prefs.changed":       PrefsChangedEvt,
  "theme.changed":       ThemeChangedEvt,
  "window.focus":        WindowFocusEvt,
  "window.blur":         WindowBlurEvt,
  "autosave.tick":       AutosaveTickEvt
} as const;

export type EventChannelName = keyof typeof EventChannels;
export type EventPayload<C extends EventChannelName> = z.infer<typeof EventChannels[C]>;
```

### 4.3.1 Why zod on the Wire

- zod doubles as runtime validator and TS type source; no duplication.
- Validation on both sides means a compromised main process that speaks to a malicious renderer (or vice versa) still detects shape mismatches.
- Error messages from zod are human-readable which aids support triage.
- Bytes (`Uint8Array`) pass through structured clone; zod's `instanceof(Uint8Array)` validates without copying.

### 4.4 Main-Side Router

```ts
// packages/shell/src/ipc/router.ts
import { ipcMain, type IpcMainInvokeEvent, BrowserWindow } from "electron";
import { Channels, type ChannelName } from "@word/ipc-schema";
import { log } from "../log";

type Handler<C extends ChannelName> = (
  req: import("@word/ipc-schema").ChannelReq<C>,
  ctx: { event: IpcMainInvokeEvent; win: BrowserWindow | null }
) => Promise<import("@word/ipc-schema").ChannelRes<C>>;

const handlers = new Map<ChannelName, Handler<any>>();

export function register<C extends ChannelName>(channel: C, handler: Handler<C>) {
  if (handlers.has(channel)) {
    throw new Error(`Duplicate handler for ${channel}`);
  }
  handlers.set(channel, handler);
}

export function mountRouter() {
  // deny-by-default: install a single handler per channel in our catalogue
  for (const [channel, schemas] of Object.entries(Channels) as [ChannelName, { req: any; res: any }][]) {
    ipcMain.handle(channel, async (event, rawReq) => {
      const t0 = performance.now();
      try {
        if (!event.senderFrame) throw bad("E_VALIDATION", "no senderFrame");
        // Permit only our app origin
        const origin = event.senderFrame.origin;
        if (origin !== "app://bundle" && origin !== "app://bundle/") {
          throw bad("E_VALIDATION", `bad origin ${origin}`);
        }
        const parsed = schemas.req.safeParse(rawReq);
        if (!parsed.success) {
          throw bad("E_VALIDATION", parsed.error.message);
        }
        const handler = handlers.get(channel);
        if (!handler) throw bad("E_BAD_CHANNEL", `no handler ${channel}`);
        const win = BrowserWindow.fromWebContents(event.sender);
        const res = await handler(parsed.data, { event, win });
        const out = schemas.res.safeParse(res);
        if (!out.success) throw bad("E_VALIDATION", out.error.message);
        return { ok: true, data: out.data };
      } catch (err: any) {
        const shape = err?.__error ?? { code: "E_UNKNOWN", message: String(err?.message ?? err) };
        log.error({ channel, err: shape, ms: performance.now() - t0 });
        return { ok: false, error: shape };
      }
    });
  }
}

function bad(code: string, message: string) {
  const e: any = new Error(message);
  e.__error = { code, message };
  return e;
}
```

### 4.5 Preload Client

```ts
// packages/shell/src/preload.ts
import { contextBridge, ipcRenderer } from "electron";
import { Channels, EventChannels, type ChannelName, type EventChannelName } from "@word/ipc-schema";

type ChannelReq<C extends ChannelName> = import("@word/ipc-schema").ChannelReq<C>;
type ChannelRes<C extends ChannelName> = import("@word/ipc-schema").ChannelRes<C>;

async function invoke<C extends ChannelName>(channel: C, req: ChannelReq<C>): Promise<ChannelRes<C>> {
  const parsedReq = Channels[channel].req.safeParse(req);
  if (!parsedReq.success) throw new Error(`[${channel}] client validation failed: ${parsedReq.error.message}`);
  const envelope: any = await ipcRenderer.invoke(channel, parsedReq.data);
  if (!envelope?.ok) {
    const err: any = new Error(envelope?.error?.message ?? "unknown error");
    err.code = envelope?.error?.code ?? "E_UNKNOWN";
    err.cause = envelope?.error?.cause;
    err.path = envelope?.error?.path;
    throw err;
  }
  const parsedRes = Channels[channel].res.safeParse(envelope.data);
  if (!parsedRes.success) throw new Error(`[${channel}] response validation failed: ${parsedRes.error.message}`);
  return parsedRes.data;
}

function onEvent<E extends EventChannelName>(
  channel: E,
  cb: (payload: import("@word/ipc-schema").EventPayload<E>) => void
): () => void {
  const handler = (_: unknown, raw: unknown) => {
    const parsed = EventChannels[channel].safeParse(raw);
    if (parsed.success) cb(parsed.data as any);
  };
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  file: {
    open:   (r: ChannelReq<"file.open">)   => invoke("file.open", r),
    openPath:(r:ChannelReq<"file.openPath">)=> invoke("file.openPath", r),
    save:   (r: ChannelReq<"file.save">)   => invoke("file.save", r),
    saveAs: (r: ChannelReq<"file.saveAs">) => invoke("file.saveAs", r),
    exists: (r: ChannelReq<"file.exists">) => invoke("file.exists", r),
    lock: {
      acquire: (r: ChannelReq<"file.lockAcquire">) => invoke("file.lockAcquire", r),
      release: (r: ChannelReq<"file.lockRelease">) => invoke("file.lockRelease", r),
      check:   (r: ChannelReq<"file.lockCheck">)   => invoke("file.lockCheck", r)
    },
    recent: {
      list:  () => invoke("file.recentList", {}),
      clear: () => invoke("file.recentClear", {})
    },
    revealInFolder: (r: ChannelReq<"file.revealInFolder">) => invoke("file.revealInFolder", r)
  },
  autosave: {
    write:   (r: ChannelReq<"autosave.write">)   => invoke("autosave.write", r),
    list:    () => invoke("autosave.list", {}),
    discard: (r: ChannelReq<"autosave.discard">) => invoke("autosave.discard", r)
  },
  window: {
    new:      (r: ChannelReq<"window.new">)      => invoke("window.new", r),
    close:    () => invoke("window.close", {}),
    setTitle: (r: ChannelReq<"window.setTitle">) => invoke("window.setTitle", r)
  },
  print: {
    print:  (r: ChannelReq<"print.print">)  => invoke("print.print", r),
    toPdf:  (r: ChannelReq<"print.toPdf">)  => invoke("print.toPdf", r)
  },
  menu: {
    setState: (r: ChannelReq<"menu.setState">) => invoke("menu.setState", r)
  },
  update: {
    check: (r: ChannelReq<"update.check">)    => invoke("update.check", r),
    downloadAndRestart: () => invoke("update.downloadAndRestart", {}),
    status: () => invoke("update.status", {})
  },
  shell: {
    openExternal:     (r: ChannelReq<"shell.openExternal">) => invoke("shell.openExternal", r),
    showItemInFolder: (r: ChannelReq<"shell.showItemInFolder">) => invoke("shell.showItemInFolder", r)
  },
  dialog: {
    message: (r: ChannelReq<"dialog.message">) => invoke("dialog.message", r)
  },
  clipboard: {
    read:  (r: ChannelReq<"clipboard.read">)  => invoke("clipboard.read", r),
    write: (r: ChannelReq<"clipboard.write">) => invoke("clipboard.write", r)
  },
  crash: {
    report: (r: ChannelReq<"crash.report">) => invoke("crash.report", r)
  },
  prefs: {
    get:   (r: ChannelReq<"prefs.get">)   => invoke("prefs.get", r),
    set:   (r: ChannelReq<"prefs.set">)   => invoke("prefs.set", r),
    reset: (r: ChannelReq<"prefs.reset">) => invoke("prefs.reset", r)
  },
  telemetry: {
    emit: (r: ChannelReq<"telemetry.emit">) => invoke("telemetry.emit", r)
  },
  util: {
    parseDocx:     (r: ChannelReq<"util.parse.docx">)       => invoke("util.parse.docx", r),
    serializeDocx: (r: ChannelReq<"util.serialize.docx">)   => invoke("util.serialize.docx", r),
    spellcheck: {
      check:   (r: ChannelReq<"util.spellcheck.check">)   => invoke("util.spellcheck.check", r),
      suggest: (r: ChannelReq<"util.spellcheck.suggest">) => invoke("util.spellcheck.suggest", r),
      addWord: (r: ChannelReq<"util.spellcheck.addWord">) => invoke("util.spellcheck.addWord", r)
    },
    indexer: {
      build: (r: ChannelReq<"util.indexer.build">) => invoke("util.indexer.build", r)
    },
    macro: {
      sanitize: (r: ChannelReq<"util.macro.sanitize">) => invoke("util.macro.sanitize", r)
    }
  },
  events: {
    onMenuCommand:     (cb: (p: import("@word/ipc-schema").EventPayload<"menu.command">) => void)     => onEvent("menu.command", cb),
    onFileDropped:     (cb: (p: import("@word/ipc-schema").EventPayload<"file.dropped">) => void)     => onEvent("file.dropped", cb),
    onFileOpenExternal:(cb: (p: import("@word/ipc-schema").EventPayload<"file.openExternal">) => void)=> onEvent("file.openExternal", cb),
    onPrintStarted:    (cb: (p: import("@word/ipc-schema").EventPayload<"print.started">) => void)    => onEvent("print.started", cb),
    onPrintCompleted:  (cb: (p: import("@word/ipc-schema").EventPayload<"print.completed">) => void)  => onEvent("print.completed", cb),
    onPrintError:      (cb: (p: import("@word/ipc-schema").EventPayload<"print.error">) => void)      => onEvent("print.error", cb),
    onUpdateChecking:  (cb: (p: import("@word/ipc-schema").EventPayload<"update.checking">) => void)  => onEvent("update.checking", cb),
    onUpdateAvailable: (cb: (p: import("@word/ipc-schema").EventPayload<"update.available">) => void) => onEvent("update.available", cb),
    onUpdateDownloaded:(cb: (p: import("@word/ipc-schema").EventPayload<"update.downloaded">) => void)=> onEvent("update.downloaded", cb),
    onUpdateError:     (cb: (p: import("@word/ipc-schema").EventPayload<"update.error">) => void)     => onEvent("update.error", cb),
    onPrefsChanged:    (cb: (p: import("@word/ipc-schema").EventPayload<"prefs.changed">) => void)    => onEvent("prefs.changed", cb),
    onThemeChanged:    (cb: (p: import("@word/ipc-schema").EventPayload<"theme.changed">) => void)    => onEvent("theme.changed", cb),
    onWindowFocus:     (cb: (p: import("@word/ipc-schema").EventPayload<"window.focus">) => void)     => onEvent("window.focus", cb),
    onWindowBlur:      (cb: (p: import("@word/ipc-schema").EventPayload<"window.blur">) => void)      => onEvent("window.blur", cb),
    onAutosaveTick:    (cb: (p: import("@word/ipc-schema").EventPayload<"autosave.tick">) => void)    => onEvent("autosave.tick", cb)
  },
  versions: {
    app:       process.env.__APP_VERSION__ ?? "0.0.0",
    electron:  process.versions.electron,
    chrome:    process.versions.chrome,
    node:      process.versions.node,
    v8:        process.versions.v8,
    platform:  process.platform,
    arch:      process.arch
  }
} as const;

contextBridge.exposeInMainWorld("wp", api);
export type WordPreloadAPI = typeof api;
```

### 4.6 Renderer Global Declaration

```ts
// packages/renderer/src/global.d.ts
import type { WordPreloadAPI } from "@word/shell/preload";

declare global {
  interface Window {
    wp: WordPreloadAPI;
  }
}
export {};
```

### 4.7 MessagePort for Big Payloads

For documents over 32 MB, we avoid structured-clone copy by using `MessagePortMain`:

```ts
// main side
import { MessageChannelMain } from "electron";
const { port1, port2 } = new MessageChannelMain();
win.webContents.postMessage("file.streamPort", { path }, [port1]);
// hand port2 to utility-process for it to stream chunks into
```

The renderer receives a `MessagePort`, pipes it into a `ReadableStream`, and passes the stream to the editor engine. This bypasses structured-clone at the cost of manual backpressure handling in the stream implementation.

## 5. Window Management

### 5.1 Single BrowserWindow, MDI Inside

Word 95 uses MDI: a single frame window hosts multiple child document windows. We implement this inside one `BrowserWindow`. Each document is a React panel that the MDI manager arranges, restores, cascades, tiles. This matches feature parity exactly.

Why not multiple `BrowserWindow`s masquerading as MDI children? Because:
- Each `BrowserWindow` has its own renderer, meaning separate editor engines, separate clipboards, separate undo stacks — Word 95 has shared undo per frame window.
- Drag between children must be smooth; a cross-process drag would hop IPC boundaries per move.
- MDI visual affordances (child window title bars inside the frame) are entirely DOM.

### 5.2 SDI Mode

Preferences allow "Document per window" (SDI), the default on macOS per HIG. Each `window.new` invoke creates a new `BrowserWindow`. All SDI windows share the preload path and preferences; each has its own React root.

### 5.3 Window State Persistence

```ts
// packages/shell/src/windows.ts
interface WindowState {
  bounds: { x: number; y: number; width: number; height: number };
  maximized: boolean;
  fullScreen: boolean;
  displayId?: number;
}

export class WindowManager {
  private states = new Map<number, WindowState>();
  private store: PreferencesStore;

  restore(win: BrowserWindow, id: string) {
    const s = this.store.get(`windowState.${id}`) as WindowState | undefined;
    if (!s) return;
    // clamp to displays
    const display = screen.getAllDisplays().find(d => d.id === s.displayId) ?? screen.getPrimaryDisplay();
    const clamped = clampBoundsToDisplay(s.bounds, display.bounds);
    win.setBounds(clamped);
    if (s.maximized) win.maximize();
    if (s.fullScreen) win.setFullScreen(true);
  }

  persist(win: BrowserWindow, id: string) {
    if (win.isMinimized()) return;
    const state: WindowState = {
      bounds: win.getNormalBounds(),
      maximized: win.isMaximized(),
      fullScreen: win.isFullScreen(),
      displayId: screen.getDisplayMatching(win.getBounds()).id
    };
    this.store.set(`windowState.${id}`, state);
  }
}
```

Window state is keyed by a stable id (`main` for the primary frame; a UUID for SDI windows). We re-emit state on `move`, `resize`, `maximize`, `unmaximize`, `enter-full-screen`, `leave-full-screen`, debounced 250 ms.

### 5.4 Clamping to Displays

On startup, if the stored bounds don't overlap any connected display, we reset to the primary display's working area. This avoids off-screen windows after monitor reconfiguration.

### 5.5 Second Instance / File Args

```ts
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on("second-instance", (_event, argv, _cwd, _extra) => {
  const existing = windowManager.getMainWindow();
  if (existing) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
  }
  const paths = argv.filter(a => /\.(docx|dotx|dot|doc|rtf)$/i.test(a));
  for (const p of paths) windowManager.openPathInActiveWindow(p);
});
```

### 5.6 macOS `open-file`

```ts
app.on("open-file", (event, path) => {
  event.preventDefault();
  app.whenReady().then(() => windowManager.openPathInActiveWindow(path));
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  // we currently don't register URL schemes; future: `wordparity://`
});
```

macOS requires reading from `app.getFileToOpen()` on cold start too:

```ts
app.whenReady().then(() => {
  if (process.platform === "darwin") {
    const queued = app.getFileToOpen();
    if (queued) windowManager.openPathInActiveWindow(queued);
  }
});
```

### 5.7 Activate Handler (macOS)

```ts
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    windowManager.createMainWindow();
  }
});
```

## 6. Menu Bar

### 6.1 Per-Platform Strategy

- **Windows / Linux:** native OS menu is disabled (`Menu.setApplicationMenu(null)`). Our React MDI frame draws the exact Word 95 menu bar.
- **macOS:** native Application menu is required by HIG (app name, About, Preferences, Hide, Quit, Services, Window, Help). We build it with `Menu.buildFromTemplate`. The Word 95 menu (File, Edit, View, Insert, Format, Tools, Table, Window, Help) is *also* rendered inside the window — this is a deliberate parity choice and surveys of long-time Word users showed they expect it.

### 6.2 macOS Native Menu

```ts
// packages/shell/src/menu.ts
import { app, Menu, type MenuItemConstructorOptions } from "electron";
import { i18n } from "./i18n";

export function buildMacMenu(locale: string) {
  const t = i18n(locale);
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about", label: t("menu.about", { app: app.name }) },
        { type: "separator" },
        {
          label: t("menu.preferences"),
          accelerator: "CmdOrCtrl+,",
          click: () => fireMenuCommand("prefs.open")
        },
        { type: "separator" },
        { role: "services", label: t("menu.services") },
        { type: "separator" },
        { role: "hide",        label: t("menu.hide", { app: app.name }) },
        { role: "hideOthers",  label: t("menu.hideOthers") },
        { role: "unhide",      label: t("menu.showAll") },
        { type: "separator" },
        { role: "quit",        label: t("menu.quit", { app: app.name }) }
      ]
    },
    // Standard Edit / View / Window / Help roles
    { label: t("menu.edit"), submenu: [
      { role: "undo",  label: t("menu.undo") },
      { role: "redo",  label: t("menu.redo") },
      { type: "separator" },
      { role: "cut",   label: t("menu.cut") },
      { role: "copy",  label: t("menu.copy") },
      { role: "paste", label: t("menu.paste") },
      { role: "selectAll", label: t("menu.selectAll") }
    ]},
    { label: t("menu.window"), submenu: [
      { role: "minimize" },
      { role: "zoom" },
      { type: "separator" },
      { role: "front", label: t("menu.bringAllToFront") }
    ]},
    { label: t("menu.help"), submenu: [
      { label: t("menu.helpContents"), accelerator: "F1", click: () => fireMenuCommand("help.contents") },
      { label: t("menu.about"),                            click: () => fireMenuCommand("help.about") }
    ]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function fireMenuCommand(id: string) {
  const { BrowserWindow } = require("electron");
  const win = BrowserWindow.getFocusedWindow();
  win?.webContents.send("menu.command", { id });
}
```

### 6.3 Menu Command Event Bridge

Native menu clicks fire `menu.command` to the focused renderer. The renderer's command dispatcher receives the string id and routes to the matching editor command. The renderer is the source of truth for command availability and invokes `wp.menu.setState` when state changes (selection, dirty, undo stack depth, etc.). Main applies the state to the native `Menu` in response.

### 6.4 Menu State Synchronization

```ts
register("menu.setState", async ({ items }) => {
  const menu = Menu.getApplicationMenu();
  if (!menu) return { applied: 0 };
  let n = 0;
  for (const { id, enabled, checked, label, accelerator, visible } of items) {
    const item = menu.getMenuItemById(id);
    if (!item) continue;
    if (enabled     !== undefined) item.enabled = enabled;
    if (checked     !== undefined) item.checked = checked;
    if (label       !== undefined) item.label = label;
    if (accelerator !== undefined) item.accelerator = accelerator;
    if (visible     !== undefined) item.visible = visible;
    n++;
  }
  return { applied: n };
});
```

Menu item ids are stable strings defined by the renderer's command registry.

## 7. File I/O

### 7.1 Open (Native Dialog)

```ts
// packages/shell/src/fileio.ts
register("file.open", async (req, { win }) => {
  const { dialog } = await import("electron");
  const res = await dialog.showOpenDialog(win!, {
    properties: ["openFile"],
    defaultPath: req.startDir,
    filters: req.filters ?? [
      { name: "Word Documents", extensions: ["docx","dotx","dot","doc"] },
      { name: "Rich Text", extensions: ["rtf"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (res.canceled || !res.filePaths[0]) throw err("E_DIALOG_CANCELED", "canceled");
  return await readFileBytes(res.filePaths[0]);
});

async function readFileBytes(p: string) {
  const fs = await import("node:fs/promises");
  const stat = await fs.stat(p);
  if (!stat.isFile()) throw err("E_IO", "not a file", p);
  if (stat.size > HARD_CAP_BYTES) throw err("E_IO", "file too large", p);
  const bytes = await fs.readFile(p);
  const readOnly = await isReadOnly(p, stat);
  return { path: p, mtimeMs: stat.mtimeMs, size: stat.size, bytes, readOnly };
}
```

### 7.2 Atomic Save (write-temp, fsync, rename)

```ts
async function atomicWrite(target: string, bytes: Uint8Array, overwriteMtime?: number) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const os = await import("node:os");

  const dir = path.dirname(target);
  const base = path.basename(target);
  const tmp = path.join(dir, `.~${base}.${process.pid}.${Date.now()}.tmp`);

  // conflict detection
  if (overwriteMtime !== undefined) {
    try {
      const cur = await fs.stat(target);
      if (cur.mtimeMs !== overwriteMtime) throw err("E_IO", "conflict-modified-on-disk", target);
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
  }

  let fh: any | undefined;
  try {
    fh = await fs.open(tmp, "wx"); // exclusive create
    await fh.writeFile(bytes);
    await fh.sync();
    await fh.close();
    fh = undefined;

    // atomic rename
    if (process.platform === "win32") {
      // Windows: use fs.rename which uses MoveFileEx w/ REPLACE_EXISTING by default in Node>=16
      await fs.rename(tmp, target);
    } else {
      await fs.rename(tmp, target);
    }

    // fsync the containing directory for durability on POSIX
    if (process.platform !== "win32") {
      try {
        const dfh = await fs.open(dir, "r");
        await dfh.sync();
        await dfh.close();
      } catch { /* not fatal */ }
    }

    const st = await fs.stat(target);
    return { path: target, mtimeMs: st.mtimeMs, size: st.size };
  } catch (e) {
    try { if (fh) await fh.close(); } catch {}
    try { await fs.unlink(tmp); } catch {}
    throw e;
  }
}
```

Windows note: `fs.rename` in Node uses `MoveFileEx` with `REPLACE_EXISTING`. We do not request `WRITE_THROUGH` at the rename site because the preceding `fh.sync()` already flushed the tmp file's contents. If power-loss durability at rename granularity becomes a requirement, we can switch to `node-winapi` FFI with `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)`.

### 7.3 Lock File Semantics (LibreOffice-Compatible)

LibreOffice creates `.~lock.<filename>#` in the same directory. We create the same file, with the same first-line format for compatibility:

```
,<user>,<host>,<ISO8601>,<pid>;
```

(LibreOffice's format is actually `<user>,<host>,<pid>,<ISO8601>;` — we match exactly.)

```ts
async function lockAcquire(target: string) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const os = await import("node:os");
  const lockPath = path.join(path.dirname(target), `.~lock.${path.basename(target)}#`);
  const payload = `${os.userInfo().username},${os.hostname()},${process.pid},${new Date().toISOString()};`;
  try {
    const fh = await fs.open(lockPath, "wx");
    await fh.writeFile(payload, "utf8");
    await fh.close();
    return { acquired: true };
  } catch (e: any) {
    if (e.code === "EEXIST") {
      const holder = await fs.readFile(lockPath, "utf8").catch(() => "");
      return { acquired: false, holder };
    }
    throw e;
  }
}

async function lockRelease(target: string) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const lockPath = path.join(path.dirname(target), `.~lock.${path.basename(target)}#`);
  try { await fs.unlink(lockPath); return { released: true }; }
  catch (e: any) { if (e.code === "ENOENT") return { released: true }; throw e; }
}
```

On open, renderer first calls `file.lockCheck`; if the lock is held by another user/pid, renderer offers "Open read-only", "Open anyway" (cancel lock), or "Cancel". On own-PID stale lock (e.g. after a crash), we detect and silently steal.

### 7.4 Autosave

Autosave runs at a fixed cadence (default 120 seconds, configurable) and also on idle (no keypress for 10 s). The renderer composes an autosave request containing serialized bytes and a `docId` (a UUID assigned at open or new). Main writes the snapshot into the user's autosave directory:

- Windows: `%APPDATA%\WordParity\Autosave\<docId>.docx`
- macOS: `~/Library/Application Support/WordParity/Autosave/<docId>.docx`
- Linux: `$XDG_DATA_HOME/WordParity/autosave/<docId>.docx` (fallback `~/.local/share/WordParity/autosave/`)

A sidecar `.meta.json` records `originalPath`, `docId`, `rev`, `savedAt`.

```ts
register("autosave.write", async ({ docId, originalPath, bytes, rev }) => {
  const dir = await ensureAutosaveDir();
  const target = path.join(dir, `${docId}.docx`);
  const meta = { docId, originalPath, rev, savedAt: Date.now() };
  await atomicWrite(target, bytes);
  await atomicWriteJson(target + ".meta.json", meta);
  return { path: target, rev };
});
```

On a clean save via `file.save`, the autosave for the same `docId` is discarded.

### 7.5 Recovery on Startup

```ts
register("autosave.list", async () => {
  const dir = await ensureAutosaveDir();
  const fs = await import("node:fs/promises");
  const names = await fs.readdir(dir);
  const entries = [];
  for (const n of names) {
    if (!n.endsWith(".docx")) continue;
    const p = path.join(dir, n);
    const st = await fs.stat(p);
    const metaPath = p + ".meta.json";
    const meta = await readJsonOrNull(metaPath);
    entries.push({ path: p, docId: meta?.docId ?? n.replace(/\.docx$/, ""), originalPath: meta?.originalPath, mtimeMs: st.mtimeMs, size: st.size });
  }
  return { entries };
});
```

On startup the renderer displays a Recovery panel listing entries, offering **Restore**, **Save as...**, **Discard**. We garbage-collect autosaves older than 30 days on startup after user confirmation.

### 7.6 Drag-and-Drop

Renderer blocks default drag behavior, reads `File.path` (available because `navigator.webkitGetAsFileListingForEntry` exposes the OS path in Electron). But because the renderer is sandboxed, we cannot `fs.read` directly — we send paths to main via `file.openPath`.

```ts
document.addEventListener("drop", async (ev) => {
  ev.preventDefault();
  const paths = Array.from(ev.dataTransfer?.files ?? [])
    .map((f: any) => f.path as string)
    .filter(p => /\.(docx|dotx|dot|doc|rtf)$/i.test(p));
  if (paths.length) await window.wp.file.openPath({ path: paths[0] });
});
document.addEventListener("dragover", (ev) => ev.preventDefault());
```

Alternative: main emits `file.dropped` itself by observing `BrowserWindow`'s `app.on('will-finish-launching')` + `open-file`; renderer listens.

### 7.7 File Associations

Registered at install time by the installer:

- **Windows (NSIS)**: `HKCU\SOFTWARE\Classes\.docx` → `WordParity.Document.1`; `WordParity.Document.1\shell\open\command` → `"C:\Program Files\WordParity\WordParity.exe" "%1"`. Also for `.dotx`, `.dot`, `.doc`, `.rtf`. Optional default-handler prompt on first launch.
- **macOS (Info.plist)**: `CFBundleDocumentTypes` with `UTI` entries: `org.openxmlformats.wordprocessingml.document`, `com.microsoft.word.doc`, `public.rtf`. `LSHandlerRank` = `Alternate` by default; user can set to `Owner`.
- **Linux (.desktop)**: `MimeType=application/vnd.openxmlformats-officedocument.wordprocessingml.document;application/msword;text/rtf;application/vnd.openxmlformats-officedocument.wordprocessingml.template;`

Main process handles open requests per §5.5 / §5.6.

### 7.8 Symlinks

On open we `fs.stat` (follows) and `fs.lstat` (no follow). If they differ, we surface a non-blocking warning toast: "This file is a symlink to X." Reads follow the link. Writes follow the link too (LibreOffice behavior).

### 7.9 Network Shares

SMB, AFP, NFS are supported transparently by the OS. We detect high latency (>200 ms `fs.stat`) and:
- Skip fsync on directory (POSIX; it's a no-op on SMB anyway).
- Raise autosave interval to 5 min default on that document to reduce server traffic.
- Display a "Working from network share" indicator.

### 7.10 `IFileProvider` Abstraction

```ts
// packages/renderer/src/fileProvider/IFileProvider.ts
export interface IFileProvider {
  readonly id: string;
  readonly displayName: string;
  listRecent(): Promise<Array<{ path: string; label: string; mtimeMs: number }>>;
  read(path: string): Promise<{ bytes: Uint8Array; mtimeMs: number; readOnly: boolean }>;
  write(path: string, bytes: Uint8Array, overwriteMtime?: number): Promise<{ mtimeMs: number }>;
  exists(path: string): Promise<boolean>;
  pickOpen(): Promise<string | null>;
  pickSave(suggested?: string): Promise<string | null>;
}

// v1 LocalFS delegates to window.wp.file.*
// v2 OneDrive, Dropbox, Google Drive adapters
```

All editor code consumes `IFileProvider`, not `window.wp.file` directly, so that v2 cloud providers drop in without refactor.

## 8. Printing

### 8.1 Native Print Dialog

```ts
register("print.print", async (req, { win }) => {
  const jobId = crypto.randomUUID();
  win!.webContents.send("print.started", { jobId });
  win!.webContents.print({
    silent: req.silent,
    printBackground: req.printBackground,
    deviceName: req.deviceName,
    color: req.color,
    landscape: req.landscape,
    scaleFactor: req.scaleFactor,
    pagesPerSheet: req.pagesPerSheet as any,
    collate: req.collate,
    copies: req.copies,
    pageRanges: req.pageRanges,
    duplexMode: req.duplexMode,
    dpi: req.dpi,
    header: req.headerFooter?.title,
    footer: req.headerFooter?.url
  }, (success, reason) => {
    if (success) win!.webContents.send("print.completed", { jobId });
    else         win!.webContents.send("print.error", { jobId, message: reason ?? "unknown" });
  });
  return { jobId };
});
```

### 8.2 In-App Print Preview

`webContents.print` on its own opens the native dialog which offers OS-level preview on macOS (native) and limited preview on Windows. We provide **our own** preview that reuses the Page Layout view, scaled to fit the preview pane, because feature parity with Word 95 requires the side-by-side thumbnails, N-up, and the "What you see is what you get" fidelity checks.

### 8.3 Print to PDF

```ts
register("print.toPdf", async (req, { win }) => {
  const bytes = await win!.webContents.printToPDF({
    printBackground: req.printBackground,
    landscape: req.landscape,
    pageRanges: req.pageRanges,
    margins: req.margins,
    pageSize: req.pageSize as any,
    preferCSSPageSize: req.preferCSSPageSize
  });
  if (req.destination) {
    await atomicWrite(req.destination, bytes);
    return { path: req.destination };
  }
  // caller will pipe bytes back, or save via a dialog
  return { path: "", bytes: new Uint8Array(bytes) };
});
```

### 8.4 Print-Friendly DOM

Before triggering `webContents.print`, the renderer adds a `printing` class to the root that:
- Hides rulers, status bar, toolbars, minimap, selection highlight, caret, active change-tracking markers.
- Hides comment bubbles *unless* user ticked "Include comments".
- Replaces gridlines and formatting marks with nothing.
- Forces paginated layout (the editor may have been in Normal/Outline view).

```css
@media print {
  .toolbar, .ribbon, .statusbar, .ruler, .minimap, .selection-overlay { display: none !important; }
  .caret { visibility: hidden !important; }
  .comment-bubble:not(.print) { display: none !important; }
  .gridline, .formatting-mark { display: none !important; }
}
```

### 8.5 Duplex, Orientation, Copies, Collate

All mapped directly to `webContents.print`'s options. For printers that don't honor a given option the OS returns an error we surface via `print.error`.

### 8.6 Direct PDF Emission (v2)

`webContents.printToPDF` rasterizes through Blink. For pixel-exact fidelity across OS printer drivers we plan a direct PDF path in v2 using `pdf-lib` and our own page model. This allows embedded fonts, preserved vector glyphs, and deterministic output across platforms. Until then, `printToPDF` is the canonical path.

## 9. Clipboard

### 9.1 Formats

Read and write:

- `text/plain`
- `text/html`
- `text/rtf`
- `image/png`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (on Windows exposed as `CF_DIB` + custom format `MS Word Document`; on macOS as `com.microsoft.Word.Document`; on Linux as the MIME directly via X11/Wayland selection)
- `application/vnd.word95.internal+json` (our internal high-fidelity schema; survives only app-to-app within WordParity but provides lossless round-trip of tables, comments, fields, and revision marks)

### 9.2 Main-Side Implementation

```ts
register("clipboard.read", async ({ formats }) => {
  const { clipboard } = await import("electron");
  const out: Record<string, string | Uint8Array> = {};
  for (const f of formats) {
    switch (f) {
      case "text/plain": out[f] = clipboard.readText(); break;
      case "text/html":  out[f] = clipboard.readHTML(); break;
      case "text/rtf":   out[f] = clipboard.readRTF(); break;
      case "image/png": {
        const img = clipboard.readImage();
        if (!img.isEmpty()) out[f] = img.toPNG();
        break;
      }
      default: {
        const buf = clipboard.readBuffer(f);
        if (buf.byteLength > 0) out[f] = new Uint8Array(buf);
      }
    }
  }
  return { entries: out };
});

register("clipboard.write", async ({ entries }) => {
  const { clipboard, nativeImage } = await import("electron");
  const parts: any = {};
  let n = 0;
  for (const [fmt, val] of Object.entries(entries)) {
    if (fmt === "text/plain") { parts.text = val as string; n++; continue; }
    if (fmt === "text/html")  { parts.html = val as string; n++; continue; }
    if (fmt === "text/rtf")   { parts.rtf  = val as string; n++; continue; }
    if (fmt === "image/png")  {
      parts.image = nativeImage.createFromBuffer(Buffer.from(val as Uint8Array));
      n++; continue;
    }
    // custom formats
    clipboard.writeBuffer(fmt, Buffer.from(val as Uint8Array));
    n++;
  }
  if (n) clipboard.write(parts);
  return { written: n };
});
```

### 9.3 Paste Special

The renderer shows a dialog listing available formats (queried via `clipboard.read` with all formats, but aborting per-format reads on first success would mis-list). We read a listing via `clipboard.availableFormats()` which we expose as a lightweight helper under `util.clipboard.available`.

### 9.4 Clipboard Monitor — Explicitly Not Implemented

A clipboard watcher would have to poll `clipboard.read*` and can be perceived as spying. We do not implement one. Paste is strictly pull-based, user-initiated.

### 9.5 Drag Data

Drag between MDI children uses DOM drag events and our internal `application/vnd.word95.internal+json` format set via `DataTransfer.setData`. Drag to other applications uses standard formats only (text/html, text/plain) plus a file payload if the user drags a document.

## 10. Auto-Update

### 10.1 Library Choice

`electron-updater` (part of the `electron-builder` family) — mature, supports differential updates, code-signing verification on Windows and macOS, reliable on Linux AppImage. `autoUpdater` (Electron built-in) is macOS-only for the Squirrel flavor; `electron-updater` wraps all three platforms uniformly.

### 10.2 Channels

- **stable** (default): promoted releases.
- **beta**: opt-in; tagged `-beta`.
- **canary**: internal / QA; tagged `-canary`.

Channel selection is a preference, published to `electron-updater` as `channel` on the configured provider.

### 10.3 Flow

```ts
// packages/shell/src/update.ts
import { autoUpdater } from "electron-updater";
import { BrowserWindow } from "electron";

export function configureAutoUpdate(store: PreferencesStore, getTargetWin: () => BrowserWindow | null) {
  autoUpdater.autoDownload = store.get("update.autoDownload", true);
  autoUpdater.autoInstallOnAppQuit = store.get("update.installOnQuit", true);
  autoUpdater.channel = store.get("update.channel", "stable");
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("checking-for-update", () => getTargetWin()?.webContents.send("update.checking", {}));
  autoUpdater.on("update-available", (info) => getTargetWin()?.webContents.send("update.available", { version: info.version }));
  autoUpdater.on("update-not-available", () => getTargetWin()?.webContents.send("update.notAvailable", {}));
  autoUpdater.on("update-downloaded", (info) =>
    getTargetWin()?.webContents.send("update.downloaded", { version: info.version, releaseNotes: Array.isArray(info.releaseNotes) ? info.releaseNotes.join("\n") : info.releaseNotes }));
  autoUpdater.on("error", (e) => getTargetWin()?.webContents.send("update.error", { message: e?.message ?? String(e) }));
}

register("update.check", async (_req) => {
  const result = await autoUpdater.checkForUpdates();
  return { status: result?.updateInfo ? "available" : "not-available", version: result?.updateInfo?.version };
});

register("update.downloadAndRestart", async () => {
  await autoUpdater.downloadUpdate();
  autoUpdater.quitAndInstall(true, true);
  return { restarting: true };
});

register("update.status", async () => {
  // best-effort summary
  return { status: "checking" };
});
```

### 10.4 Scheduling

Startup check is delayed 30 s to let the UI settle. Subsequent checks every 6 h (configurable 1–24 h). Check requires online connectivity (`net.isOnline()`).

### 10.5 Differential Updates

- Windows NSIS: `differential` enabled; blockmap files published alongside EXE.
- macOS DMG: latest `electron-updater` supports delta via `latest-mac.yml` + `blockmap`.
- Linux AppImage: `zsync2` differential.
- deb/rpm: full package each release; `apt`/`dnf` handle differential in practice.
- snap/flatpak: upstream delivery handles deltas.

### 10.6 Silent vs Prompt

User preference:
- **Silent install on next quit** (default): user quits normally, update installs on relaunch.
- **Prompt on download** (default for beta/canary): immediate toast with "Restart now" / "Later".

### 10.7 Rollback

- We retain the previously installed version in `Program Files (x86)\WordParity\<prior-version>` on Windows, in `~/Library/Application Support/WordParity/rollback/` on macOS, in `/opt/wordparity/rollback/` on Linux for one release cycle.
- Add **Help → Rollback to previous version** which restarts into the retained binary.
- On rollback we tag the preferences with `update.rolledBackFrom` so auto-update pauses for 24 h (avoid reinstalling a broken release).

### 10.8 Signature Verification

`electron-updater` verifies code signatures before install on Windows (Authenticode) and macOS (codesign). On Linux we validate a detached `.sig` via `minisign` public key bundled at build time; mismatch aborts the install with a loud dialog.

## 11. Packaging

### 11.1 Tool

**Electron Forge** with `@electron-forge/maker-*` per-OS, over `electron-builder` because Forge integrates cleaner with the monorepo and gives us a single `forge.config.ts` managing all makers plus ASAR and fuses.

### 11.2 Windows

- **MSI** via `@electron-forge/maker-wix` (WiX Toolset). Preferred for enterprise/MDM deployment.
- **NSIS** via `electron-winstaller` / custom NSIS script for consumer (faster install, differential updates).
- **EV code-signing certificate** via SignTool on Windows build agents; EV required to bypass SmartScreen reputation.
- **MSIX** via `electron-windows-store` — optional, gated behind a build flag.

Installer options: per-user (default; no admin) or per-machine (admin prompt). We do not request admin for per-user.

### 11.3 macOS

- **DMG** via `@electron-forge/maker-dmg`.
- **Code-signed** with Developer ID Application cert; **notarized** via `notarytool`; **stapled** to the DMG and bundle.
- **Hardened runtime** enabled. Entitlements minimal:
  - `com.apple.security.cs.allow-jit` — disabled (no JS JIT in renderer that isn't V8; V8's JIT is permitted without this entitlement on a signed bundle).
  - `com.apple.security.cs.allow-unsigned-executable-memory` — enabled *only* if layout-engine WASM requires it (we verify; Electron's own WASM runner does not require it unless we use `--allow-natives-syntax` which we don't).
  - `com.apple.security.cs.disable-library-validation` — enabled because Electron helpers are signed with a different team identifier than our app in some cases, and some native dylibs we ship (Hunspell WASM is fine; if we add a native `.node` we need this).
  - `com.apple.security.network.client` — enabled (update server).
  - No microphone/camera/location/calendar/contacts entitlements.
- **Universal binary** (x86_64 + arm64) via `@electron/universal`; one DMG per architecture is also published as a fallback for CI bandwidth.

### 11.4 Linux

- **AppImage** via `@electron-forge/maker-appimage` — bundled Electron; runs without install.
- **deb** via `@electron-forge/maker-deb`; **rpm** via `maker-rpm`.
- **snap** via `maker-snap` with `core22` base and strict confinement; interfaces: `home`, `removable-media`, `network`, `cups-control`, `desktop`, `desktop-legacy`, `wayland`, `x11`, `unity7`, `gsettings`, `audio-playback`. MIME file association via `apps.wordparity.slots: [word-mime]`.
- **flatpak** via `flatpak-builder`, with finish-args `--filesystem=home:rw`, `--filesystem=xdg-documents:rw`, `--share=network`, `--socket=x11`, `--socket=wayland`, `--socket=pulseaudio`, `--socket=cups`. `.desktop` file exported, MIME types registered via `--mime=...`.

### 11.5 ASAR and Fuses

- `asar: true`, `asarUnpack: ["**/*.node", "**/*.wasm", "**/hunspell-dict/**"]` so WASM and dictionaries load as regular files.
- ASAR integrity: every binary release includes an ASAR SHA-512 in the header; Electron Fuse `enableEmbeddedAsarIntegrityValidation` causes the binary to refuse to load a tampered ASAR.

### 11.6 Reproducibility

Build reproducibility requires pinning:
- Node version (`.nvmrc`), pnpm version, Electron version.
- Build container images per OS (Ubuntu 22.04 LTS for Linux; Windows Server 2022 LTSC; macOS 14 runner).
- Pinned checksums for Electron binaries and native module prebuilt archives.

Our CI produces SHA-256 checksums and publishes an attestation per artifact.

## 12. Native Integration

### 12.1 Windows

- **Jump List**: set on app ready.
  ```ts
  app.setJumpList([
    { type: "recent" },
    { type: "tasks", items: [
      {
        type: "task",
        title: "New Document",
        program: process.execPath,
        args: "--new-doc",
        iconPath: process.execPath,
        iconIndex: 0
      },
      {
        type: "task",
        title: "New Letter",
        program: process.execPath,
        args: "--new-doc --template=letter"
      }
    ]}
  ]);
  ```
- **Recent files**: `app.addRecentDocument(path)` on every successful open.
- **Toast notifications**: `new Notification({ title, body }).show()`.
- **Start Menu tile (MSIX)**: square and wide tiles in `VisualElements.xml`.
- **User Model ID**: `app.setAppUserModelId("net.wordparity.app")` so toasts and taskbar grouping work.

### 12.2 macOS

- **Dock menu**:
  ```ts
  app.dock.setMenu(Menu.buildFromTemplate([
    { label: "New Document", click: () => windowManager.newDocument() },
    { label: "New Letter",   click: () => windowManager.newFromTemplate("letter") }
  ]));
  ```
- **Recent files**: `app.addRecentDocument` — macOS consumes this for the Dock's Recent submenu and the Apple menu.
- **Handoff/Continuity**: not in scope for v1.
- **App category**: `Info.plist` `LSApplicationCategoryType = public.app-category.productivity`.

### 12.3 Linux

- **`.desktop` file** (generated by `maker-deb` / `maker-rpm` / `maker-appimage`):
  ```
  [Desktop Entry]
  Name=Word Parity
  GenericName=Word Processor
  Comment=Edit documents — Word 95 parity
  Exec=/opt/wordparity/wordparity %F
  Icon=wordparity
  Terminal=false
  Type=Application
  Categories=Office;WordProcessor;
  MimeType=application/vnd.openxmlformats-officedocument.wordprocessingml.document;application/msword;text/rtf;application/vnd.openxmlformats-officedocument.wordprocessingml.template;
  StartupWMClass=wordparity
  Keywords=Word;Document;DOCX;RTF;
  ```
- **MIME registration** via `update-desktop-database` and `update-mime-database` in the deb/rpm postinst.
- **XDG portal** for file dialogs on Wayland/Flatpak: Electron uses xdg-desktop-portal automatically when available; we set `--file-selector-use-portal` as a backup.
- **Notifications**: `libnotify` via Chromium's integration.

### 12.4 Theming

```ts
import { nativeTheme } from "electron";
const sendTheme = () => broadcast("theme.changed", { shouldUseDarkColors: nativeTheme.shouldUseDarkColors });
nativeTheme.on("updated", sendTheme);
sendTheme();
```

The renderer's theme system defaults to OS preference but exposes `Light | Dark | System | HighContrast` override.

## 13. Single-Instance Behavior

### 13.1 Default On

```ts
const got = app.requestSingleInstanceLock();
if (!got) { app.quit(); process.exit(0); }
```

`second-instance` handler:
- Brings existing frame window forward (`restore`, `show`, `focus`).
- Extracts file paths from `argv` (platform-normalized) and opens each as MDI child (or SDI window per preference).
- Respects `--new-doc`, `--template=...`, `--read-only` flags.

### 13.2 Preference to Disable

`general.singleInstance: false` disables the lock. Each launch becomes a fresh instance. Useful for side-by-side sessions with different preferences directories (`--user-data-dir=...`).

### 13.3 `argv` Normalization

macOS does not pass file arguments via `argv` on activation — it uses `open-file`. Windows passes paths in `argv[1..]`. Linux sends via `argv` on `.desktop` launch. Our normalization layer:

```ts
export function extractFilePaths(argv: string[]): string[] {
  const candidates = argv.slice(1).filter(a => !a.startsWith("--"));
  return candidates.filter(p => /\.(docx|dotx|dot|doc|rtf)$/i.test(p));
}
```

We also filter out Chromium-internal flags (prefixed `--`) that can sneak into `argv` on Linux relaunch.

## 14. Logging

### 14.1 Library

`electron-log` — rotating file logger with transports per platform:
- Windows: `%APPDATA%\WordParity\logs\main.log`
- macOS: `~/Library/Logs/WordParity/main.log`
- Linux: `~/.config/WordParity/logs/main.log`

Five files × 10 MB rotation (`main.log`, `main.1.log`, ..., `main.4.log`).

### 14.2 Levels

`ERROR`, `WARN`, `INFO`, `DEBUG`, `TRACE`. `TRACE` only in development. `DEBUG` on when `WP_DEBUG=1`. Default production level is `INFO`.

### 14.3 Redaction

A pre-transport filter strips:
- Absolute file paths (replace with `<path>`).
- User home directory name (replace with `<home>`).
- Username (replace with `<user>`).
- Document contents / byte buffers.
- Clipboard contents.

```ts
log.hooks.push((message) => {
  message.data = message.data.map((d) =>
    typeof d === "string" ? redact(d) : d
  );
  return message;
});
```

### 14.4 Help → Show Log Folder

```ts
register("shell.showItemInFolder", async ({ path }) => {
  const { shell } = await import("electron");
  shell.showItemInFolder(path);
  return { revealed: true };
});
```

The renderer calls this with the log directory path obtained from `wp.versions` (we expose the log dir there).

### 14.5 Structured Logging

All log entries are JSON in production (easier to grep). In dev, a pretty transport renders them human-readable.

## 15. Crash Handling

### 15.1 Electron crashReporter

```ts
crashReporter.start({
  companyName: "WordParity",
  productName: "WordParity",
  submitURL: prefs.get("crash.submitUrl", ""),
  uploadToServer: prefs.get("crash.uploadOptIn", false),
  ignoreSystemCrashHandler: false,
  compress: true,
  globalExtra: {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    channel: prefs.get("update.channel", "stable")
  }
});
```

Upload is opt-in. Defaults to off.

### 15.2 Unhandled Main Exception

```ts
process.on("uncaughtException", (err) => {
  log.error("uncaughtException", err);
  writeCrashBreadcrumb({ kind: "main-uncaught", err: String(err), stack: err.stack });
  showCrashDialog("The application encountered a problem.", err.message);
});
process.on("unhandledRejection", (reason) => {
  log.error("unhandledRejection", reason);
  writeCrashBreadcrumb({ kind: "main-unhandled", reason: String(reason) });
});

function showCrashDialog(msg: string, detail: string) {
  const { dialog } = require("electron");
  const choice = dialog.showMessageBoxSync({
    type: "error",
    message: msg,
    detail,
    buttons: ["Restart and recover", "Quit"],
    defaultId: 0,
    cancelId: 1
  });
  if (choice === 0) {
    app.relaunch({ args: [...process.argv.slice(1), "--recover"] });
  }
  app.exit(1);
}
```

### 15.3 Renderer Crash

```ts
win.webContents.on("render-process-gone", (_event, details) => {
  log.error("renderer gone", details);
  if (details.reason === "clean-exit" || details.reason === "killed") return;
  win.webContents.send("crash.report", {
    kind: "renderer",
    message: `renderer gone: ${details.reason}`,
    context: { exitCode: details.exitCode }
  });
  // give the renderer 1s to flush autosave, then reload with recover flag
  setTimeout(() => {
    win.loadURL("app://bundle/index.html?recover=1");
  }, 1000);
});
```

Because autosave is frequent, renderer crashes rarely lose more than 2 minutes of work.

### 15.4 Utility Crash

```ts
class UtilitySupervisor {
  private children = new Map<string, UtilityProcessHandle>();
  private backoff = new Map<string, number>();

  async spawn(name: string, modulePath: string, opts: Electron.ForkOptions) {
    const child = utilityProcess.fork(modulePath, [], opts);
    child.on("exit", (code) => {
      log.warn(`${name} exited ${code}`);
      const next = Math.min((this.backoff.get(name) ?? 100) * 2, 10_000);
      this.backoff.set(name, next);
      setTimeout(() => this.spawn(name, modulePath, opts), next);
    });
    this.children.set(name, child);
    this.backoff.set(name, 100);
    return child;
  }
}
```

Exponential backoff capped at 10 s. Three consecutive crashes within a minute disables the feature and surfaces a toast ("Spell check disabled after repeated failures; restart the app to retry").

### 15.5 Child Process GPU Crash

```ts
app.on("child-process-gone", (_e, details) => {
  log.warn("child gone", details);
});
```

GPU crashes fall back to CPU compositing; we enable `--disable-gpu` only on systems that crash twice in a row.

## 16. Observability Hooks

### 16.1 Performance Marks

Main and renderer emit perf marks for:
- `boot.main.ready`
- `boot.window.show`
- `file.open.<ms>`
- `file.save.<ms>`
- `parse.docx.<ms>`
- `serialize.docx.<ms>`
- `layout.page.<ms>`

The renderer polls `performance.getEntriesByType('measure')` every 5 s, filters by a known name list, and fires `telemetry.emit` with opt-in.

### 16.2 Help Menu

- **Help → About**: shows `wp.versions` (app, Electron, Chromium, Node, V8, platform, arch), list of bundled open-source licenses.
- **Help → Feedback**: opens `mailto:feedback@wordparity.net?subject=Feedback%20(v{version})` via `shell.openExternal`.
- **Help → Show Log Folder**: `shell.showItemInFolder` with log dir.
- **Help → Crash Reports Folder**: opens the crashReporter dump dir.

### 16.3 Telemetry

Opt-in flag in preferences. If enabled, `telemetry.emit` forwards to a minimal HTTPS endpoint (no cookies, no third-party, TLS-pinned public key). Payload is never more than: event name, timestamp, app version, OS, anonymized session id.

## 17. Configuration

### 17.1 Store

`electron-store` (JSON-backed), one instance in main. Preferences are schema-validated at load and on every set via zod. Invalid values are logged and reset to defaults.

Location:
- Windows: `%APPDATA%\WordParity\config.json`
- macOS: `~/Library/Application Support/WordParity/config.json`
- Linux: `~/.config/WordParity/config.json`

### 17.2 Categories and Schema

```ts
export const PrefsSchema = z.object({
  general: z.object({
    locale: z.string().default("en-US"),
    singleInstance: z.boolean().default(true),
    startupAction: z.enum(["openBlank","openLast","showStartScreen"]).default("showStartScreen"),
    windowing: z.enum(["mdi","sdi"]).default(process.platform === "darwin" ? "sdi" : "mdi"),
    recentMax: z.number().int().min(0).max(50).default(15)
  }),
  editing: z.object({
    autoCorrect: z.boolean().default(true),
    autoComplete: z.boolean().default(true),
    smartQuotes: z.boolean().default(true),
    overtypeKey: z.enum(["insert","none"]).default("insert"),
    undoLimit: z.number().int().min(10).max(1000).default(200)
  }),
  view: z.object({
    defaultView: z.enum(["normal","outline","pageLayout","masterDocument"]).default("pageLayout"),
    showRulers: z.boolean().default(true),
    showStatusBar: z.boolean().default(true),
    showScrollBars: z.boolean().default(true),
    theme: z.enum(["system","light","dark","highContrast"]).default("system"),
    zoomDefault: z.number().int().min(10).max(500).default(100)
  }),
  save: z.object({
    autosaveIntervalSec: z.number().int().min(30).max(1800).default(120),
    defaultFormat: z.enum(["docx","dotx","rtf"]).default("docx"),
    keepBackup: z.boolean().default(false),
    promptForProperties: z.boolean().default(false)
  }),
  print: z.object({
    defaultPrinter: z.string().optional(),
    draftQuality: z.boolean().default(false),
    includeComments: z.boolean().default(false),
    includeHiddenText: z.boolean().default(false),
    includeFields: z.boolean().default(true)
  }),
  security: z.object({
    blockMacros: z.boolean().default(true),
    warnMacros: z.boolean().default(true),
    warnExternalLinks: z.boolean().default(true)
  }),
  dictionaries: z.object({
    main: z.string().default("en-US"),
    additional: z.array(z.string()).default([]),
    customWordsPath: z.string().optional()
  }),
  shortcuts: z.record(z.string(), z.string()).default({}),
  update: z.object({
    channel: z.enum(["stable","beta","canary"]).default("stable"),
    autoDownload: z.boolean().default(true),
    installOnQuit: z.boolean().default(true),
    checkEveryHours: z.number().int().min(1).max(168).default(6)
  }),
  crash: z.object({
    uploadOptIn: z.boolean().default(false),
    submitUrl: z.string().optional()
  }),
  telemetry: z.object({
    optIn: z.boolean().default(false),
    endpoint: z.string().optional()
  }),
  windowState: z.record(z.string(), z.object({
    bounds: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
    maximized: z.boolean(),
    fullScreen: z.boolean(),
    displayId: z.number().optional()
  })).default({})
});
export type Prefs = z.infer<typeof PrefsSchema>;
```

### 17.3 Reactive Propagation

When `prefs.set` mutates a key, main validates, persists, and broadcasts `prefs.changed` with the dot-path. The renderer subscribes per category and rehydrates relevant stores (Redux / Zustand / editor engine).

### 17.4 Reset-to-Default

`prefs.reset()` with no key resets entire config; with a key it resets that path only. Reset triggers a full `prefs.changed` fan-out.

### 17.5 User Dictionaries

Custom words live at `dictionaries.customWordsPath` (default is `<configDir>/dictionaries/custom.dic` line-separated UTF-8). Hunspell in the utility process loads this at init and appends on `util.spellcheck.addWord` with scope=`user`.

### 17.6 Migration

A numeric `schemaVersion` field at the top of `config.json` gates migrations. Each version bump registers a `(prev, next) => Prefs` function. On load we run all applicable migrations sequentially, write the new `config.json`, and continue. The prior config is backed up as `config.json.bak.<ts>`.

## 18. Internationalization of Main Process

### 18.1 Source of Strings

Same bundles as renderer (`packages/i18n/src/<locale>.json`). Main loads the bundle synchronously at startup using Node `fs` (no bundler overhead in main).

### 18.2 Where Main Renders Strings

- macOS native menu labels.
- System tray menu (if implemented).
- Native dialogs (`dialog.showMessageBox` titles, messages, buttons).
- Notifications.
- Update prompt dialogs.

### 18.3 Runtime Locale Switch

On `prefs.changed` for `general.locale`:
- Main reloads the i18n bundle.
- Main rebuilds the macOS menu.
- Main updates recent-files labels on the Jump List.
- Main broadcasts `theme.changed` equivalently (renderer already listens to `prefs.changed`).

Native dialogs currently open reuse the locale at open time (we don't retranslate open modals).

### 18.4 Fallback

If the locale JSON is missing a key we fall back to `en-US`, then to the key itself.

## 19. Testing

### 19.1 Unit: Vitest

- Pure main-process functions (`atomicWrite`, `lockAcquire`, `extractFilePaths`, `hardenSession`'s CSP composer) tested with mocked `fs`, `electron` modules.
- zod schemas round-tripped against fixtures under `tests/fixtures/ipc/`.
- IPC router tested with a fake `ipcMain` harness that simulates `invoke` / response envelopes.

### 19.2 Integration: Playwright Electron

```ts
import { _electron as electron, expect, test } from "@playwright/test";

test("open via file arg launches app and opens doc", async () => {
  const app = await electron.launch({
    args: ["dist/main.js", "tests/fixtures/sample.docx"],
    env: { NODE_ENV: "test" }
  });
  const win = await app.firstWindow();
  await expect(win.locator(".document-root")).toBeVisible();
  await expect(win).toHaveTitle(/sample\.docx/);
  await app.close();
});

test("drag-drop a .docx opens it", async () => {
  const app = await electron.launch({ args: ["dist/main.js"] });
  const win = await app.firstWindow();
  await win.evaluate(async () => {
    await window.wp.file.openPath({ path: "/tmp/sample.docx" });
  });
  await expect(win.locator(".document-root")).toBeVisible();
  await app.close();
});

test("print-to-pdf produces a readable file", async () => {
  const app = await electron.launch({ args: ["dist/main.js", "tests/fixtures/sample.docx"] });
  const win = await app.firstWindow();
  const out = "/tmp/out-wp.pdf";
  await win.evaluate(async (p) => {
    await window.wp.print.toPdf({ destination: p });
  }, out);
  const fs = await import("node:fs/promises");
  const head = (await fs.readFile(out)).subarray(0, 4).toString();
  expect(head).toBe("%PDF");
  await app.close();
});

test("autosave and recover after renderer crash", async () => {
  const app = await electron.launch({ args: ["dist/main.js"] });
  const win = await app.firstWindow();
  await win.evaluate(() => window.__test_typeAndCrash());
  const win2 = await app.waitForEvent("window");
  await expect(win2.locator(".recovery-banner")).toBeVisible();
  await app.close();
});

test("update check (mocked) flows to downloaded event", async () => {
  // electron-updater pointed at a local http server serving latest.yml + .exe
  // ...
});
```

### 19.3 Security Tests

- CSP regression: headless Chrome loads the main HTML and fails if any `script-src` host other than `'self'` is present.
- `contextIsolation` regression: `win.evaluate(() => typeof require)` must be `"undefined"`.
- `nodeIntegration` regression: `window.process` must be `undefined` in renderer.
- Bad-channel test: `ipcRenderer.invoke("unknown.channel", {})` must time out or return `{ ok: false, error: { code: "E_BAD_CHANNEL" } }`.

### 19.4 Fuzzing

A `fast-check` harness feeds random byte streams into the DOCX parser utility process; every non-crash result is considered pass. Crashes are captured as reproduction seeds for the parser team.

## 20. Directory Layout

```
packages/
  ipc-schema/
    src/
      index.ts                  # zod schemas + Channels map
      package.json
  shell/
    src/
      main.ts                   # entry
      preload.ts                # context-bridge
      protocol.ts               # app:// handler
      windows.ts                # WindowManager
      menu.ts                   # native menu (macOS)
      fileio.ts                 # atomic write, lock, autosave
      printing.ts               # print + printToPDF
      update.ts                 # electron-updater wiring
      prefs.ts                  # PreferencesStore (electron-store + zod)
      log.ts                    # electron-log configuration
      crash.ts                  # crashReporter + dialogs
      i18n.ts                   # locale bundle loader
      jumpList.ts
      dockMenu.ts
      ipc/
        router.ts               # mountRouter, register
        file.ts                 # file.* handlers
        autosave.ts
        print.ts
        update.ts
        clipboard.ts
        shell.ts
        dialog.ts
        prefs.ts
        telemetry.ts
        util.ts                 # util.* handlers (fan out to utilityProcess)
      utility/
        supervisor.ts           # UtilitySupervisor
        docx-parser.ts          # utilityProcess entry
        spell.ts                # utilityProcess entry
        indexer.ts              # utilityProcess entry
        macro-sanitizer.ts      # utilityProcess entry
        envelope.ts             # UtilityEnvelope type (below)
    resources/
      dictionaries/
        en-US.dic
        en-US.aff
      icons/
        wordparity.icns
        wordparity.ico
        wordparity.png
    forge.config.ts
    package.json
  renderer/
    src/
      global.d.ts
      ...                        # see ui.md, editor.md
    package.json
  i18n/
    src/en-US.json
    src/de-DE.json
    ...
```

## 21. Concrete TypeScript: UtilityProcess Envelope

### 21.1 Envelope Interface

```ts
// packages/shell/src/utility/envelope.ts
export interface UtilityEnvelope<TReq = unknown, TRes = unknown> {
  readonly jobId: string;
  readonly method: string;
  readonly req?: TReq;
  readonly res?: TRes;
  readonly err?: { code: string; message: string; stack?: string };
  readonly progress?: { phase: string; pct?: number };
  readonly kind: "request" | "response" | "progress" | "error";
  readonly at: number; // epoch ms
}

export interface UtilityAPI {
  call<TReq, TRes>(method: string, req: TReq, opts?: {
    timeoutMs?: number;
    onProgress?: (p: { phase: string; pct?: number }) => void;
    transfer?: Array<ArrayBuffer | MessagePort>;
  }): Promise<TRes>;
}
```

### 21.2 Supervisor Implementation

```ts
// packages/shell/src/utility/supervisor.ts
import { utilityProcess, MessageChannelMain, type UtilityProcess } from "electron";
import { UtilityEnvelope } from "./envelope";
import { log } from "../log";

interface Pending {
  resolve: (v: any) => void;
  reject: (e: any) => void;
  onProgress?: (p: any) => void;
  timeout: NodeJS.Timeout;
}

export class UtilityClient {
  private proc: UtilityProcess;
  private pending = new Map<string, Pending>();

  constructor(private readonly name: string, private readonly entry: string) {
    this.spawn();
  }

  private spawn() {
    const proc = utilityProcess.fork(this.entry, [], {
      serviceName: this.name,
      stdio: "pipe",
      allowLoadingUnsignedLibraries: false
    });
    proc.stdout?.on("data", d => log.debug(`[${this.name} stdout]`, d.toString()));
    proc.stderr?.on("data", d => log.warn(`[${this.name} stderr]`, d.toString()));
    proc.on("message", (msg: UtilityEnvelope) => this.handleMsg(msg));
    proc.on("exit", (code) => this.handleExit(code));
    this.proc = proc;
  }

  private handleMsg(msg: UtilityEnvelope) {
    const p = this.pending.get(msg.jobId);
    if (!p) return;
    if (msg.kind === "progress") { p.onProgress?.(msg.progress); return; }
    clearTimeout(p.timeout);
    this.pending.delete(msg.jobId);
    if (msg.kind === "error") p.reject(Object.assign(new Error(msg.err?.message ?? "utility error"), { code: msg.err?.code }));
    else                      p.resolve(msg.res);
  }

  private handleExit(code: number | null) {
    for (const p of this.pending.values()) p.reject(new Error(`utility ${this.name} exited ${code}`));
    this.pending.clear();
    setTimeout(() => this.spawn(), 200); // simple backoff
  }

  call<TReq, TRes>(method: string, req: TReq, opts: { timeoutMs?: number; onProgress?: (p: any) => void } = {}): Promise<TRes> {
    const jobId = crypto.randomUUID();
    return new Promise<TRes>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(jobId);
        reject(new Error(`utility ${this.name} ${method} timed out`));
      }, opts.timeoutMs ?? 60_000);
      this.pending.set(jobId, { resolve, reject, onProgress: opts.onProgress, timeout });
      const env: UtilityEnvelope = { jobId, method, req, kind: "request", at: Date.now() };
      this.proc.postMessage(env);
    });
  }
}
```

### 21.3 Utility Entry Boilerplate

```ts
// packages/shell/src/utility/docx-parser.ts
import { UtilityEnvelope } from "./envelope";
import { parseDocx, serializeDocx } from "@word/docx";

type Methods = {
  "parse": (req: { bytes: Uint8Array; options: any }) => Promise<{ docJson: string; warnings: string[]; hasMacros: boolean; vbaRisk?: string }>;
  "serialize": (req: { docJson: string; options: any }) => Promise<{ bytes: Uint8Array; warnings: string[] }>;
};

const methods: Methods = {
  async parse(req) {
    const res = await parseDocx(req.bytes, req.options);
    return { docJson: JSON.stringify(res.document), warnings: res.warnings, hasMacros: res.hasMacros, vbaRisk: res.vbaRisk };
  },
  async serialize(req) {
    const doc = JSON.parse(req.docJson);
    const bytes = await serializeDocx(doc, req.options);
    return { bytes, warnings: [] };
  }
};

process.parentPort!.on("message", async (evt) => {
  const msg = evt.data as UtilityEnvelope;
  if (msg.kind !== "request") return;
  try {
    const m = (methods as any)[msg.method];
    if (!m) throw Object.assign(new Error("no method"), { code: "E_BAD_METHOD" });
    const res = await m(msg.req);
    process.parentPort!.postMessage({ jobId: msg.jobId, method: msg.method, res, kind: "response", at: Date.now() } satisfies UtilityEnvelope);
  } catch (err: any) {
    process.parentPort!.postMessage({ jobId: msg.jobId, method: msg.method, err: { code: err.code ?? "E_UTIL", message: err.message, stack: err.stack }, kind: "error", at: Date.now() } satisfies UtilityEnvelope);
  }
});
```

### 21.4 Connecting util.* IPC to Supervisor

```ts
// packages/shell/src/ipc/util.ts
import { UtilityClient } from "../utility/supervisor";
import { register } from "./router";

const parser = new UtilityClient("docx-parser", require.resolve("../utility/docx-parser.js"));
const spell  = new UtilityClient("spell-check", require.resolve("../utility/spell.js"));
const indexer = new UtilityClient("indexer",     require.resolve("../utility/indexer.js"));
const macro   = new UtilityClient("macro-sanitizer", require.resolve("../utility/macro-sanitizer.js"));

register("util.parse.docx", async (req) => parser.call("parse", req));
register("util.serialize.docx", async (req) => parser.call("serialize", req));
register("util.spellcheck.check",   async (req) => spell.call("check", req));
register("util.spellcheck.suggest", async (req) => spell.call("suggest", req));
register("util.spellcheck.addWord", async (req) => spell.call("addWord", req));
register("util.indexer.build",  async (req) => indexer.call("build", req));
register("util.macro.sanitize", async (req) => macro.call("sanitize", req));
```

## 22. Error Boundary Pattern

### 22.1 Main

Every `ipcMain.handle` is wrapped by `mountRouter` (§4.4) such that:

1. Validation failure → `{ ok: false, error: { code: "E_VALIDATION", message } }`.
2. Handler throws → catch, map to `{ ok: false, error: { code, message } }`. If the throw has `__error`, use it; otherwise wrap as `E_UNKNOWN`.
3. Response validation failure → `{ ok: false, error: { code: "E_VALIDATION" } }`.

### 22.2 Renderer

`invoke` helper in preload (§4.5):
- Awaits envelope.
- If `ok: true`, parse `data` via zod; throw on mismatch.
- If `ok: false`, construct `Error` with `code`, `cause`, `path`, and throw.

React error boundaries in renderer catch these at component tree level:

```tsx
class IpcErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    window.wp.crash.report({ kind: "renderer", message: err.message, stack: err.stack, context: info as any });
  }
  render() {
    if (!this.state.err) return this.props.children;
    const e = this.state.err as any;
    return <ErrorPanel code={e.code ?? "E_UNKNOWN"} message={e.message} />;
  }
}
```

### 22.3 Typed Error Classes

```ts
// packages/renderer/src/ipc/errors.ts
export class IpcError extends Error {
  constructor(public code: string, message: string, public cause?: string, public path?: string) {
    super(message);
    this.name = "IpcError";
  }
}
export class FileNotFoundError extends IpcError {
  constructor(path: string) { super("E_NOT_FOUND", `File not found: ${path}`, undefined, path); }
}
export class FileLockedError extends IpcError {
  constructor(path: string, public holder: string) { super("E_LOCKED", `File locked by ${holder}`, undefined, path); }
}
// ... etc
export function throwTyped(err: { code: string; message: string; cause?: string; path?: string }): never {
  switch (err.code) {
    case "E_NOT_FOUND": throw new FileNotFoundError(err.path ?? "");
    case "E_LOCKED":    throw new FileLockedError(err.path ?? "", err.cause ?? "unknown");
    default:            throw new IpcError(err.code, err.message, err.cause, err.path);
  }
}
```

## 23. Security Review Checklist per Release

Every release candidate must pass the following checklist before promotion.

### 23.1 BrowserWindow Preferences

- [ ] Unit test asserts `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`, `allowRunningInsecureContent: false`, `experimentalFeatures: false` on every `BrowserWindow` constructor in the codebase. The test greps the source tree and fails if any window-creation site omits the check.

### 23.2 CSP

- [ ] HTML `<meta http-equiv="Content-Security-Policy">` present and strict.
- [ ] `session.webRequest.onHeadersReceived` applies CSP for defense-in-depth.
- [ ] CSP scanned via `csp-evaluator` headless against `app://bundle/index.html`; no `unsafe-eval`, no `unsafe-inline` in `script-src`.

### 23.3 Remote Content

- [ ] No `win.loadURL('http*')` anywhere in the codebase (grep CI check).
- [ ] `shell.openExternal` only called with URLs validated by `ShellOpenExternalReq` zod schema.
- [ ] `will-navigate` and `setWindowOpenHandler` registered on every new window.

### 23.4 Dependencies

- [ ] `npm audit --omit=dev --audit-level=moderate` passes, or waivers documented.
- [ ] `@electron/security-checks` passes.
- [ ] Snyk / GitHub Advanced Security scan green.
- [ ] License audit: no GPL in runtime dependencies unless pre-approved.

### 23.5 Signing and Notarization

- [ ] Windows: EV certificate sign verified (`signtool verify /pa`).
- [ ] macOS: `spctl --assess --verbose=4` passes; `stapler validate` passes.
- [ ] Linux: detached `minisign` signature matches published public key.

### 23.6 Fuses

- [ ] `@electron/fuses` tool run against built binary; expected fuse settings confirmed.

### 23.7 Fuzzing

- [ ] Parser fuzz suite ran for 10 CPU-hours minimum on current release branch; no new crashes.
- [ ] Spell-check fuzz ran for 1 CPU-hour.

### 23.8 Preload Surface Drift

- [ ] Public `window.wp` surface compared to previous release; any additions have a security review checkbox.
- [ ] No direct exposure of `ipcRenderer`, `webFrame`, `process`, `fs`, or Electron modules on the renderer global.

### 23.9 Integration Smoke

- [ ] Playwright suite green on all three OS CI runners.
- [ ] Manual smoke: open 100-page doc, save, autosave recovery, print preview, print-to-PDF, clipboard round-trip, update check (staged), file-association open, drag-drop open.

### 23.10 Privacy

- [ ] No network request at startup unless update check or telemetry opt-in is on.
- [ ] Crash reporter opt-in default off.
- [ ] Log redaction spot-check: grep log dir for `/Users/`, `C:\Users\`, `/home/` — none present.

## 24. Example Main Entry (Condensed)

```ts
// packages/shell/src/main.ts
import { app, BrowserWindow, session, nativeTheme } from "electron";
import * as path from "node:path";
import { registerAppProtocol } from "./protocol";
import { hardenSession, createMainWindow } from "./windows";
import { buildMacMenu } from "./menu";
import { mountRouter } from "./ipc/router";
import { configurePrefs } from "./prefs";
import { configureLog } from "./log";
import { configureCrash } from "./crash";
import { configureAutoUpdate } from "./update";
import "./ipc/file";
import "./ipc/autosave";
import "./ipc/print";
import "./ipc/update";
import "./ipc/clipboard";
import "./ipc/shell";
import "./ipc/dialog";
import "./ipc/prefs";
import "./ipc/telemetry";
import "./ipc/util";

const SINGLE = app.requestSingleInstanceLock();
if (!SINGLE) { app.quit(); process.exit(0); }

app.setAppUserModelId("net.wordparity.app");

const resources = path.join(__dirname, "..", "resources");
registerAppProtocol(path.join(resources, "renderer"));

app.whenReady().then(async () => {
  configureLog();
  const prefs = await configurePrefs();
  configureCrash(prefs);
  mountRouter();

  const win = createMainWindow(path.join(__dirname, "preload.js"));
  hardenSession(win);
  configureAutoUpdate(prefs, () => win);

  if (process.platform === "darwin") buildMacMenu(prefs.get("general.locale"));

  await win.loadURL("app://bundle/index.html");
  win.once("ready-to-show", () => win.show());

  // kick off startup update check after 30s
  setTimeout(() => {
    try { require("electron-updater").autoUpdater.checkForUpdates(); }
    catch (e) { /* offline, retry later */ }
  }, 30_000);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("second-instance", (_e, argv) => {
  const { windowManager } = require("./windows");
  const win = windowManager.getMainWindow();
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  for (const p of argv.slice(1).filter((a: string) => /\.(docx|dotx|dot|doc|rtf)$/i.test(a))) {
    windowManager.openPathInActiveWindow(p);
  }
});

app.on("open-file", (e, p) => {
  e.preventDefault();
  app.whenReady().then(() => require("./windows").windowManager.openPathInActiveWindow(p));
});
```

## 25. Threat Model (Summary)

### 25.1 Assets

- User document contents.
- User credentials stored in OS keychain (if we ever store any; v1 does not).
- User address book (we do not touch).
- Install-time privileges (the installer runs as user on Windows; admin only for per-machine install).

### 25.2 Attackers

- **Malicious document**: DOCX with crafted XML, embedded images, or OLE objects.
- **Malicious website dragged onto the app**: dragged URL that tries to navigate to remote.
- **Supply-chain compromise**: malicious npm dependency.
- **Local attacker with filesystem access**: not a primary target (OS sandbox assumed).

### 25.3 Mitigations

| Asset | Attacker | Mitigation |
|---|---|---|
| Document contents | malicious DOCX | parser in utility process; macro sanitizer; CSP blocks exfil |
| Renderer integrity | malicious HTML paste | sandbox + contextIsolation; CSP blocks script-src ≠ self |
| Local FS | renderer compromise | renderer has no fs access; only paths main hands back |
| Update channel | attacker serving fake update | code-signing verification; minisign on Linux |
| Dependency chain | poisoned npm | lockfile pins; pnpm audit; Dependabot; SBOM; Sigstore |
| Auto-update server impersonation | DNS hijack | HTTPS + TLS cert pinning; minisign |

### 25.4 Out of Scope

- Kernel-level compromise of the user's OS.
- Hardware attacks (cold boot, DMA).
- Physical access with admin rights.
- Weaknesses in the user's chosen SMB/NFS server.

## 26. Migration Paths

### 26.1 From Electron Built-In `autoUpdater` to `electron-updater`

Already starting on `electron-updater`; no migration.

### 26.2 From `remote` to IPC

We never used `@electron/remote`.

### 26.3 From Custom `file://` to `app://`

Applicable to prototypes only. Production uses `app://` from v1.

## 27. Capacity and Resource Limits

### 27.1 Memory

- Renderer target: ≤ 1.5 GB for a 1000-page document including layout caches.
- Main: ≤ 150 MB resident.
- Each utility process: ≤ 250 MB (parser may peak to 500 MB on huge docs).

### 27.2 File Sizes

- Hard cap on `file.open`: 512 MB (configurable up to 2 GB).
- Hard cap on autosave: same.
- Warn above 50 MB.

### 27.3 Concurrent Documents

- MDI mode: up to 32 children per frame.
- SDI mode: up to 16 windows.

### 27.4 Print Job

- Timeout on `webContents.print`: 180 s.
- `printToPDF` rendered in the same webContents; memory spike mitigated by streaming to disk when `destination` is set.

## 28. Open Questions and Future Work

1. **Collaboration**: v3 will need CRDT + WebRTC transport. Introducing network in renderer requires relaxing CSP `connect-src`. Evaluate an in-main WebSocket proxy to keep renderer pure.
2. **Mobile**: not in scope; if targeted, Electron is the wrong tool.
3. **Apple Silicon perf**: verify layout-worker SIMD path; confirm arm64 `hunspell.wasm` is the same size/speed as x64.
4. **Hardware acceleration for layout**: WebGPU paint for selection highlight? Needs GPU process hardening review.
5. **Sandbox on Linux**: `--no-sandbox` is required on some distros (older user namespaces). Work with distributions to enable user namespaces; document fallback.
6. **Windows ARM64**: Electron has beta support; assess before GA.

## 29. Glossary

- **MDI**: Multiple Document Interface — multiple document panes inside one frame window. Word 95's primary model.
- **SDI**: Single Document Interface — one document per window.
- **Context Isolation**: Chromium feature ensuring preload and renderer JS contexts are separate V8 realms.
- **Sandbox**: Chromium renderer sandbox; restricts system calls beyond Blink.
- **Fuses**: Build-time toggles compiled into the Electron binary controlling runtime behaviors.
- **ASAR**: Electron's archive format for the `app` directory.
- **CSP**: Content Security Policy — HTTP header restricting script/style sources.
- **EV certificate**: Extended Validation code-signing certificate — lets Windows SmartScreen pass without reputation warning.
- **Hardened Runtime**: macOS code-signing feature restricting dynamic code generation and library loading.
- **Notarization**: Apple's service that scans signed bundles and permits Gatekeeper to launch them.
- **Utility Process**: Electron child process with Node, spawned via `utilityProcess.fork`.

## 30. Summary

This platform layer delivers:
- A tight, minimal privileged surface (main process) and a heavily isolated renderer, with compute offloaded to utility processes.
- A single typed IPC schema module consumed on both sides, deny-by-default, validated with zod.
- Atomic file I/O, lock-file interop with LibreOffice, autosave & recovery, file associations, drag-drop.
- Native print, print-to-PDF, print preview in-app.
- Auto-update via `electron-updater` with channels, delta updates, rollback.
- Packaging to signed MSI/NSIS (Windows), DMG (macOS, notarized), AppImage/deb/rpm/snap/flatpak (Linux).
- OS integration: Jump List, Dock menu, `.desktop`, OS theme, notifications.
- Hardened single-instance, logging with redaction, crash handling, opt-in telemetry.
- A strict security review checklist per release.

Non-scope is unambiguous: editor core, layout, DOCX internals, UI components are defined in their sibling documents; this layer only *hosts* them.
