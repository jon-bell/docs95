# Architecture Overview

This document is the canonical synthesis of the system's architecture. It names the layers, their boundaries, the runtime topology, and the dependency rules. Every other architecture document refines one region of this overview. When the rules here conflict with a subordinate document, this document wins until amended by an ADR.

## 1. Mission

Build a desktop word processor with true feature parity to Microsoft Word 95 (Word for Windows 95, version 7.0). Persistence uses DOCX (ECMA-376 Transitional), not the legacy binary `.doc`. Stack: TypeScript, React 18, Electron. Target OSes: Windows 10+, macOS 11+, Linux (Ubuntu 22.04+).

The goal is not only a working product but a reference implementation of clean software architecture. Every file should belong to a named layer with an explicit dependency direction; every capability should be swappable at its seam.

## 2. Guiding principles

1. **Pure domain.** The document model has zero I/O, zero UI dependencies, and zero framework lock-in. It runs in Node, the browser, and a Web Worker unchanged.
2. **Hexagonal layering.** The domain is at the center. Ports define what it needs from the world. Adapters live at the edge. No inward dependencies from edges except through ports.
3. **Command → Patch → Render.** All document mutation flows through named, invertible `Command`s that produce `Patch`es. Rendering observes patches; UI never mutates state.
4. **Feature-as-plugin.** Tables, lists, styles, footnotes, endnotes, comments, revisions, fields, bookmarks, hyperlinks, drawings, images, frames, mail-merge, spellcheck, autocorrect, autoformat, macro-preserve — each is a plugin over a minimal editor core.
5. **Round-trip fidelity.** Unknown DOCX elements are preserved verbatim. The serializer is two-stage (AST ↔ Domain) so the wire format can evolve independent of the domain.
6. **Deterministic output.** Saved DOCX is byte-stable modulo user edits. Two saves of the same document produce the same bytes.
7. **Typed boundaries.** Every IPC channel, every plugin contract, every adapter port carries a Zod schema. Validation at the edge; implementations assume well-typed input.
8. **Test the invariant, not the implementation.** Property tests over the domain; golden-corpus tests for DOCX; visual-regression tests for pagination; Playwright for the shell. Implementation details are free to change.
9. **Plan for scale.** Layout and parsing are parallelized from day one. The app must remain responsive on 1000-page documents.
10. **Fail closed on security.** Sandboxed renderer. No `nodeIntegration`. Strict CSP. Zip-bomb and XXE defenses. Macros are preserved but never executed.

## 3. Layered architecture

```
                        ┌──────────────────────────────────────────────┐
                        │  Presentation (React UI, Electron shell)     │
                        │  packages/ui, packages/shell                 │
                        └──────────────┬─────────────────┬─────────────┘
                                       │                 │
                                       │ commands        │ OS / IPC
                                       ▼                 │
                        ┌──────────────────────────────┐ │
                        │  Application (engine)        │ │
                        │  • CommandBus, Transactions  │ │
                        │  • Selection, History, IME   │ │
                        │  • PluginHost                │ │
                        │  packages/engine             │ │
                        └──────────────┬───────────────┘ │
                                       │                 │
                                       │ operations      │
                                       ▼                 │
                        ┌──────────────────────────────┐ │
                        │  Domain (pure)               │ │
                        │  Document • Section          │ │
                        │  Paragraph • Run • Table     │ │
                        │  Styles • Numbering • Fields │ │
                        │  packages/domain             │ │
                        └──────────────▲───────────────┘ │
                                       │                 │
                           ports       │                 │
               ┌───────────────────────┼─────────────────┼─────────────┐
               │                       │                 │             │
     ┌─────────┴─────────┐   ┌─────────┴────────┐ ┌─────┴──────┐  ┌───┴───┐
     │ Persistence       │   │ Layout / Render  │ │ Platform   │  │ Infra │
     │ @word/docx, rtf,  │   │ @word/layout,    │ │ @word/shell│  │ fonts │
     │ html, txt, conv   │   │ @word/render     │ │ (Electron) │  │ clock │
     └───────────────────┘   └──────────────────┘ └────────────┘  └───────┘
                              (DOM output, SVG/img, print, AX tree)
```

### Layer rules

- **Domain** (`packages/domain`): pure TypeScript. Depends only on standard library and tiny utilities (nanoid, Immer). No React, no Electron, no DOM, no file system, no fetch.
- **Engine** (`packages/engine`): depends on Domain. Hosts the Command/Transaction machinery, Selection state, History (undo/redo), IME handling, PluginHost. Exposes `EditorInstance`. No UI, no I/O.
- **Persistence** (`packages/docx`, `packages/rtf`, `packages/html-io`, `packages/txt-io`, `packages/converters`): adapters that implement `DocumentSerializer<Format>`. Depend on Domain types only. No engine, no UI.
- **Layout** (`packages/layout`): consumes Domain snapshots + engine events; produces `PageLayout` trees. Pure of UI framework. Runs in Web Workers.
- **Render** (`packages/render`): React wrapper around Layout (`<PageHost>`, selection overlays, caret). Depends on Layout + Engine's Selection state.
- **UI** (`packages/ui`): React components for menus, toolbars, rulers, status bar, MDI workspace, dialogs, themes. Depends on Engine commands and Render. Uses Zustand stores.
- **Shell** (`packages/shell`): Electron main + preload. Depends on nothing above except IPC schemas. Provides ports for file I/O, printing, clipboard, OS integration.
- **App** (`packages/app`): the composition root. Imports everything, wires it up, exports the bundle consumed by Electron.

### Dependency rule

```
domain ← engine ← ui    ← app
  ↑       ↑       ↑
  └ persistence    shell
  └ layout ← render
```

Arrows point from dependents to dependencies. Edges never cross; adapters hide external libraries from the domain. A new layer is allowed only with an ADR.

## 4. Package map

```
packages/
  domain/             # Pure document model, value objects, styles, numbering
  engine/             # CommandBus, Transactions, Selection, History, IME, Plugins
  docx/               # ECMA-376 reader/writer (two-stage AST ↔ Domain)
  rtf/                # RTF reader/writer
  html-io/            # HTML import/export (sanitized)
  txt-io/             # Plain text read/write
  converters/         # External converter adapters (.doc via LibreOffice)
  layout/             # Measure, shape, break, paginate, position
  render/             # React bindings for layout + selection overlay
  ui/                 # Menus, toolbars, dialogs, MDI, rulers, status bar
  shell/              # Electron main + preload + utility processes
  ipc-schema/         # Shared Zod schemas for main↔renderer IPC
  i18n/               # Locale bundles, date/number formatting, BIDI tables
  icons/              # 16×16 SVG icon set
  fonts/              # Bundled fonts (MS-Sans equivalent, fallbacks)
  test-fixtures/      # DOCX corpus, golden files
  dev-harness/        # Storybook, perf harness, fuzz runner
  app/                # Composition root (Electron app entry)
tooling/
  eslint-config/
  tsconfig/
  build-scripts/
docs/
  requirements/
  architecture/
  adr/                # Architecture Decision Records, numbered
```

Every package has its own `package.json`, `tsconfig.json`, and `CHANGELOG.md`. Public API of each is declared via `exports` field — nothing deep-imports across packages.

## 5. Runtime topology

```
                  ┌──────────────────────────────────────────────┐
                  │  Electron main (Node)                        │
                  │  • window mgmt  • file I/O  • print  • menu  │
                  │  • auto-update  • IPC router                 │
                  └────────┬─────────────────────────────────┬───┘
                           │ IPC                             │ spawn
                           │                                 │
               ┌───────────▼────────────┐     ┌──────────────▼─────────────┐
               │ Renderer (sandboxed)   │     │ utilityProcess (Node)      │
               │ • React UI             │     │ • docx-parser              │
               │ • Engine + Domain      │     │ • spell-check (Hunspell)   │
               │ • Render + Selection   │     │ • indexer (find-all)       │
               │ • Layout (hot path)    │     │ • macro-sanitizer          │
               └──┬─────┬─────┬─────────┘     └────────────────────────────┘
                  │     │     │
          ┌───────▼─┐ ┌─▼───┐ ┌─▼──────────┐
          │ Layout  │ │Find │ │Hyphenation │
          │ Workers │ │     │ │            │
          │ (×N)    │ │     │ │            │
          └─────────┘ └─────┘ └────────────┘
```

- **Main**: privileged, minimal. Holds no document state. Routes IPC, manages windows, performs atomic writes, drives auto-update.
- **Renderer**: sandboxed (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`). One per window. Owns the `EditorInstance` and React tree. MDI children live inside this renderer.
- **utilityProcess**: heavy, isolated CPU work. Crashes do not take down the app.
- **Renderer-side workers**: layout parallelism, background find, hyphenation.

Only the main process touches the filesystem or native dialogs. Only the renderer mutates the document model. Only utility processes run untrusted-ish parse code.

## 6. Core data model (summary)

See `editor-core.md` for the authoritative definitions. In brief:

- `Document` → `Section[]` → `Block[]` (Paragraph | Table) → inline children (Run | FieldRun | HyperlinkRun | DrawingRun | Break | CommentMarker | BookmarkMarker | FootnoteMarker).
- Each node has a stable `NodeId` (nanoid, 21 chars).
- Text inside paragraphs is stored in a piece table; structure is an immutable tree with structural sharing.
- `StyleRegistry`, `NumberingRegistry`, `FontRegistry`, `FieldRegistry`, `CommentSet`, `FootnoteSet` are attached to `Document`.
- Positions are `{leafId, offset}`. Ranges are `{anchor, focus}`.
- `Patch` is a sequence of invertible `Op`s. `Transaction` groups patches for atomic undo.

## 7. Plugin model (summary)

The engine core only understands `Paragraph` and `Run`. Everything else is a plugin:

- `plugin-sections`, `plugin-tables`, `plugin-lists`, `plugin-styles`
- `plugin-footnotes`, `plugin-endnotes`, `plugin-comments`
- `plugin-track-changes` (Word 95 "Revisions")
- `plugin-fields`, `plugin-bookmarks`, `plugin-hyperlinks`
- `plugin-drawings`, `plugin-images`, `plugin-frames`
- `plugin-mail-merge`, `plugin-spellcheck`, `plugin-autocorrect`, `plugin-autoformat`
- `plugin-macros-preserve` (round-trips WordBasic/vbaProject.bin; does not execute)

A plugin declares:

```ts
interface Plugin {
  id: string;
  schema?: SchemaExtension; // new node types / marks
  commands?: CommandDef[]; // registered with CommandBus
  keymap?: KeyBinding[]; // default accelerators
  inputHandlers?: InputHandler[]; // beforeInput, paste, drop
  decorations?: DecorationSource[]; // UI-only overlays
  serializers?: {
    // ast↔domain mappers per format
    docx?: DocxMapper;
    rtf?: RtfMapper;
    html?: HtmlMapper;
  };
  state?: { slice: string; reducer: (s, action) => s };
  accessibility?: AccessibilityContributor;
}
```

The `PluginHost` assembles contributions, validates schema, and boots them in topological order.

## 8. Data flows

### 8.1 Keystroke → rendered glyph

```
DOM keydown
   │
   ▼
KeyboardDispatcher (ui)
   │ resolve chord → command id
   ▼
CommandBus (engine)
   │ command(doc, params) → Patch
   ▼
Transaction committed
   │ emit "stateChanged" (one notification per txn)
   ▼
Layout (incremental)
   │ dirty paragraph(s) re-laid
   │ pagination touched only if height changed
   ▼
Render (React)
   │ <PageHost> updates affected page
   ▼
Selection overlay + caret repositioned
   │
   ▼
Status bar (page, line, col) updated via deferred value
```

Typing hot path avoids pagination work when line heights don't change. Typical p95 keystroke → glyph ≤ 16 ms.

### 8.2 Open document

```
User invokes File → Open
   │
   ▼
Renderer → IPC "file.openDialog"
   │
   ▼
Main shows native dialog, returns path
   │
   ▼
Main reads bytes, spawns docx-parser utility process
   │
   ▼
Utility streams AST → Domain via MessagePort
   │ first paragraphs arrive progressively
   ▼
Renderer constructs Document, engine emits "documentLoaded"
   │
   ▼
Layout workers begin paginating in parallel from page 0
   │
   ▼
<PageHost> renders first page within target budget
   │
   ▼
Background: remaining pages laid out on idle
```

First paint is unblocked by full-document parse. Worst-case 1000-page DOCX: first page ≤ 2 s, navigable within ≤ 8 s.

### 8.3 Save document

```
User invokes File → Save (Ctrl+S)
   │
   ▼
Engine emits save intent; UI blocks new commands briefly
   │
   ▼
Renderer builds Document snapshot (structural share — O(1))
   │
   ▼
Sent to docx-writer utility process
   │
   ▼
Mapper emits AST → XML → ZIP (stream deflate)
   │
   ▼
Main process receives bytes, writes .~tmp, fsyncs, renames
   │ (atomic MoveFileEx with WRITE_THROUGH on Windows)
   ▼
Lock file updated; autosave sidecar cleared; checksum verified
   │
   ▼
Toast "Saved" + status bar update
```

If autosave fires concurrently, it writes a sidecar not the original. On crash, next launch offers recovery from sidecar.

### 8.4 Print

```
File → Print → PrintDialog (UI, modal)
   │
   ▼
Print-friendly DOM built: pages only, no selection, no chrome
   │
   ▼
webContents.print (Route 1, MVP) or printToPDF (Export)
   │
   ▼
Chromium renders using our page layout (already computed)
```

Exact pagination guaranteed because print DOM reuses the same `PageLayout` objects as the screen viewport.

## 9. Cross-cutting concerns

### Testing

- **Unit**: Vitest. Domain 100%, persistence ≥ 95%, others by discipline.
- **Property**: fast-check over domain invariants (round-trip, undo-redo identity, style resolution, patch invertibility).
- **Snapshot**: canonical DOCX output per scenario.
- **Golden corpus**: 5000 real DOCX files, open → save → open, zero diff for owned elements, byte-preservation for opaque ones.
- **Visual regression**: Percy or self-hosted; per-page screenshots against reference.
- **E2E**: Playwright against packaged Electron; ≥ 100 scenarios.
- **Cross-renderer**: our pagination vs LibreOffice headless on curated corpus; track similarity metric.
- **Perf**: budget harness in CI; fail on > 5% regression of p50 or p95.
- **Fuzz**: libFuzzer-style nightly for XML parser and ZIP reader.
- **Chaos**: SIGKILL during save/autosave; recovery verified.
- **Accessibility**: axe-core in Storybook + E2E; manual NVDA/JAWS/VoiceOver matrix.

### Observability

- Structured JSON logs (electron-log), rotating, accessible via Help → Open Log Folder.
- Opt-in telemetry: session/perf/crash only, no content, no PII.
- Opt-in crash reports (minidumps, symbolicated).
- Dev mode: in-app profiler with per-paragraph layout time, parse time, save time.

### Security

- Sandboxed renderer, contextIsolation, no node integration.
- Strict CSP, no remote content, no eval.
- Typed IPC with Zod at both ends, allowlist only.
- ZIP: bomb guards (ratio cap 200×, 2 GB uncompressed, 10 000 part cap, zip-slip check).
- XML: no DOCTYPE, no external entities, bounded entity expansion.
- Macros: `.docm` opens read-only with warning; `vbaProject.bin` preserved as opaque; never executed.
- Hyperlinks: user confirmation by default; no `javascript:` schemes writable.
- Signed/notarized builds; TLS-verified auto-update.
- Dependency audit gates release.

### Accessibility

- Keyboard-only operation of every feature.
- Accessible tree exported by engine (role-based), independent of visual layout.
- ARIA on all UI chrome; live regions for status updates.
- High-contrast OS theme honored; reduced motion honored.
- 4.5:1 color contrast minimum; 3:1 on UI borders.
- Published VPAT target with v1.

### Internationalization

- UTF-8 end-to-end, NFC normalized at input.
- UAX #9 BIDI, UAX #14 line break (ICU4X WASM), UAX #29 grapheme clusters.
- Per-language hyphenation (Hunspell / TeX patterns).
- Locale-aware fields (DATE, TIME, NUMWORDS).
- UI localized (i18next). English v1; RTL UI in v2.

## 10. Delivery phases

The scope is large. We ship in vertical slices, not big-bang.

- **M0 — Foundation (4 weeks).** Monorepo scaffolded. Domain types. Empty editor loads a DOCX with text only. No styles. Print-to-PDF via Chromium. Tests, CI, packaging for Windows/macOS/Linux. Goal: the scaffolding is real and delivered.
- **M1 — Authoring (8 weeks).** Character + paragraph formatting. Styles with resolution. Lists (numbering). Find & Replace. Undo/redo. Save. Print. Templates (Normal.dot). 90% of typing sessions usable.
- **M2 — Structure (6 weeks).** Tables. Sections. Headers/footers. Page numbers. Footnotes. Columns. Page Layout view pagination. Frames. Word 95 parity for layout.
- **M3 — Production (6 weeks).** Track changes. Comments. Bookmarks. Hyperlinks. Fields (DATE, PAGE, TOC, HYPERLINK, IF, SEQ). Mail Merge Helper. Forms.
- **M4 — Objects (6 weeks).** Images. Drawing layer. WordArt (SVG). Equation Editor round-trip (opaque). OLE previews.
- **M5 — Polish (4 weeks).** All menus and toolbars customizable. Macros round-trip. AutoCorrect/AutoText/AutoFormat. Grammar, Thesaurus, Hyphenation. Accessibility audit. Perf audit.
- **M6 — Release candidate (2 weeks).** Corpus testing, visual regressions, security review, packaging, release.

Each milestone ends with a green CI, a demo, and an updated ADR log.

## 11. Risks

| Risk                                                  | Likelihood | Impact | Mitigation                                                                                         |
| ----------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------- |
| Custom editor (no contenteditable) breaks IME / AT    | High       | High   | IME test matrix, accessibility tree first-class, reference against VS Code and CodeMirror patterns |
| Pagination divergence from Word on complex tables     | Medium     | High   | Golden corpus + cross-renderer tests against LibreOffice; incremental hardening                    |
| Performance regresses on 1000-page docs               | Medium     | High   | Parallel layout workers from M0; perf harness in CI; Canvas fallback mode if DOM thrashes          |
| DOCX round-trip loses exotic features                 | Medium     | Medium | Opaque preservation of unknown XML; corpus tests; explicit fidelity ledger                         |
| Font-metrics mismatch across OSes                     | High       | Medium | Bundle a core font set; warn on substitution; metric compatibility shim                            |
| WordBasic macros confuse users who expect them to run | Low        | Medium | Clear UI messaging; preserve verbatim; never execute                                               |
| Electron security regression                          | Low        | High   | Baseline config frozen; per-release checklist; pinned Electron majors                              |
| Scope creep beyond Word 95                            | High       | Medium | NON-SCOPE lists in every doc; ADR required to add anything post-95                                 |

## 12. Architecture Decision Records

Significant choices are recorded as ADRs under `docs/adr/`. An ADR has a stable number, a date, a status (proposed / accepted / superseded), a context, a decision, and consequences. The foundational ADRs to author first:

1. ADR-001: DOCX as the only wire format (over `.doc`, `.odt`, custom).
2. ADR-002: Custom layout engine (over contenteditable).
3. ADR-003: Piece-table for paragraph text.
4. ADR-004: In-renderer MDI (over native multi-window) for Word 95 parity.
5. ADR-005: Two-stage AST for DOCX round-trip fidelity.
6. ADR-006: Plugin-based feature composition over a minimal core.
7. ADR-007: No WordBasic execution; preservation only.
8. ADR-008: Zustand + engine event bridge over monolithic Redux.
9. ADR-009: HarfBuzz WASM for complex-script shaping (staged).
10. ADR-010: Utility processes for parse, spell-check, indexing.

## 13. Document map

### Requirements

| Document                                                              | Purpose                                                           | Owner            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------- |
| [`requirements/features.md`](../requirements/features.md)             | Definitive Word 95 feature inventory (5 300 lines)                | PM / Research    |
| [`requirements/docx-format.md`](../requirements/docx-format.md)       | ECMA-376 Transitional subset we implement (3 400 lines)           | Persistence lead |
| [`requirements/ux.md`](../requirements/ux.md)                         | UX and interaction spec (2 800 lines)                             | UX / UI lead     |
| [`requirements/non-functional.md`](../requirements/non-functional.md) | Performance, reliability, security, testing budgets (1 500 lines) | Tech lead        |

### Architecture

| Document                                            | Purpose                                                 | Owner            |
| --------------------------------------------------- | ------------------------------------------------------- | ---------------- |
| [`architecture/overview.md`](overview.md)           | This document — layers, topology, flows                 | Tech lead        |
| [`architecture/editor-core.md`](editor-core.md)     | Domain + engine + plugins + IME (3 600 lines)           | Core lead        |
| [`architecture/rendering.md`](rendering.md)         | Measure/shape/break/paginate/render (3 200 lines)       | Layout lead      |
| [`architecture/persistence.md`](persistence.md)     | DOCX read/write, alt formats (3 700 lines)              | Persistence lead |
| [`architecture/electron.md`](electron.md)           | Main/preload/utility, IPC, OS integration (2 800 lines) | Platform lead    |
| [`architecture/ui-components.md`](ui-components.md) | React component system, theming, dialogs (3 900 lines)  | UI lead          |

## 14. Reading order for new engineers

1. This overview (you are here).
2. `requirements/features.md` — skim menus and dialogs; come back when implementing.
3. `requirements/non-functional.md` — absorb performance budgets and test targets.
4. `architecture/editor-core.md` — the heart.
5. The architecture doc for your team's area.
6. `requirements/docx-format.md` when you touch persistence.
7. ADR index.

Ask: if you cannot locate a decision in one of these documents, it needs an ADR.

## 15. Glossary

- **AST**: Abstract Syntax Tree — our intermediate representation of DOCX XML, faithful to ECMA-376.
- **Command**: A named, pure function `(Document, params) → Patch`. Registered in the `CommandBus`.
- **Domain**: The pure, I/O-free package defining the document model.
- **EMU**: English Metric Unit — 914 400 per inch — DrawingML coordinate unit.
- **Engine**: The application-layer package hosting `CommandBus`, `Selection`, `History`, `PluginHost`.
- **MDI**: Multiple Document Interface — Word 95's in-window child-document pattern.
- **OPC**: Open Packaging Conventions — the ZIP + `[Content_Types].xml` + relationship files that make a DOCX.
- **OOXML**: Office Open XML — the ECMA-376 family of formats.
- **Patch**: Sequence of invertible `Op`s produced by a command.
- **Piece Table**: Text storage with readonly original buffer + append-only add buffer + balanced tree of `Piece`s.
- **Plugin**: A feature module contributing schema, commands, keymap, serializers, and decorations.
- **Port / Adapter**: Port is an interface declared by the domain/engine. Adapter is the concrete implementation in an outer layer.
- **Run**: A contiguous span of text with a single property bag (`rPr`).
- **Section**: A document subdivision with its own page setup, headers, footers, and column configuration.
- **Transaction**: A group of commands committed atomically; the unit of undo/redo.
- **Twip**: 1/1440 inch — Word's internal length unit.
- **UAX**: Unicode Annex — specifications for BIDI (#9), line break (#14), script (#24), segmentation (#29).
- **Utility Process**: An Electron-managed Node subprocess outside the renderer used for CPU-heavy work.

## 16. Amendment procedure

Any change to this overview requires a PR labeled `architecture` with an accompanying ADR. Subordinate architecture documents may refine details but may not contradict Section 3 (layered architecture) or Section 5 (runtime topology) without an ADR and a corresponding update here.
