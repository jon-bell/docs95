# Non-Functional Requirements

Status: normative. Every number in this document is testable and gated in CI. The document is the contract; deviations require an ADR referencing this file.

## 0. Conventions

### 0.1 Measurement conventions

| Aspect | Convention |
|---|---|
| Percentiles | p50, p95, p99, p99.9 measured across at least 1,000 samples per scenario, rolling 7-day window |
| Cold | OS caches flushed (`vm.drop_caches=3` on Linux, `purge` on macOS, restart after DisableSuperfetch on Windows); Electron binary cache flushed |
| Warm | Electron main process already resident; second launch within 60s of first |
| Interactive | First input event accepted AND first frame rendered AND critical UI thread idle for 50ms |
| Frame budget | 16.6ms (60Hz). On 120Hz displays target 8.3ms but do not fail below 16.6ms |
| "Typing latency" | Time from `keydown` received by renderer to glyph pixels committed to compositor output (instrumented via `performance.measure` plus requestAnimationFrame callback) |
| Baseline hardware | Section 2 unless stated otherwise |
| "Gate" | A build breaks when the metric regresses past the stated threshold |
| "Warning" | A build annotates the PR but does not break |

### 0.2 Terminology

- **Renderer**: Electron renderer process hosting React UI and layout engine.
- **Main**: Electron main process (Node.js).
- **Utility worker**: Node `utilityProcess` or `Worker` thread used for pagination, export, import.
- **Document model**: in-memory tree under `@word/domain`.
- **Layout engine**: `@word/layout` — produces line/page boxes.
- **Render**: `@word/render` — paints boxes to canvas / DOM.
- **Persistence**: `@word/docx` — DOCX reader/writer.
- **Shell**: `@word/shell` — Electron main, menus, OS integration.

### 0.3 Gate policy

| Severity | Regression trigger | CI behaviour |
|---|---|---|
| Critical | p95 perf metric worsens > 10% vs 14-day median | Block merge |
| Major | p95 worsens 5–10% | Block merge unless signed-off by performance WG |
| Minor | p95 worsens 2–5% | PR comment, allow merge |
| Noise | < 2% | Ignore |

Thresholds apply only after the first 1,000 samples of the release have been collected (warm-up period).

### 0.4 Requirement ID scheme

Each requirement carries an ID of the form `NFR-<section>-<n>`. IDs are stable. New requirements append; deprecated requirements stay with a `DEPRECATED` tag and date.

---

## 1. Performance budgets

### 1.1 Launch

| NFR ID | Scenario | p50 | p95 | p99 | Rationale |
|---|---|---|---|---|---|
| NFR-1-1 | Cold launch to interactive empty doc | ≤ 1,500 ms | ≤ 2,500 ms | ≤ 4,000 ms | Word 95 took ~2s on 1995 hardware; users now expect sub-2s. Below 1s feels instant; above 3s feels broken. Electron cold start on the baseline hardware with V8 snapshot is ~400ms, leaving a 1.1s budget for app code. |
| NFR-1-2 | Warm launch (Electron process pre-warmed) | ≤ 800 ms | ≤ 1,500 ms | ≤ 2,500 ms | Second-launch-in-session; V8 isolate and cached bytecode resident. Sub-second reinforces responsiveness. |
| NFR-1-3 | Re-open most recent doc via dock / jump list | ≤ 1,200 ms | ≤ 2,000 ms | ≤ 3,500 ms | Common user path after auto-relaunch. |
| NFR-1-4 | First meaningful paint of splash / chrome | ≤ 400 ms | ≤ 700 ms | ≤ 1,100 ms | User-facing responsiveness anchor; must precede logic-heavy init. |
| NFR-1-5 | Background CPU after launch complete | ≤ 1% main-thread idle within 2,000 ms of `interactive` event | — | — | Heat, battery, noise. Word's idle is indistinguishable from 0%. |
| NFR-1-6 | Renderer bundle parse + execute (main thread blocking) | ≤ 500 ms p95 | — | — | Frame pacing; block longer than this and users see chrome stutter. |

### 1.2 File open

| NFR ID | Size | First meaningful paint | Fully interactive | Rationale |
|---|---|---|---|---|
| NFR-1-10 | 1-page DOCX (< 20 KB) | p50 ≤ 80 ms / p95 ≤ 200 ms | p95 ≤ 250 ms | Trivial; any slower is parser / layout bug. |
| NFR-1-11 | 10-page DOCX (~ 200 KB) | p50 ≤ 300 ms / p95 ≤ 800 ms | p95 ≤ 800 ms | Matches Word 2019 on M1 hardware. |
| NFR-1-12 | 100-page DOCX (~ 2 MB, 25k words) | p50 ≤ 500 ms / p95 ≤ 1,500 ms | p95 ≤ 2,000 ms (first 3 pages interactive; rest progressive) | Progressive layout: initial viewport prioritized. |
| NFR-1-13 | 1000-page DOCX (~ 20 MB, 250k words) | p50 ≤ 2,000 ms / p95 ≤ 4,000 ms | p95 ≤ 8,000 ms to reach any page | Lazy layout + parallel workers. User can scroll and type before full pagination finishes; jump-to-end triggers targeted pagination. |
| NFR-1-14 | 10000-page DOCX (supported but stressed) | p95 ≤ 6,000 ms | p95 ≤ 20,000 ms | Documented degradation; must not OOM. |
| NFR-1-15 | File with 500 inline images (~ 80 MB) | p95 ≤ 5,000 ms | p95 ≤ 12,000 ms | Images decoded lazily on first paint of their page. |
| NFR-1-16 | Open while existing large doc (1000p) stays in memory | Current doc typing latency remains in NFR-1-30 budget | — | Parse runs off-thread. |

### 1.3 Editing

| NFR ID | Scenario | p50 | p95 | p99 | p99.9 | Rationale |
|---|---|---|---|---|---|---|
| NFR-1-30 | Typing latency, single paragraph, 1000-page doc | ≤ 8 ms | ≤ 16 ms | ≤ 33 ms | ≤ 50 ms | Perceptual threshold is ~100ms; 50ms keeps two keystrokes inside one 60Hz frame. Word 2021 typing latency on equivalent hardware is ~10ms. |
| NFR-1-31 | Typing latency inside large table (100 rows × 20 cells) | ≤ 12 ms | ≤ 24 ms | ≤ 40 ms | ≤ 60 ms | Incremental table layout harder than flow. |
| NFR-1-32 | Paste 1k paragraphs plain text | ≤ 150 ms p95 | — | — | — | From clipboard ASCII; dominated by layout. |
| NFR-1-33 | Paste 10k paragraphs rich content from Word | ≤ 2,000 ms p95 | — | — | — | Style resolution dominant. |
| NFR-1-34 | Undo typical (single-keystroke) | ≤ 8 ms p50, ≤ 16 ms p95 | — | — | — | Inverse of NFR-1-30. |
| NFR-1-35 | Redo typical | same as undo | — | — | — | |
| NFR-1-36 | Undo large scope (replace-all across 100k words) | ≤ 3,000 ms p95 | — | — | — | Proportional to forward operation (NFR-1-54). |
| NFR-1-37 | Split paragraph at cursor (Enter) | ≤ 8 ms p95 | — | — | — | Local re-layout. |
| NFR-1-38 | Apply character style to 10k-char selection | ≤ 100 ms p95 | — | — | — | Bounded re-shape. |
| NFR-1-39 | Apply paragraph style to 100 paragraphs | ≤ 200 ms p95 | — | — | — | |
| NFR-1-40 | Insert image (1 MB PNG) | ≤ 400 ms p95 | — | — | — | Decode + layout; off-thread decode. |
| NFR-1-41 | Insert table 20×20 | ≤ 150 ms p95 | — | — | — | |

### 1.4 Scroll / viewport

| NFR ID | Scenario | Target | Floor | Rationale |
|---|---|---|---|---|
| NFR-1-50 | Scroll, 100-page doc, all view modes | 60 fps sustained | 45 fps | Anything under 60 feels laggy. |
| NFR-1-51 | Scroll, 1000-page doc | 60 fps target | 30 fps floor | Virtualization + lazy tile paint. |
| NFR-1-52 | Scroll, 10000-page doc | 30 fps target | 24 fps floor | Documented heavy-doc mode. |
| NFR-1-53 | Jump to page N in 1000-page doc (keyboard Ctrl+G) | ≤ 150 ms p95 first paint | — | Positional index must be resident. |
| NFR-1-54 | Zoom change (100% ↔ 200%) | ≤ 250 ms p95 relayout | — | |
| NFR-1-55 | Split view / Print Preview transition | ≤ 400 ms p95 | — | |

### 1.5 Find / Replace

| NFR ID | Scenario | Target | Rationale |
|---|---|---|---|
| NFR-1-60 | Find first hit, 100k-word doc, plain | ≤ 150 ms p95 | Naïve Boyer–Moore on preprocessed text slices. |
| NFR-1-61 | Find all count, 100k-word doc, plain | ≤ 500 ms p95 | Must finish before user clicks "Next" twice. |
| NFR-1-62 | Find regex, 100k-word doc | ≤ 1,000 ms p95 | RE2 via WASM; linear. |
| NFR-1-63 | Find fuzzy (Levenshtein ≤ 2), 100k-word doc | ≤ 1,000 ms p95 | Bitap / DFA. |
| NFR-1-64 | Replace all, 10k replacements, 100k-word doc | ≤ 3,000 ms p95 | Single transactional edit. |
| NFR-1-65 | Find in 1M-word doc | ≤ 1,500 ms p95 first hit | Degraded but usable. |
| NFR-1-66 | Incremental highlight while typing query | ≤ 100 ms p95 to first highlight | Debounced by 75 ms keystroke settling. |

### 1.6 Pagination / layout

| NFR ID | Scenario | Target | Rationale |
|---|---|---|---|
| NFR-1-70 | Full pagination, 1000-page doc, cold | ≤ 10,000 ms with ≥ 4 workers | Off-thread; user sees progress. |
| NFR-1-71 | Incremental repagination after 1-paragraph edit | ≤ 16 ms p95 | Localized via change propagation cutoff. |
| NFR-1-72 | Reflow on page-size change | ≤ 3,000 ms p95 (1000-page doc) | Parallelized. |
| NFR-1-73 | Line break on text insert in middle of paragraph | ≤ 4 ms p95 | Single-paragraph relayout. |
| NFR-1-74 | Widow/orphan recomputation page neighborhood | ≤ 50 ms p95 | Bounded to ±2 pages. |

### 1.7 Print / Export

| NFR ID | Scenario | Target | Rationale |
|---|---|---|---|
| NFR-1-80 | Print preview ready (current view) | ≤ 500 ms p95 | Uses same layout cache. |
| NFR-1-81 | Print dispatch to OS spooler, 100 pages | ≤ 4,000 ms p95 | Batched via native Print. |
| NFR-1-82 | Export to PDF, 100 pages, embedded fonts | ≤ 5,000 ms p95 | PDF writer in worker. |
| NFR-1-83 | Export to PDF, 1000 pages | ≤ 30,000 ms p95 | Batch workers; progress reported. |
| NFR-1-84 | Export to RTF, 100 pages | ≤ 3,000 ms p95 | |
| NFR-1-85 | Export to HTML, 100 pages | ≤ 3,000 ms p95 | |
| NFR-1-86 | Save DOCX, 100-page doc | ≤ 1,000 ms p95 | Streaming ZIP writer, fsync included. |
| NFR-1-87 | Save DOCX, 1000-page doc | ≤ 4,000 ms p95 | |
| NFR-1-88 | Autosave, 100-page doc (delta) | ≤ 200 ms p95, never blocking typing > 50 ms | Chunked write under backpressure. |

### 1.8 Memory

| NFR ID | Metric | Target | Rationale |
|---|---|---|---|
| NFR-1-100 | Renderer RSS, empty doc, steady state | ≤ 250 MB | Electron + React + layout ~180 MB baseline. |
| NFR-1-101 | Main RSS, empty doc | ≤ 150 MB | Node + Electron main. |
| NFR-1-102 | Per utility worker RSS | ≤ 100 MB | Short-lived; rehydrate on demand. |
| NFR-1-103 | Marginal memory per page of typical doc | ≤ 100 KB | 1000p × 100KB = 100MB extra; keeps total < 800MB. |
| NFR-1-104 | 1000-page doc total RSS (all processes) | ≤ 800 MB | Fits 1GB of free RAM on 4GB baseline w/ OS overhead. |
| NFR-1-105 | 10000-page doc total RSS | ≤ 4 GB | Paging to disk via segment cache allowed. |
| NFR-1-106 | GC pause p95 in renderer during typing | ≤ 4 ms | V8 incremental marking tuning; avoid typing hitch. |
| NFR-1-107 | Memory leak ceiling over 100 open/close cycles of 100p doc | ≤ 5 MB growth | Leak test in CI (NFR-9-40). |
| NFR-1-108 | Memory leak over 1 hour of typing in 100p doc | ≤ 10 MB growth | |

### 1.9 Disk I/O

| NFR ID | Metric | Target | Rationale |
|---|---|---|---|
| NFR-1-120 | fsync discipline on save | Always before rename | Crash-safety (Section 4). |
| NFR-1-121 | Open-file handle count at idle | ≤ 30 in main + ≤ 50 in renderer | Limits runaway leaks. |
| NFR-1-122 | Orphan file handles after close-all-docs | 0 | Explicit audit in test. |
| NFR-1-123 | Autosave write size, 100p doc, delta | ≤ 200 KB typical | Delta journal, not full rewrite. |
| NFR-1-124 | Startup disk read volume | ≤ 80 MB | App binary + resources. |

### 1.10 Network

The app is offline-first; network is used only for update checks and optional telemetry.

| NFR ID | Metric | Target |
|---|---|---|
| NFR-1-140 | Update check frequency | Once per launch, then every 4 hours |
| NFR-1-141 | Update check timeout | 10 s, non-blocking |
| NFR-1-142 | Telemetry batch flush | Every 5 min or 100 events, whichever first |
| NFR-1-143 | Telemetry size per flush | ≤ 32 KB gzipped |
| NFR-1-144 | Offline behaviour | All core features function with no network |

### 1.11 Startup budget breakdown

Cold launch p95 of 2,500 ms decomposed to allow engineering targeting:

| Phase | Budget (ms) | Notes |
|---|---|---|
| OS exec + Electron bootstrap | 400 | Measured on baseline hardware. |
| Main process init (menus, IPC) | 150 | |
| Renderer process spawn | 200 | |
| HTML/JS bundle parse & execute | 500 | Bundle ≤ 2MB gzipped. |
| React mount + theme | 150 | |
| Layout engine init (ICU4X WASM, hyphenation patterns) | 400 | ICU4X data lazy-loaded post-interactive except required slices. |
| Empty doc creation & first paint | 300 | |
| Ready for input event dispatch | 100 | |
| Slack | 300 | Reserved for OS variability. |
| **Total** | **2,500** | Matches p95 NFR-1-1. |

---

## 2. Hardware baseline

### 2.1 Target ("supported") hardware

| Platform | CPU | RAM | Disk | GPU | Display |
|---|---|---|---|---|---|
| Windows 10 22H2 / 11 23H2 | Intel i5-10210U / AMD Ryzen 5 3600 | 8 GB | SSD | Integrated | 1080p @ 100% and 4K @ 150% |
| macOS 11 (Big Sur) to 15 (Sequoia) | Apple M1 | 8 GB | SSD | Apple GPU | Retina 2560×1600 |
| Linux: Ubuntu 22.04 / Fedora 40 / Debian 12 | Intel i5-10th / Ryzen 5 3600 | 8 GB | SSD | Integrated | 1080p |

All performance NFRs in Section 1 apply on this hardware.

### 2.2 Minimum ("runs") hardware

| Resource | Minimum |
|---|---|
| CPU | 2 cores @ 2.0 GHz 64-bit x86-64-v2 or ARMv8.2-A |
| RAM | 4 GB |
| Disk | HDD acceptable (500 MB free for install + 1 GB for caches) |
| GPU | Software rendering supported via SwiftShader |
| Display | 1366×768 |

On minimum hardware:
- NFR-1-1 cold launch may slip to ≤ 5,000 ms p95 (documented).
- 1000-page docs are warned (Section 3).
- Frame rate floor is 30 fps everywhere.

### 2.3 Unsupported

| Not supported | Reason |
|---|---|
| 32-bit OS | Electron drops 32-bit builds. |
| < 4 GB RAM | OOM inevitable on typical docs. |
| Touch-only no-keyboard tablets | Keyboard is core. |
| Remote desktop sessions at < 720p | Documented degraded behaviour but not gated. |

### 2.4 OS versions

| OS | Supported versions | Deprecation rule |
|---|---|---|
| Windows | 10 22H2, 11 | Drop a version 12 months after EOL |
| macOS | 11, 12, 13, 14, 15 | Latest 4 majors rolling |
| Linux | Ubuntu 22.04, 24.04; Fedora 39+; Debian 12+; RHEL 9+ | Track glibc ≥ 2.31 |

---

## 3. Document-size limits

### 3.1 Graceful support ("works as designed")

| Limit | Value |
|---|---|
| Pages | 10,000 |
| Words | 1,000,000 |
| Characters | 10,000,000 |
| Paragraphs | 500,000 |
| Images (inline + floating) | 500 |
| Image total decoded size | 2 GB |
| Styles (paragraph + character) | 2,000 |
| Fonts embedded | 50 |
| Tables | 5,000 |
| Table rows per table | 10,000 |
| Table columns per table | 63 (ECMA-376 cap) |
| Footnotes + endnotes | 10,000 |
| Bookmarks | 10,000 |
| Hyperlinks | 10,000 |
| Comments | 10,000 |
| Tracked-change revisions | 100,000 |
| Sections | 1,000 |
| Headers/footers unique | 1,000 |
| File size (DOCX on disk) | 100 MB |
| Uncompressed payload | 2 GB |

### 3.2 Soft limits (warn user, continue)

| Trigger | Warning |
|---|---|
| Pages > 5,000 | "Documents above 5,000 pages may run slower. Consider splitting into sections." |
| Words > 250,000 | "Find/Replace may take several seconds on documents of this size." |
| Images > 250 | "Images above this count increase memory use." |
| File size > 50 MB | "Large files take longer to save. Autosave interval increased to 30 min." |
| Styles > 1,000 | "Many styles detected; consider cleanup." |
| Tracked changes > 20,000 | "Consider accepting old changes." |

Warnings are surfaced once per session per trigger, dismissable, remembered per document (via custom XML part).

### 3.3 Hard limits (refuse)

| Trigger | Behaviour |
|---|---|
| Pages > 50,000 | Open dialog: "This document exceeds supported size (50,000 pages). Open in read-only recovery mode?" |
| File size > 500 MB | Refuse unless recovery mode |
| Uncompressed payload > 2 GB | Refuse (also a ZIP-bomb defense per NFR-5-30) |
| Single image > 100 megapixels decoded | Skip image; log warning |
| Single paragraph > 10 MB text | Refuse with recovery offer |
| XML depth > 256 | Refuse (defense) |
| ZIP entries > 10,000 | Refuse (defense) |

### 3.4 Edit-session limits

| Resource | Limit | Policy on exceed |
|---|---|---|
| Undo stack transactions | 500 | FIFO drop oldest |
| Undo stack data (serialized patches) | 50 MB | FIFO drop oldest |
| Redo stack (on new branch) | cleared | Standard semantics |
| Clipboard size (copy from us) | 100 MB | Truncate with warning |
| Clipboard size (paste from OS) | 500 MB | Refuse with error |
| Concurrent open docs | 64 | Refuse 65th with suggestion to close one |

---

## 4. Reliability

### 4.1 Autosave

| NFR ID | Requirement |
|---|---|
| NFR-4-1 | Configurable interval: 1, 5, 10, 15, 30 min; default **10 min** (Word default). |
| NFR-4-2 | Autosave writes to `.~$<filename>.docx` in the document's directory (Word convention). If unwritable, fall back to `<userData>/autosave/<hashed-path>.docx`. |
| NFR-4-3 | Autosave must never block keystroke handling more than 50 ms. |
| NFR-4-4 | Autosave is incremental where possible: only changed parts (`document.xml`, changed media) re-serialized; other parts reused by file copy. |
| NFR-4-5 | Autosave suspended during active text composition (IME) and during user drag operations. |
| NFR-4-6 | Autosave on focus-loss if > 30 s since last autosave. |
| NFR-4-7 | Autosave files are deleted on successful explicit save **AND** on graceful close with no unsaved changes. |

### 4.2 Crash recovery

| NFR ID | Requirement |
|---|---|
| NFR-4-10 | On launch, scan configured autosave locations; if any orphan autosave files exist, show Document Recovery pane. |
| NFR-4-11 | Recovery pane lists each candidate with path, last modified time, size; one-click recover or discard. |
| NFR-4-12 | Recovery tested in CI by SIGKILL / TerminateProcess harness (NFR-9-50). |
| NFR-4-13 | Partial writes must be detectable: autosave file contains trailing integrity record (CRC over prior bytes). Files failing verification marked "recover with warnings". |

### 4.3 Save atomicity

| NFR ID | Requirement |
|---|---|
| NFR-4-20 | Save pipeline: (1) write to `<dir>/.~save-<uuid>.docx`, (2) fsync/FlushFileBuffers, (3) rename over target — atomic on POSIX (`rename(2)`) and Windows (`MoveFileEx` with `MOVEFILE_REPLACE_EXISTING \| MOVEFILE_WRITE_THROUGH`). |
| NFR-4-21 | If rename fails, keep temp file, surface error, do not leave target corrupt. |
| NFR-4-22 | On network filesystems (SMB, NFS), detect via OS hints; still attempt atomic replace; if unsupported, explicit copy+flush+rename with warning in logs. |
| NFR-4-23 | Backup file `.bak`: optional user preference (default off, matches Word). When on, original is renamed to `<name>.bak` before new content written. |
| NFR-4-24 | Preserve original file metadata on save: owner (where permitted), timestamps mode = "modify only mtime", ACLs where supported. |

### 4.4 Corruption protection

| NFR ID | Requirement |
|---|---|
| NFR-4-30 | Before save returns success: compute CRC-32 of every ZIP entry; verify by re-reading entries via the same ZIP reader used by `@word/docx`. |
| NFR-4-31 | On any verify mismatch, treat save as failed; restore prior file; log incident. |
| NFR-4-32 | On open, verify manifest against content types; flag inconsistencies non-fatally, continue with warnings. |

### 4.5 Locks

| NFR ID | Requirement |
|---|---|
| NFR-4-40 | Create owner-lock file `~$<name>.docx` in document directory (Word convention). Contains our PID + timestamp + hostname + user. |
| NFR-4-41 | On open, if owner-lock present and PID/host live, prompt: "Open read-only / Notify when free / Cancel". |
| NFR-4-42 | Stale lock detection: owner-lock older than 24h or PID dead → offer "take over" with warning. |
| NFR-4-43 | Advisory `flock`/`LockFileEx` on the document file while editing, best-effort. |

### 4.6 Session recovery

| NFR ID | Requirement |
|---|---|
| NFR-4-50 | Optional "reopen docs from last session" (off by default, Word parity). |
| NFR-4-51 | Recent files list: 20 entries; keyed by stable path + inode/FileID for rename tracking. |

### 4.7 Reliability SLOs

| NFR ID | Metric | Target |
|---|---|---|
| NFR-4-60 | Crash-free session rate (14-day rolling) | ≥ 99.9% |
| NFR-4-61 | ANR-free session rate (> 5s main-thread block) | ≥ 99.5% |
| NFR-4-62 | Unrecoverable data loss per 100,000 sessions | 0 (hard gate) |
| NFR-4-63 | Save-induced corruption per 100,000 saves | 0 (hard gate) |
| NFR-4-64 | Recovery success rate after SIGKILL | ≥ 99% of files with ≤ 10 s of work lost |

### 4.8 Error handling

| NFR ID | Requirement |
|---|---|
| NFR-4-70 | No uncaught promise rejections in release; lint rule `no-floating-promises` enforced. |
| NFR-4-71 | Every IPC call has a typed error response; no UI spinners without timeout. |
| NFR-4-72 | Layout/render errors degrade gracefully: unrenderable run is replaced with a visible red diamond glyph and a machine-reportable error code; editing elsewhere continues to work. |
| NFR-4-73 | Persistence errors surface in a retry dialog with "Save copy as..." fallback. |

---

## 5. Security

### 5.1 Electron hardening baseline

| NFR ID | Flag / behaviour | Value |
|---|---|---|
| NFR-5-1 | `contextIsolation` | `true` |
| NFR-5-2 | `nodeIntegration` | `false` |
| NFR-5-3 | `nodeIntegrationInWorker` | `false` |
| NFR-5-4 | `nodeIntegrationInSubFrames` | `false` |
| NFR-5-5 | `sandbox` | `true` |
| NFR-5-6 | `webSecurity` | `true` |
| NFR-5-7 | `allowRunningInsecureContent` | `false` |
| NFR-5-8 | `experimentalFeatures` | `false` |
| NFR-5-9 | `enableRemoteModule` | `false` (removed in modern Electron) |
| NFR-5-10 | `plugins` | `false` |
| NFR-5-11 | `webviewTag` | `false` |
| NFR-5-12 | `navigateOnDragDrop` | `false` |
| NFR-5-13 | `disableBlinkFeatures` | `Auxclick` |
| NFR-5-14 | `autoplayPolicy` | `document-user-activation-required` |
| NFR-5-15 | preload script exposes only allowlisted APIs via `contextBridge.exposeInMainWorld` |
| NFR-5-16 | Fuses: cookie encryption on, node options disabled in packaged, ASAR integrity on |
| NFR-5-17 | No `remote` module usage anywhere |
| NFR-5-18 | `WebContents.session.setPermissionRequestHandler` denies all by default except clipboard |
| NFR-5-19 | `will-navigate` handler: denies all navigation away from `app://` origin |
| NFR-5-20 | `new-window` handler: redirects all external URLs to OS shell via confirmed hyperlink flow |

### 5.2 Content Security Policy

```
default-src 'none';
script-src 'self';
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
img-src 'self' data: blob:;
connect-src 'self';
media-src 'self' blob:;
worker-src 'self' blob:;
frame-ancestors 'none';
base-uri 'none';
form-action 'none';
object-src 'none';
```

Notes:
- `'unsafe-inline'` in `style-src` is required for dynamically generated style runs; justified and documented in ADR-security-001.
- CSP is set via HTTP `Content-Security-Policy` header on the `app://` protocol handler (not only via `<meta>`, so it applies to preload).

### 5.3 IPC

| NFR ID | Requirement |
|---|---|
| NFR-5-25 | All IPC channels registered in a typed channel registry with zod schemas for payload and response. Unknown channels return `UnhandledChannelError` without logging user input. |
| NFR-5-26 | Preload exposes no filesystem primitives; only domain verbs (`openFileAtPath`, `saveAs`, etc.). |
| NFR-5-27 | Path arguments are resolved against the session's allowed path set and rejected otherwise. |
| NFR-5-28 | IPC timeouts: 30 s default, 120 s for heavy ops (export, import big file). |
| NFR-5-29 | No synchronous IPC from renderer; all `invoke`/`handle` async. |

### 5.4 ZIP (DOCX) defenses

| NFR ID | Defense | Limit |
|---|---|---|
| NFR-5-30 | Uncompressed size cap | 2 GB |
| NFR-5-31 | Compression-ratio cap | Refuse entry whose ratio > 200× |
| NFR-5-32 | Per-entry uncompressed cap | 500 MB |
| NFR-5-33 | Entry count cap | 10,000 |
| NFR-5-34 | Zip-slip protection | Entry name normalized; rejected if resolves outside extraction root or contains `..`, absolute paths, or drive letters |
| NFR-5-35 | Symbolic links inside ZIP | Refused |
| NFR-5-36 | Duplicate entry names | Refused |
| NFR-5-37 | Non-UTF-8 entry names | Accepted only if declared CP437 or UTF-8 per ZIP spec; else sanitized, logged |
| NFR-5-38 | ZIP64 | Supported, same caps apply |
| NFR-5-39 | Streaming parse | Required; no full extraction to disk before caps verified |

### 5.5 XML defenses

| NFR ID | Defense |
|---|---|
| NFR-5-50 | DOCTYPE declarations rejected |
| NFR-5-51 | External entities disabled (XXE) |
| NFR-5-52 | External DTD loading disabled |
| NFR-5-53 | Entity expansion capped at 1,024 expansions and 1 MB expanded size (billion-laughs) |
| NFR-5-54 | Max element depth 256 |
| NFR-5-55 | Max attribute count per element 256 |
| NFR-5-56 | Max attribute value length 1 MB |
| NFR-5-57 | Parser is `sax-wasm` or `fxp` in strict mode; confirmed-safe config baked in |
| NFR-5-58 | Namespace resolution strict; unknown namespaces tolerated but not executed |

### 5.6 Macros and legacy code

| NFR ID | Requirement |
|---|---|
| NFR-5-70 | `.docm` files open **read-only** with a yellow warning bar: "Macros are not supported. File opened read-only." |
| NFR-5-71 | `vbaProject.bin` and `vbaData.xml` are preserved byte-exact on round-trip through the `UnknownPart` mechanism. |
| NFR-5-72 | Never execute VBA, WordBasic, or any macro language. |
| NFR-5-73 | No shell-out, no ActiveX, no OLE automation client calls. |
| NFR-5-74 | ActiveX controls embedded in document: render placeholder; ignore code. |

### 5.7 Fonts embedded in DOCX

| NFR ID | Requirement |
|---|---|
| NFR-5-80 | Embedded fonts validated via `ot-sanitise` (WASM) before registration. |
| NFR-5-81 | Font table parse limits: glyph count ≤ 65,535; table count ≤ 256. |
| NFR-5-82 | Registration scope: `FontFace` in-renderer only; never installed system-wide. |
| NFR-5-83 | Invalid font replaced with declared family fallback; warning logged. |
| NFR-5-84 | Font cache cleared on doc close; `FontFaceSet.delete` called. |

### 5.8 Images

| NFR ID | Requirement |
|---|---|
| NFR-5-90 | Magic-byte sniffing; content-type from ZIP is advisory only |
| NFR-5-91 | Supported formats: PNG, JPEG, GIF, BMP, TIFF (read only), WebP, EMF/WMF (read only, rendered via vendored safe parser) |
| NFR-5-92 | EMF/WMF execution: no — metafiles are parsed into our own draw primitives; no GDI playback |
| NFR-5-93 | Decoded dimension cap per image | 100 megapixels |
| NFR-5-94 | Decoded memory cap per image | 400 MB |
| NFR-5-95 | Decoder isolated in sandboxed worker |

### 5.9 Hyperlinks and external content

| NFR ID | Requirement |
|---|---|
| NFR-5-100 | Click on hyperlink displays confirmation dialog with full URL and scheme; user may opt "always open for scheme `<X>`" — stored per-session or persistent user choice. |
| NFR-5-101 | Supported schemes: `http`, `https`, `mailto`, `file:` (with extra confirmation) |
| NFR-5-102 | Blocked schemes: `javascript`, `data`, `vbscript`, `intent`, `smb`, `ftp` unless user-unlocked in preferences |
| NFR-5-103 | Relative / intra-doc hyperlinks (`#bookmark`) stay in-app |
| NFR-5-104 | OLE servers | Not launched; OLE objects display embedded preview image only |
| NFR-5-105 | External image references (`r:link`) | Fetched only if user opts in per-document; default is "ignore" |

### 5.10 Auto-update

| NFR ID | Requirement |
|---|---|
| NFR-5-120 | Updates signed: Windows Authenticode (EV cert), macOS Developer ID + notarization + stapled ticket, Linux `.deb`/`.rpm` signed, AppImage with GPG signature |
| NFR-5-121 | Update manifest signed and verified before download |
| NFR-5-122 | Update transport TLS 1.2+; certificate pinning optional, controlled by feature flag |
| NFR-5-123 | Downloaded artifact verified (hash + signature) before apply |
| NFR-5-124 | Rollback: if post-update launch fails twice, revert to previous version from preserved backup |
| NFR-5-125 | Delta updates supported where platform permits (electron-updater) |
| NFR-5-126 | User can opt out of auto-update; only manual check remains |

### 5.11 Filesystem and process scope

| NFR ID | Requirement |
|---|---|
| NFR-5-140 | App writes only to: user home (for explicit saves), `<userData>` (config, caches, autosaves), `<temp>` (scratch), and explicitly user-chosen paths. |
| NFR-5-141 | App never reads files outside this allowlist without user consent. |
| NFR-5-142 | Child processes: only the utility workers we spawn; no `child_process.exec` on user input. |
| NFR-5-143 | `shell.openExternal` called only from main, with scheme allowlist. |

### 5.12 Secret handling

| NFR ID | Requirement |
|---|---|
| NFR-5-160 | App stores no secrets today. |
| NFR-5-161 | Future cloud-sync OAuth tokens: `keytar` (OS keychain) only; never in plaintext files. |
| NFR-5-162 | Logs and telemetry redact anything resembling tokens (regex + zxcvbn pre-send scan). |

### 5.13 Dependency hygiene

| NFR ID | Requirement |
|---|---|
| NFR-5-180 | `pnpm-lock.yaml` required, checked in, verified in CI. |
| NFR-5-181 | No wildcard versions in `package.json`. |
| NFR-5-182 | `pnpm audit` gate: fail CI on `high` or `critical`. |
| NFR-5-183 | Snyk / GitHub Dependabot gate equivalent. |
| NFR-5-184 | Renovate bot configured; updates every weekday. |
| NFR-5-185 | Native modules audited manually; allowlist only. |
| NFR-5-186 | SBOM (CycloneDX) generated per release. |

### 5.14 Telemetry privacy

| NFR ID | Requirement |
|---|---|
| NFR-5-200 | Opt-in on first run; off by default; clearly explained. |
| NFR-5-201 | Never send document content, filenames, file paths, or folder names. |
| NFR-5-202 | Install ID is random UUID generated on first run; rotates every 90 days. |
| NFR-5-203 | Crash reports strip any stack-frame data that may contain user text. |
| NFR-5-204 | User can open "what is sent" viewer from preferences, showing recent payloads. |

### 5.15 Threat model summary

Mitigated attack classes with owning requirement:

| Threat | Mitigation ID |
|---|---|
| Malicious DOCX executes code | NFR-5-70 .. 74, 5-50 .. 58, 5-30 .. 39 |
| Zip bomb | NFR-5-30 .. 39 |
| XXE / billion laughs | NFR-5-50 .. 58 |
| Zip slip | NFR-5-34 |
| Malicious font | NFR-5-80 .. 84 |
| Malicious image | NFR-5-90 .. 95 |
| Phishing hyperlink | NFR-5-100 .. 105 |
| Supply-chain attack | NFR-5-180 .. 186, 5-120 .. 126 |
| Renderer escape | NFR-5-1 .. 29 |
| Data exfil via telemetry | NFR-5-200 .. 204 |

---

## 6. Cross-platform behaviour

### 6.1 Keyboard accelerator mapping

| Action | Windows / Linux | macOS |
|---|---|---|
| Copy | Ctrl+C | Cmd+C |
| Cut | Ctrl+X | Cmd+X |
| Paste | Ctrl+V | Cmd+V |
| Paste special | Ctrl+Alt+V | Cmd+Option+V |
| Select all | Ctrl+A | Cmd+A |
| Undo | Ctrl+Z | Cmd+Z |
| Redo | Ctrl+Y / Ctrl+Shift+Z | Cmd+Shift+Z |
| Save | Ctrl+S | Cmd+S |
| Save As | Ctrl+Shift+S / F12 | Cmd+Shift+S |
| Open | Ctrl+O | Cmd+O |
| New | Ctrl+N | Cmd+N |
| Print | Ctrl+P | Cmd+P |
| Find | Ctrl+F | Cmd+F |
| Replace | Ctrl+H | Cmd+Option+F (Word macOS convention) |
| Go to page | Ctrl+G / F5 | Cmd+Option+G |
| Bold | Ctrl+B | Cmd+B |
| Italic | Ctrl+I | Cmd+I |
| Underline | Ctrl+U | Cmd+U |
| Word left/right | Ctrl+Left/Right | Option+Left/Right |
| Start/end of line | Home/End | Cmd+Left/Right |
| Start/end of doc | Ctrl+Home/End | Cmd+Up/Down |
| Delete word forward | Ctrl+Delete | Option+Delete-forward (fn+Option+Delete) |
| Delete word back | Ctrl+Backspace | Option+Backspace |
| Insert page break | Ctrl+Enter | Cmd+Enter |
| Insert column break | Ctrl+Shift+Enter | Cmd+Shift+Enter |
| Quit / close | Alt+F4 / Ctrl+Q | Cmd+Q |
| Preferences | (Tools > Options) | Cmd+, |
| Mnemonics (Alt+letter) | Yes | No (macOS HIG) |

The full mapping table is the spec's keyboard accelerator file; changes require ADR.

### 6.2 Menus

| NFR ID | Requirement |
|---|---|
| NFR-6-20 | macOS uses native application menu bar (Quit, Preferences, Hide, Hide Others, Services, Window) at the system level. |
| NFR-6-21 | Windows / Linux render in-window menu bar. |
| NFR-6-22 | In-window menu bar is retained across all platforms under a "Classic Menus" toggle (Word 95 parity) including on macOS where the native bar remains. |
| NFR-6-23 | Menu items respect accelerator table; shown on right in platform-native style (Windows underlined mnemonic + shortcut; macOS glyphs). |

### 6.3 Dialogs

| NFR ID | Requirement |
|---|---|
| NFR-6-40 | File open / save dialogs: OS-native (`dialog.showOpenDialog`, `dialog.showSaveDialog`). |
| NFR-6-41 | Print dialog: OS-native via `webContents.print` with configured options. |
| NFR-6-42 | Confirmation modals: custom UI, but follow OS button order (OK on right on Windows, on right on macOS; Linux follows GNOME HIG — detected). |

### 6.4 File associations

| Extension | Role | Registered |
|---|---|---|
| `.docx` | Primary | Read/Write |
| `.dotx` | Template | Read/Write |
| `.docm` | Macro-enabled | Read-only |
| `.dotm` | Macro-enabled template | Read-only |
| `.doc` | Legacy Word | Read via converter |
| `.dot` | Legacy template | Read via converter |
| `.rtf` | Rich Text | Read/Write |
| `.odt` | OpenDocument | Read (v2) |
| `.txt` | Plain text | Read/Write |
| `.html`/`.htm` | Web page | Read/Write |
| `.md` | Markdown | Read/Write |

Registration is per-platform installer; users can override defaults.

### 6.5 Scrolling

| NFR ID | Platform behaviour |
|---|---|
| NFR-6-60 | Windows / Linux: wheel scroll = 3 lines default; adjustable via OS setting honored. |
| NFR-6-61 | macOS: momentum scrolling honored; natural direction from system. |
| NFR-6-62 | Pinch-zoom: macOS trackpad zooms view; Windows Precision Touchpad zooms view. |
| NFR-6-63 | Touch-pad two-finger horizontal scrolls where horizontal overflow exists. |

### 6.6 Display / High-DPI

| NFR ID | Requirement |
|---|---|
| NFR-6-80 | Renders crisply at 100%, 125%, 150%, 175%, 200%, 250%, 300% OS scale. |
| NFR-6-81 | Supports multi-monitor with per-monitor DPI on Windows 10+; on DPI change, relayout within 100 ms. |
| NFR-6-82 | Retina on macOS: `@2x` icons, pixel-snapped text. |
| NFR-6-83 | 4K UHD panels at native resolution: UI text ≥ 14 CSS px at 100% scale. |

### 6.7 Locale integration

| NFR ID | Requirement |
|---|---|
| NFR-6-100 | Use OS locale for UI language default; respect per-user override. |
| NFR-6-101 | First-day-of-week, long/short date formats from OS via `Intl`. |
| NFR-6-102 | Measurement units inferred from OS region (inches / cm). User can override. |

---

## 7. Accessibility

### 7.1 Conformance

| NFR ID | Requirement |
|---|---|
| NFR-7-1 | WCAG 2.1 Level AA across all UI. |
| NFR-7-2 | ATAG 2.0 Part A where authoring applies. |
| NFR-7-3 | Published VPAT (Voluntary Product Accessibility Template) v1 at GA. |
| NFR-7-4 | Compliance re-checked each minor release via axe-core + manual screen reader pass. |

### 7.2 Keyboard

| NFR ID | Requirement |
|---|---|
| NFR-7-10 | Every action reachable from keyboard; no mouse-only flows. |
| NFR-7-11 | Tab order logical; focus trap only in modals. |
| NFR-7-12 | Escape closes top-most dialog; Enter activates default. |
| NFR-7-13 | Menu / toolbar fully keyboard-navigable (Alt activates menu on Win/Linux, F10 on all; arrow keys walk). |
| NFR-7-14 | Accelerators for all primary actions (see 6.1 table). |
| NFR-7-15 | Custom keybinding editor planned v2; default scheme Word-compatible. |

### 7.3 Screen readers

| NFR ID | Requirement |
|---|---|
| NFR-7-30 | Tested with: NVDA (Windows), JAWS (Windows), VoiceOver (macOS), Orca (Linux). |
| NFR-7-31 | Document text exposed as accessible tree: paragraphs, runs, tables, lists, headings. |
| NFR-7-32 | Accessible tree built at layout engine level (mirrors logical tree), independent of rendered glyphs; dirty-region updates fire `AXTextChanged` events. |
| NFR-7-33 | Selection and caret position exposed and reflect SR cursor. |
| NFR-7-34 | Landmarks on chrome (toolbar, status bar, document area). |
| NFR-7-35 | ARIA roles on every interactive widget; no `div`-button abuse. |
| NFR-7-36 | Live regions for: autosave notices, status changes, macro warnings. |
| NFR-7-37 | Images have alt text prompt on insert; existing alt text surfaced. |
| NFR-7-38 | Tables have row/column headers exposed. |
| NFR-7-39 | Read Order inferred from flow; document can expose reading order per paragraph. |

### 7.4 Colour and contrast

| NFR ID | Requirement |
|---|---|
| NFR-7-50 | Text contrast ≥ 4.5:1 (WCAG AA). Large text ≥ 3:1. |
| NFR-7-51 | UI component borders and focus rings ≥ 3:1 contrast. |
| NFR-7-52 | No colour-only meaning (e.g., spelling underline also has red wavy pattern differentiable without colour). |
| NFR-7-53 | Windows High Contrast mode detected via `forced-colors: active`; UI adapts. |
| NFR-7-54 | Dark mode supported on all platforms; respects OS preference. |

### 7.5 Motion, caret, focus

| NFR ID | Requirement |
|---|---|
| NFR-7-70 | `prefers-reduced-motion: reduce` honored: animations disabled; instant state changes. |
| NFR-7-71 | Caret minimum width 2 CSS px; blink rate matches OS setting; configurable; can be disabled. |
| NFR-7-72 | Every focusable has a visible focus ring ≥ 2 px at ≥ 3:1 contrast. |
| NFR-7-73 | Focus indicators do not rely on colour alone. |

### 7.6 Voice control / assistive input

| NFR ID | Requirement |
|---|---|
| NFR-7-90 | Windows Voice Access + macOS Voice Control can name every interactive element. |
| NFR-7-91 | Speech-to-text (OS-level dictation) works in edit areas. |
| NFR-7-92 | Switch access / sticky keys: no multi-key chords required for core flows; single-key alternatives (menu access). |

### 7.7 Text scaling

| NFR ID | Requirement |
|---|---|
| NFR-7-110 | UI honors OS text scaling 100%–200%; no clipping; layout reflows. |
| NFR-7-111 | User can zoom document area independently; UI remains at OS scale. |

### 7.8 Accessibility testing

Covered in NFR-9-70 .. 75.

---

## 8. Internationalization

### 8.1 Character encoding and normalization

| NFR ID | Requirement |
|---|---|
| NFR-8-1 | UTF-8 end-to-end in code, storage (via XML), IPC. |
| NFR-8-2 | Keystroke/IME input normalized to NFC at the input boundary. |
| NFR-8-3 | File paths preserved in OS-native encoding; presented UTF-8 in UI. |
| NFR-8-4 | DOCX text preserved codepoint-exact; no silent normalization of stored document content (only input). |

### 8.2 Scripts supported (basic correctness v1)

| Script / Language | Status | Notes |
|---|---|---|
| Latin (EN, DE, FR, ES, IT, PT, NL, PL, TR, VI) | Supported | Includes combining marks and Vietnamese tones. |
| Cyrillic (RU, UK, BG, SR) | Supported | |
| Greek | Supported | |
| CJK (ZH-Hans, ZH-Hant, JA, KO) | Supported | Fullwidth, kinsoku (line-break prohibitions), vertical text (v2). |
| Arabic | Supported | Shaping via HarfBuzz WASM, BiDi, cursive joining. |
| Hebrew | Supported | BiDi. |
| Devanagari (Hindi, Marathi, Sanskrit) | Supported | Complex shaping. |
| Thai | Supported | No word separators; line break via dictionary. |
| Vietnamese | Supported | Combined tone marks. |
| Ethiopic, Tibetan, Myanmar, Khmer, Lao | v2 | |

### 8.3 Bidirectional text

| NFR ID | Requirement |
|---|---|
| NFR-8-20 | Full UAX #9 BiDi via ICU4X or `unicode-bidirectional`. |
| NFR-8-21 | Mirror pairs, isolate formatting characters, paragraph direction auto-detected with override via `pPr.bidi`. |
| NFR-8-22 | Caret movement in RTL: visual Left/Right keys move visually; logical Home/End go to logical ends. User preference switches to logical-only. |
| NFR-8-23 | Cut/copy preserves logical order. |

### 8.4 Line breaking

| NFR ID | Requirement |
|---|---|
| NFR-8-30 | UAX #14 via ICU4X `LineBreakIterator` (WASM). |
| NFR-8-31 | Language-specific tailoring (Japanese, Thai, Chinese). |
| NFR-8-32 | Word-boundary aware (not just space-based). |

### 8.5 Grapheme clusters

| NFR ID | Requirement |
|---|---|
| NFR-8-40 | Caret movement and backspace operate on grapheme clusters (UAX #29) via `Intl.Segmenter`. |
| NFR-8-41 | Emoji ZWJ sequences treated as single cluster (family, flags, skin-tones). |
| NFR-8-42 | Variation selectors preserved. |

### 8.6 Hyphenation

| NFR ID | Requirement |
|---|---|
| NFR-8-50 | Language tagged per paragraph / run. |
| NFR-8-51 | v1 ships hyphenation for English (US, UK), German, French, Spanish via Hunspell / TeX patterns. |
| NFR-8-52 | Additional language packs installable; signed bundles. |
| NFR-8-53 | Non-breaking hyphens, soft hyphens honored. |

### 8.7 Locale-sensitive fields

| NFR ID | Requirement |
|---|---|
| NFR-8-70 | DATE/TIME fields formatted via `Intl.DateTimeFormat` honoring document / field locale. |
| NFR-8-71 | NUMWORDS, NUMPAGES rendered per language (e.g., German "zwölf"). v1: EN, DE, FR, ES. |
| NFR-8-72 | Sort via `Intl.Collator` with user-selectable locale and sensitivity. |

### 8.8 UI localization

| NFR ID | Requirement |
|---|---|
| NFR-8-90 | Scaffolded via `i18next` (decision ADR-i18n-001). |
| NFR-8-91 | v1 ship: English (en-US). Additional locales as add-on packs v1.1+. |
| NFR-8-92 | Pseudo-localization available via hidden flag for test (NFR-9-80). |
| NFR-8-93 | No string concatenation; ICU MessageFormat only. |
| NFR-8-94 | Plurals via ICU; gendered strings supported. |

### 8.9 RTL UI mirroring

| NFR ID | Requirement |
|---|---|
| NFR-8-110 | Document area supports RTL paragraph direction from v1. |
| NFR-8-111 | UI mirroring (toolbars, menus) scoped for v2 — Word 95 parity is LTR-first. |

---

## 9. Testing strategy

### 9.1 Coverage targets

| Scope | Statement | Branch | Mutation (Stryker) |
|---|---|---|---|
| `@word/domain` | 100% | 100% | ≥ 85% |
| `@word/docx` (persistence) | 95% | 95% | ≥ 75% |
| `@word/layout` | 90% | 85% | ≥ 70% |
| `@word/engine` | 95% | 90% | ≥ 75% |
| `@word/ui` | 75% | 70% | ≥ 60% |
| `@word/shell` | 80% | 70% | — |
| **Overall repo** | **≥ 85%** | **≥ 80%** | **≥ 70%** |

Coverage measured with `c8` (V8 native) aggregated across unit+integration+e2e. Uncovered branches inspected in PR review; exemptions require `// istanbul ignore next -- reason` with reason.

### 9.2 Unit tests

| NFR ID | Requirement |
|---|---|
| NFR-9-10 | Framework: Vitest. |
| NFR-9-11 | Every exported domain function has at least one test. |
| NFR-9-12 | Every command (user-facing operation) has positive, negative, and boundary tests. |
| NFR-9-13 | Every transform (domain → layout, layout → render) has round-trip test where applicable. |
| NFR-9-14 | Tests run in < 30 s total on baseline laptop. |

### 9.3 Property-based tests

| NFR ID | Requirement |
|---|---|
| NFR-9-20 | Framework: `fast-check`. |
| NFR-9-21 | Properties covered: DOCX round-trip (open→save→open semantically identical), undo/redo identity (any sequence of ops followed by matching undo is identity), style resolution (cascading rules associative where expected), selection normalization idempotent, clipboard round-trip. |
| NFR-9-22 | At least 10,000 generated cases per property per nightly run; 500 per PR CI. |
| NFR-9-23 | Shrunk counterexamples saved to regression corpus. |

### 9.4 Snapshot tests

| NFR ID | Requirement |
|---|---|
| NFR-9-30 | Serialized DOCX output compared against canonical bytes for a curated set of ~200 fixture documents. |
| NFR-9-31 | Snapshots stored as XML (pretty-printed) + ZIP manifest, not raw binary diff, to keep reviewable. |
| NFR-9-32 | Snapshot update requires explicit flag and reviewer sign-off in PR template. |

### 9.5 Golden corpus

| NFR ID | Requirement |
|---|---|
| NFR-9-40 | Corpus: 5,000 DOCX files drawn from public-domain books, OOXML test suite (where licensable), user-contributed samples (with consent). |
| NFR-9-41 | Metric: round-trip fidelity score (structure, text, styles) per file; aggregate mean ≥ 0.995; no regression on any file. |
| NFR-9-42 | Corpus stored in LFS; partition-sampled in PR CI (200 files), full-run nightly. |
| NFR-9-43 | Corpus diversity tracked: script, size distribution, feature coverage matrix. |

### 9.6 Integration tests

| NFR ID | Requirement |
|---|---|
| NFR-9-50 | Integration harness runs against real `@word/shell` with real worker processes; real filesystem in tmpdir. |
| NFR-9-51 | SIGKILL / TerminateProcess harness: random kill during save / autosave; assert recovery outcome meets NFR-4-64. |
| NFR-9-52 | Flaky OS timing isolated via deterministic clock where feasible. |

### 9.7 E2E tests

| NFR ID | Requirement |
|---|---|
| NFR-9-60 | Framework: Playwright with Electron. |
| NFR-9-61 | ≥ 100 end-to-end scenarios covering: open, type, save, save-as, print, print preview, mail merge, tables, styles, find/replace, headers/footers, undo/redo chains, clipboard, image insert, crash recovery. |
| NFR-9-62 | Runs on Win/macOS/Linux in matrix on release builds. |
| NFR-9-63 | Retries: at most 2; fails mark test flaky (NFR-12-40). |

### 9.8 Visual regression

| NFR ID | Requirement |
|---|---|
| NFR-9-70 | Percy (or self-hosted Playwright + pixelmatch). |
| NFR-9-71 | Per-page render diff against reference images from curated set; tolerance 1% pixel drift, 0.5% worth of strict-mode pages (text). |
| NFR-9-72 | Reference images ground-truthed against Word / LibreOffice where licensing allows; otherwise against our own blessed build. |
| NFR-9-73 | Page-rendering visual regression across 500 corpus documents × 3 page samples. |

### 9.9 Cross-renderer tests

| NFR ID | Requirement |
|---|---|
| NFR-9-80 | Render same doc headless in LibreOffice and our engine; compare line-break decisions and pagination for curated 200-document corpus. |
| NFR-9-81 | Closeness metric: page count match within 1, line-break match ≥ 95%. Regressions block release. |

### 9.10 Performance tests

| NFR ID | Requirement |
|---|---|
| NFR-9-90 | Perf harness runs every PR (smoke scenarios) and nightly (full). |
| NFR-9-91 | Tracks p50/p95/p99 for all Section 1 scenarios over time in a Grafana dashboard. |
| NFR-9-92 | PR blocks if p95 worsens > 5% on any tracked scenario vs rolling 14-day baseline. |
| NFR-9-93 | Device farm: at least one real baseline Windows laptop, one M1 Mac mini, one Ubuntu workstation. |

### 9.11 Memory tests

| NFR ID | Requirement |
|---|---|
| NFR-9-100 | Long-running soak: open 1000-page doc, edit 100 ops, save, close; repeat 100 cycles; RSS growth ≤ 5 MB. |
| NFR-9-101 | Heap snapshot diffing between cycles; new retained objects must be declared as legitimate. |

### 9.12 Fuzzing

| NFR ID | Requirement |
|---|---|
| NFR-9-120 | `jest-fuzz` / libFuzzer-style harness targeting: ZIP reader, XML parser, font sanitizer, image decoder boundaries, paste-from-HTML parser. |
| NFR-9-121 | Runs nightly for 30 min per target. |
| NFR-9-122 | Corpus-guided (save interesting inputs); triaged crashes filed as P0. |
| NFR-9-123 | OSS-Fuzz integration optional. |

### 9.13 Chaos tests

| NFR ID | Requirement |
|---|---|
| NFR-9-140 | Random SIGKILL/TerminateProcess during save, autosave, export, paste. |
| NFR-9-141 | Disk-full simulation during save; verify atomicity. |
| NFR-9-142 | Flaky-IO simulation via fault injection (EIO every N calls). |

### 9.14 Accessibility tests

| NFR ID | Requirement |
|---|---|
| NFR-9-160 | `axe-core` gate on E2E: 0 violations of WCAG 2.1 AA in CI. |
| NFR-9-161 | Manual SR matrix: NVDA, JAWS, VoiceOver, Orca smoke each minor release. |
| NFR-9-162 | Keyboard-only regression suite: 50 scenarios run per release. |

### 9.15 Localization tests

| NFR ID | Requirement |
|---|---|
| NFR-9-180 | Pseudo-localization: +40% string length, accented characters; verify no overflow, truncation, or hard-coded English text. |
| NFR-9-181 | RTL pseudo-locale (`en-XA` style mirrored) smoke run. |
| NFR-9-182 | Date/number format tests for each supported locale. |

### 9.16 Release gate

All green required:

- [ ] Lint, typecheck, unit, integration, e2e (per-OS)
- [ ] Coverage targets (9.1)
- [ ] Performance (9.10)
- [ ] Memory soak (9.11)
- [ ] Fuzzing clean for 7 days
- [ ] Visual regression review
- [ ] Accessibility gate
- [ ] Manual smoke on each platform (signoff checklist)
- [ ] SBOM generated
- [ ] Release notes drafted

---

## 10. Observability

### 10.1 Logging

| NFR ID | Requirement |
|---|---|
| NFR-10-1 | Library: `electron-log`. |
| NFR-10-2 | Structured JSON records: timestamp (ISO-8601 with TZ), level, module, message, structured fields, trace id. |
| NFR-10-3 | Log levels: `error`, `warn`, `info`, `debug`, `trace`. Default: `info`. |
| NFR-10-4 | Per-module level overrides via env var `WORD_LOG=module1=debug,module2=trace`. |
| NFR-10-5 | File rotation: 5 files × 10 MB max each; daily roll with keep-last-5 policy. |
| NFR-10-6 | Location: OS standard app log dir (`%AppData%\Word\logs` / `~/Library/Logs/Word` / `~/.local/state/word/logs`). |
| NFR-10-7 | Help menu → "Open Log Folder" reveals in OS file manager. |
| NFR-10-8 | Sensitive data scrub: file paths redacted in opt-in telemetry (but present in local logs for self-diagnosis). |
| NFR-10-9 | No document content in logs, ever, even at trace level. |

### 10.2 Tracing / profiler

| NFR ID | Requirement |
|---|---|
| NFR-10-20 | Developer mode (`--dev` flag or packaged-dev builds) exposes in-app profiler: layout time per paragraph, pagination time, parse time, save time, keystroke latency histogram. |
| NFR-10-21 | Uses `performance.mark`/`measure`; exported as JSON or Chrome-trace format. |
| NFR-10-22 | Disabled in release builds; zero overhead when off. |
| NFR-10-23 | OpenTelemetry-compatible spans where feasible. |

### 10.3 Telemetry (opt-in)

| NFR ID | Requirement |
|---|---|
| NFR-10-40 | Off by default. On first-run dialog, user chooses. |
| NFR-10-41 | Events (canonical schemas, versioned): `session.start`, `session.end`, `doc.open`, `doc.save`, `doc.close`, `print`, `export`, `crash`, `perf.outlier`. |
| NFR-10-42 | `doc.open` fields: page-count bucket (1, 10, 100, 1k, 10k), word-count bucket, feature flags present (e.g., has-tables, has-images, has-track-changes), roundtrip duration bucket. No content. |
| NFR-10-43 | Transport: first-party HTTPS endpoint; TLS 1.2+; batched. |
| NFR-10-44 | Install ID: random UUID, rotated every 90 days. |
| NFR-10-45 | User IP: not stored beyond 24h for abuse mitigation. |
| NFR-10-46 | User can view last 30 d of payloads locally (Preferences → Telemetry → View History). |
| NFR-10-47 | User can delete install ID and purge server-side (right-to-erasure). |

### 10.4 Crash reporting

| NFR ID | Requirement |
|---|---|
| NFR-10-60 | Opt-in; default off. |
| NFR-10-61 | Transport: self-hosted Sentry or Electron built-in `crashReporter` → self-hosted minidump server. |
| NFR-10-62 | Minidumps symbolicated via stored debug symbols per build. |
| NFR-10-63 | Crash context excludes document content; stack frames with suspect user-text arguments are redacted. |
| NFR-10-64 | Rate-limited: max 5 crash reports per install per day. |

### 10.5 Health dashboard (internal)

| NFR ID | Requirement |
|---|---|
| NFR-10-80 | Grafana dashboard tracking: crash-free rate, p50/p95 perf per scenario, install counts by OS/version, telemetry opt-in rate. |
| NFR-10-81 | Alert: crash-free < 99.9% triggers page to on-call. |
| NFR-10-82 | Alert: perf p95 regression > 10% week-over-week triggers investigation. |

---

## 11. Packaging and release

### 11.1 Monorepo

| NFR ID | Requirement |
|---|---|
| NFR-11-1 | Tool: `pnpm` workspaces. |
| NFR-11-2 | Packages and responsibilities (mirrors architecture): |

| Package | Responsibility |
|---|---|
| `@word/domain` | Document model (paragraphs, runs, styles, tables). Pure, no DOM. |
| `@word/engine` | Commands, selection, editing semantics. |
| `@word/layout` | Line/page layout algorithm; accessibility tree. |
| `@word/render` | Canvas / DOM painter. |
| `@word/docx` | ECMA-376 read / write. |
| `@word/shell` | Electron main, menus, OS integration. |
| `@word/ui` | React components (toolbars, dialogs, ribbons if any). |
| `@word/app` | Entry; wires everything. |
| `@word/test-fixtures` | Fixture DOCX files + helpers. |

| NFR ID | Requirement |
|---|---|
| NFR-11-3 | Dependency direction enforced by `dependency-cruiser` config: `domain ← engine ← layout ← render`, `docx ← engine`, `shell → app → ui → engine`. Violations fail CI. |
| NFR-11-4 | No circular dependencies between packages. |
| NFR-11-5 | Each package has its own `README.md` with purpose + public API. |

### 11.2 TypeScript

| NFR ID | Flag | Value |
|---|---|---|
| NFR-11-20 | `strict` | `true` |
| NFR-11-21 | `noImplicitAny` | `true` |
| NFR-11-22 | `strictNullChecks` | `true` |
| NFR-11-23 | `exactOptionalPropertyTypes` | `true` |
| NFR-11-24 | `noUncheckedIndexedAccess` | `true` |
| NFR-11-25 | `noImplicitOverride` | `true` |
| NFR-11-26 | `noFallthroughCasesInSwitch` | `true` |
| NFR-11-27 | `useUnknownInCatchVariables` | `true` |
| NFR-11-28 | `forceConsistentCasingInFileNames` | `true` |
| NFR-11-29 | `isolatedModules` | `true` |
| NFR-11-30 | `target` | `ES2022` |
| NFR-11-31 | Per-package `tsconfig.json` extends `tsconfig.base.json`; no loose settings. |
| NFR-11-32 | `any` count budget: 0 in `domain`, `engine`, `layout`, `docx`. ≤ 10 in `ui`. |

### 11.3 Lint / format

| NFR ID | Requirement |
|---|---|
| NFR-11-40 | ESLint with `typescript-eslint`, `eslint-plugin-import`, `eslint-plugin-react`, `eslint-plugin-jsx-a11y`, `eslint-plugin-unicorn`. |
| NFR-11-41 | Config treats rule violations as errors in CI; warnings allowed during authoring. |
| NFR-11-42 | Prettier with project config; 100-column print width; 2-space indent. |
| NFR-11-43 | `import/order` with groups and alphabetized. |
| NFR-11-44 | No circular imports (`import/no-cycle`). |
| NFR-11-45 | `no-floating-promises` on. |
| NFR-11-46 | `no-restricted-imports` bans `lodash` (use native or `es-toolkit`), bans `moment` (use `temporal` polyfill). |

### 11.4 Commit hooks

| NFR ID | Requirement |
|---|---|
| NFR-11-60 | `husky` + `lint-staged` run ESLint and Prettier on staged files. |
| NFR-11-61 | `commitlint` enforces Conventional Commits. |
| NFR-11-62 | Pre-push runs typecheck + unit tests for touched packages. |
| NFR-11-63 | Hooks cannot be bypassed in CI merges; local `--no-verify` allowed for explicit WIP. |

### 11.5 Build

| NFR ID | Requirement |
|---|---|
| NFR-11-80 | Renderer: Vite 5; output ES2022, chunked by package. |
| NFR-11-81 | Main / preload: `tsup` (esbuild); single ESM output; source maps on. |
| NFR-11-82 | Native modules prebuilt via `prebuild-install` / `@electron/rebuild`. |
| NFR-11-83 | Reproducible builds: pinned Node + Electron, pinned toolchains; SOURCE_DATE_EPOCH respected. |
| NFR-11-84 | ASAR integrity enabled. |

### 11.6 Installers

| Platform | Format | Size target | Signing |
|---|---|---|---|
| Windows x64 | MSI + NSIS EXE | ≤ 140 MB | Authenticode (EV) |
| Windows arm64 | MSI + NSIS EXE | ≤ 140 MB | Authenticode (EV) |
| macOS universal | DMG + PKG | ≤ 170 MB | Developer ID + notarized |
| Linux x64 | AppImage, deb, rpm, snap, flatpak | ≤ 150 MB | GPG signature; store-specific signing |
| Linux arm64 | AppImage, deb, rpm | ≤ 150 MB | GPG |

Uncompressed install footprint ≤ 450 MB.

### 11.7 Release cadence

| Channel | Cadence | Audience |
|---|---|---|
| Canary | Weekly (Wed) | Internal + opt-in testers |
| Beta | Bi-weekly | Public testers |
| Stable | Monthly (first Tuesday) | General |
| Hotfix | On-demand | All |

### 11.8 Versioning

| NFR ID | Requirement |
|---|---|
| NFR-11-120 | Packages: semver (`^1.2.3`). |
| NFR-11-121 | App: calver `YY.MM.PATCH` (e.g., `26.04.1`). |
| NFR-11-122 | DOCX schema: track support version in custom XML `<meta:writerVersion>`. |
| NFR-11-123 | Breaking changes in domain model bump major of `@word/domain`; require migration code paths. |

### 11.9 Auto-update

| NFR ID | Requirement |
|---|---|
| NFR-11-140 | `electron-updater` on all platforms. |
| NFR-11-141 | Staged rollout: 1% → 10% → 50% → 100% over 7 days on stable. |
| NFR-11-142 | Kill-switch: server-side block for a release with known critical issue. |
| NFR-11-143 | Delta updates where supported. |

### 11.10 Release notes

| NFR ID | Requirement |
|---|---|
| NFR-11-160 | Per release, generated from Conventional Commits via `semantic-release` or equivalent. |
| NFR-11-161 | Sections: New, Improved, Fixed, Security. |
| NFR-11-162 | Per major change, link to ADR or PR. |

---

## 12. CI / CD

### 12.1 Platform

| NFR ID | Requirement |
|---|---|
| NFR-12-1 | CI: GitHub Actions (swappable; equivalent allowed). |
| NFR-12-2 | Matrix: Win latest, macOS latest (Intel and ARM), Ubuntu latest × Node 20 LTS. |
| NFR-12-3 | Self-hosted macOS runners for signing. |
| NFR-12-4 | Cache: pnpm store + Electron binary + ICU data. |

### 12.2 Stages

| Stage | Budget | Blocking? |
|---|---|---|
| Lint + Prettier | 2 min | Yes |
| Typecheck | 3 min | Yes |
| Unit tests | 4 min | Yes |
| Integration tests | 6 min | Yes |
| Build artifacts | 5 min | Yes |
| E2E smoke (Win, macOS, Linux) | 8 min in parallel | Yes |
| Visual regression | 5 min | Yes (warn-only during 48h of baseline update) |
| Accessibility (axe) | 3 min | Yes |
| Perf smoke | 4 min | Warn at regress < 5%, block > 5% |
| Package installers | 6 min | Release only |
| **Total wall-clock** | **≤ 25 min per PR** | — |

### 12.3 Artifacts

| NFR ID | Requirement |
|---|---|
| NFR-12-20 | Each PR build produces ephemeral installers for all three OSes, retained 14 days. |
| NFR-12-21 | Ephemeral installers unsigned (or dev-signed); clearly marked "PR build". |
| NFR-12-22 | Release builds signed + notarized; retained indefinitely. |
| NFR-12-23 | SBOM attached to every release artifact. |

### 12.4 Flaky tests

| NFR ID | Requirement |
|---|---|
| NFR-12-40 | Track per-test flake rate over 30-day rolling window; quarantine rule ≥ 1% flake. |
| NFR-12-41 | Auto-quarantine bot moves flaky tests to quarantine tag; cannot block merges; must be fixed within 14 days or deleted. |
| NFR-12-42 | Overall suite flake rate target: < 1%. |

### 12.5 Branch protection

| NFR ID | Requirement |
|---|---|
| NFR-12-60 | `main` requires PR with: all CI green, 1 reviewer approval, no merge conflicts, signed commits. |
| NFR-12-61 | Release branches: `release/YY.MM.x`; fast-forward only. |
| NFR-12-62 | No direct pushes to `main` by humans; release bot only. |

---

## 13. Developer experience

### 13.1 Dev loop

| NFR ID | Metric | Target |
|---|---|---|
| NFR-13-1 | Renderer hot-reload after file save | ≤ 1,000 ms |
| NFR-13-2 | Main process restart after file save | ≤ 3,000 ms |
| NFR-13-3 | Full `pnpm dev` startup | ≤ 10,000 ms |
| NFR-13-4 | `pnpm test` on touched package | ≤ 15,000 ms |
| NFR-13-5 | `pnpm typecheck` full repo | ≤ 30,000 ms (baseline laptop) |
| NFR-13-6 | `pnpm lint` full repo | ≤ 20,000 ms |

### 13.2 Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Dev server (Vite) + main watch |
| `pnpm test` | Unit + integration |
| `pnpm test:watch` | Interactive |
| `pnpm test:e2e` | Playwright |
| `pnpm build` | Production build |
| `pnpm package` | Platform installer |
| `pnpm typecheck` | Project-wide TS check |
| `pnpm lint` | ESLint |
| `pnpm fmt` | Prettier write |
| `pnpm release` | Versioning + artifacts |
| `pnpm storybook` | Component sandbox |
| `pnpm perf` | Perf harness |

### 13.3 Storybook

| NFR ID | Requirement |
|---|---|
| NFR-13-20 | Storybook for every exported UI component in `@word/ui`. |
| NFR-13-21 | Stories live next to components (`.stories.tsx`). |
| NFR-13-22 | axe addon enabled; fails CI on violations. |

### 13.4 Fixtures

| NFR ID | Requirement |
|---|---|
| NFR-13-30 | Curated fixtures in `@word/test-fixtures/docs` for manual use: `empty.docx`, `simple.docx`, `100p.docx`, `1000p.docx`, `tables.docx`, `mail-merge.docx`, `rtl.docx`, `cjk.docx`, `macro.docm` (read-only), `broken-*.docx`. |
| NFR-13-31 | License and provenance of each fixture documented in `FIXTURES.md`. |

### 13.5 Onboarding

| NFR ID | Requirement |
|---|---|
| NFR-13-50 | New engineer productive in ≤ 1 day. Metric: complete the "hello-change" task by end of day 1. |
| NFR-13-51 | `CLAUDE.md` + `README.md` cover: prerequisites, clone, install, run, test, first PR. |
| NFR-13-52 | `docs/architecture/` contains diagrams + ADRs. |
| NFR-13-53 | Dev container (`.devcontainer/`) available for Linux/macOS/Windows WSL. |

---

## 14. Documentation

### 14.1 Decision records

| NFR ID | Requirement |
|---|---|
| NFR-14-1 | ADRs in `docs/adr/NNNN-title.md`; numbered sequentially. |
| NFR-14-2 | Template: Context, Decision, Consequences, Alternatives, Status. |
| NFR-14-3 | Required for any change touching: architecture boundaries, dependencies (adds/removes major), security posture, performance budgets, cross-process boundaries. |

### 14.2 API reference

| NFR ID | Requirement |
|---|---|
| NFR-14-20 | `typedoc` generates internal API reference per package. |
| NFR-14-21 | Built on release; hosted internally. |
| NFR-14-22 | All public exports have JSDoc with `@example` for non-trivial APIs. |

### 14.3 User guide

| NFR ID | Requirement |
|---|---|
| NFR-14-40 | User guide in separate project (companion), mimicking Word 95 help structure (Categories + tasks + glossary). |
| NFR-14-41 | Shipped as in-app help via `F1` context and a "Help" menu. |
| NFR-14-42 | Searchable; offline-first (packaged with app). |

### 14.4 Engineering docs

| NFR ID | Requirement |
|---|---|
| NFR-14-60 | `docs/architecture/overview.md` — system diagram. |
| NFR-14-61 | `docs/requirements/` — functional, non-functional (this file), domain. |
| NFR-14-62 | `docs/runbooks/` — operational responses (crash spikes, signing cert expiry, notarization failures). |

---

## 15. Compliance and licensing

### 15.1 Application license

| NFR ID | Requirement |
|---|---|
| NFR-15-1 | Default: MIT (or as owner chooses); single license file at repo root. |
| NFR-15-2 | `LICENSE` and `NOTICE` mandatory. |

### 15.2 Third-party licenses

| NFR ID | Requirement |
|---|---|
| NFR-15-20 | Full SBOM (CycloneDX) + license list generated at build time. |
| NFR-15-21 | License allowlist (MIT, BSD-2/3, Apache-2.0, ISC, CC0, MPL-2.0 with copyleft-weak acceptance) enforced by `license-checker-rseidelsohn` in CI. |
| NFR-15-22 | **No GPL / AGPL dependencies** in distributed artifact. LGPL allowed only if dynamically linked and replaceable. |
| NFR-15-23 | "Credits" menu shows full NOTICE text. |

### 15.3 Export controls

| NFR ID | Requirement |
|---|---|
| NFR-15-40 | App uses only standard web TLS crypto; no custom cryptography. |
| NFR-15-41 | Classification: EAR 5D002 mass-market; documented in `EXPORT.md`. |

### 15.4 Privacy regulation

| NFR ID | Requirement |
|---|---|
| NFR-15-60 | GDPR / CCPA: app is offline-first; no personal data processed unless telemetry opted in. |
| NFR-15-61 | Telemetry privacy policy linked in preferences. |
| NFR-15-62 | Right-to-erasure honored via install ID purge (NFR-10-47). |
| NFR-15-63 | Data retention (telemetry): 13 months max; crash minidumps 90 days. |

### 15.5 Accessibility compliance

Covered in Section 7 and testing Sections 9.14.

---

## 16. Support matrix and deprecation

### 16.1 OS support

| OS | Supported | EoL rule |
|---|---|---|
| Windows 10 22H2 | Yes | Drop 12 months after MS EoL |
| Windows 11 | Yes (all current) | Rolling |
| macOS | 11, 12, 13, 14, 15 | Latest 4 majors rolling |
| Ubuntu | 22.04, 24.04 LTS | LTS + N-1 |
| Fedora | Latest 2 | Rolling |
| Debian | Stable current | 1 major back |
| RHEL / Rocky / Alma | 9, 10 (when GA) | Rolling |

### 16.2 Electron

| NFR ID | Requirement |
|---|---|
| NFR-16-20 | Track latest two Electron majors; roll forward within 30 days of new major GA (unless blocker). |
| NFR-16-21 | Security patches applied within 7 days. |
| NFR-16-22 | Runtime flag recording Electron version in logs and telemetry. |

### 16.3 Node

| NFR ID | Requirement |
|---|---|
| NFR-16-40 | Node 20 LTS baseline; move to next LTS within 90 days of release. |
| NFR-16-41 | Renderer's runtime is Electron's bundled Node; dev toolchain targets same major. |

### 16.4 Deprecation policy

| NFR ID | Requirement |
|---|---|
| NFR-16-60 | Public behaviour removals announced in release notes with 2-release runway. |
| NFR-16-61 | Deprecation warnings surfaced in logs during runway. |
| NFR-16-62 | Legacy file format (.doc) via converter kept indefinitely but may lag features. |

### 16.5 Plugin / extension API stability

| NFR ID | Requirement |
|---|---|
| NFR-16-80 | No public plugin API in v1. When introduced, versioned and semver-stable. |

---

## 17. Non-scope (normative clarifications)

These are excluded from v1; requirements apply only to ensure we leave room for them:

| Area | v1 stance |
|---|---|
| Real-time collaboration | Not implemented. Domain model designed to support CRDT-style ops later: every mutation is an immutable command with a unique ID and monotonic Lamport clock. |
| Cloud sync / server-side | Not implemented. Persistence abstracted behind `IFileProvider` interface so a future cloud backend can be added without changing domain or engine layers. |
| Mobile / iPad | Not targeted. |
| Web version | Not targeted v1. `@word/domain`, `@word/engine`, `@word/layout`, `@word/render`, `@word/docx` must compile to browser targets (no Node APIs). |

---

## 18. Requirements traceability

### 18.1 Gating matrix

| Category | Automated gate | Manual gate |
|---|---|---|
| Performance (1) | Perf harness (9.10) | Release smoke |
| Size limits (3) | Boundary tests (9.2) | Manual large-doc testing |
| Reliability (4) | Chaos tests (9.13) + SIGKILL harness (9.6) | DR runbook exercise |
| Security (5) | Fuzz (9.12) + `pnpm audit` + CSP scan | Annual third-party pen test |
| Cross-platform (6) | E2E matrix (9.7) | Manual smoke per OS |
| Accessibility (7) | axe-core (9.14) | Screen-reader matrix |
| I18n (8) | Pseudo-loc (9.15) | Native-speaker review |
| Testing (9) | Coverage (9.1) | PR review |
| Observability (10) | Telemetry schema snapshot | Dashboard review |
| Packaging (11) | Installer CI (11.6) | Release sign-off |
| CI (12) | Meta-CI | — |
| DX (13) | `pnpm dev` timing test | Onboarding survey |
| Docs (14) | Broken-link CI | ADR review |
| Compliance (15) | License-checker | Legal review annual |
| Support matrix (16) | OS matrix CI | — |

### 18.2 Review cadence

| Document | Review every |
|---|---|
| This file | Quarterly + on any NFR-affecting ADR |
| ADRs | On creation |
| Threat model (5.15) | Twice-yearly |
| Support matrix (16) | Quarterly |

### 18.3 Ownership

| Section | Primary owner |
|---|---|
| 1, 2 | Performance WG |
| 3 | Domain model lead |
| 4 | Persistence lead |
| 5 | Security WG |
| 6 | Platform integration lead |
| 7 | Accessibility lead |
| 8 | I18n lead |
| 9 | QA lead |
| 10 | Observability lead |
| 11, 12, 13 | Build / DX lead |
| 14 | Tech writer + tech lead |
| 15 | Legal + security |
| 16 | Tech lead |

---

## 19. Glossary

| Term | Definition |
|---|---|
| ANR | Application Not Responding — main thread blocked ≥ 5 s. |
| ADR | Architecture Decision Record. |
| ASAR | Electron archive format. |
| BiDi | Bidirectional (text). |
| CRDT | Conflict-free Replicated Data Type. |
| CSP | Content Security Policy. |
| DOCX | ECMA-376 Transitional format. |
| ECMA-376 | OOXML standard. |
| Fsync | File-system synchronization (`fsync(2)` / `FlushFileBuffers`). |
| IME | Input Method Editor. |
| NFR | Non-Functional Requirement. |
| p50/p95/p99 | Percentile latencies. |
| RSS | Resident Set Size (memory). |
| SBOM | Software Bill of Materials. |
| SIGKILL | Forced process termination. |
| SR | Screen reader. |
| UAX | Unicode Annex. |
| VPAT | Voluntary Product Accessibility Template. |
| WASM | WebAssembly. |
| WCAG | Web Content Accessibility Guidelines. |
| XXE | XML External Entity (attack). |
| Zip slip | Path-traversal via ZIP entries. |

---

## 20. Change log

| Date | Version | Change |
|---|---|---|
| 2026-04-17 | 1.0 | Initial specification. |
