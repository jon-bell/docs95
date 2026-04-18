# Packaging & Distribution

Cross-platform installers are produced by [electron-builder](https://www.electron.build/), wired at `packages/app/electron-builder.yml`.

## Outputs per platform

| OS      | Targets                  | Extensions                                               |
| ------- | ------------------------ | -------------------------------------------------------- |
| Linux   | AppImage, deb            | `Word-*-linux-x86_64.AppImage`, `Word-*-linux-amd64.deb` |
| macOS   | DMG, ZIP (x64 + arm64)   | `Word-*-mac-*.dmg`, `Word-*-mac-*.zip`                   |
| Windows | NSIS installer, portable | `Word-*-win-x64.exe`                                     |

Artifacts land in `packages/app/release/`.

## Building locally

From the repo root:

```
pnpm install
pnpm build                  # tsc + Vite + preload/main CJS bundles
pnpm dist                   # all targets native to the current OS
pnpm dist:mac               # macOS only (must be run on a Mac)
pnpm dist:win               # Windows only (Wine required if not on Windows)
pnpm dist:linux             # Linux only
```

Cross-building caveats:

- **macOS** artifacts can only be signed on a Mac with Apple Developer credentials. electron-builder will build unsigned `.dmg` / `.zip` files on other OSes but macOS Gatekeeper will refuse to open them without an override.
- **Windows** NSIS installers can be built on Linux or macOS via Wine, but code-signed `.exe` output requires a Windows code-signing certificate; CI builds on `windows-2022` natively.
- **Linux** AppImage and `.deb` work from any host.

## Cross-platform CI

`.github/workflows/release.yml` runs a three-runner matrix (`ubuntu-22.04`, `macos-14`, `windows-2022`) and uploads artifacts per platform. Triggered on version tags (`v*`) or manual dispatch. When the ref is a tag, a draft GitHub Release is created with all artifacts attached.

## Code signing (when you have credentials)

Supply the following repository secrets to enable signing & notarisation in CI:

**macOS**

- `CSC_LINK` — base64-encoded `.p12` Developer ID Application certificate
- `CSC_KEY_PASSWORD` — `.p12` password
- `APPLE_ID` — Apple ID for notarisation
- `APPLE_APP_SPECIFIC_PASSWORD` — app-specific password
- `APPLE_TEAM_ID` — Apple Developer team ID

**Windows**

- `CSC_LINK` — base64-encoded `.pfx` Authenticode certificate
- `CSC_KEY_PASSWORD` — `.pfx` password

Locally, export the same names as environment variables and rerun `pnpm dist:<target>`.

## Icon

The app icon lives at `packages/app/build/icon.png` (512×512). Regenerate the placeholder:

```
pnpm --filter @word/app icon
```

Replace with a designed asset when available — electron-builder will derive `.ico` (Windows) and `.icns` (macOS) automatically from any `≥ 512×512` PNG placed at that path.

## What's inside a build

The bundled app is ~100 MB (Electron runtime dominates). Our own code contributes:

- `dist/main/index.cjs` — Electron main process (~30 KB, workspace deps inlined)
- `dist/preload/index.cjs` — sandboxed preload (~20 KB, contextBridge surface)
- `dist/renderer/` — Vite output (index.html + JS/CSS bundles, ~360 KB JS uncompressed)

No `node_modules` is shipped; the CJS bundles are self-contained. electron-builder packs these into an ASAR archive alongside Electron itself.
