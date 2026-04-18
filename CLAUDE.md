# CLAUDE.md

Orientation for AI and human engineers working in this repo. Read this first. It is loaded into every Claude session, so keep it tight.

## What this is

A desktop word processor with **true feature parity to Microsoft Word 95 (Word for Windows 95, v7.0)**. Persistence: **DOCX** (ECMA-376 Transitional) only — not binary `.doc`. Stack: **TypeScript** + **React 18** + **Electron**. Targets: Windows 10+, macOS 11+, Linux (Ubuntu 22.04+).

The project is a **reference implementation of clean software architecture**. Treat every decision as something the next engineer will study, not just run.

## Start here

If you are about to do work, open these in order:

1. [`docs/architecture/overview.md`](docs/architecture/overview.md) — the canonical architecture, layers, runtime topology, dependency rule, data flows, roadmap.
2. The architecture doc for your area (`editor-core`, `rendering`, `persistence`, `electron`, `ui-components`).
3. [`docs/requirements/features.md`](docs/requirements/features.md) when implementing a user-visible feature — the definitive Word 95 behavior inventory.
4. [`docs/requirements/non-functional.md`](docs/requirements/non-functional.md) for performance, testing, and security budgets.

If you cannot find a decision in those docs, an ADR under `docs/adr/` is required before new architectural choices land.

## Repo layout

```
packages/
  domain/           pure document model (no I/O, no UI, no framework)
  engine/           commands, transactions, selection, history, IME, plugins
  docx/             DOCX reader/writer (two-stage AST ↔ domain)
  rtf/ html-io/ txt-io/ converters/
  layout/           measure/shape/break/paginate/position
  render/           React bindings for layout + selection overlay
  ui/               menus, toolbars, rulers, status bar, MDI, dialogs, theme
  shell/            Electron main + preload + utility processes
  ipc-schema/       shared Zod IPC schemas
  i18n/ icons/ fonts/ test-fixtures/ dev-harness/
  app/              composition root (Electron entry)
tooling/            shared eslint/tsconfig/build scripts
docs/
  requirements/     (features, docx-format, ux, non-functional)
  architecture/     (overview, editor-core, rendering, persistence, electron, ui-components)
  adr/              Architecture Decision Records (numbered, dated)
```

## Non-negotiable architectural rules

These come from `overview.md § 3`. Violations fail review.

1. **Domain is pure.** `packages/domain` imports nothing from React, Electron, DOM, or the file system. If you need time or randomness, inject a port.
2. **Dependencies point inward.** `domain ← engine ← ui ← app`. `persistence`, `layout`, `shell` sit at the edge; they depend on `domain` (and sometimes `engine`) but never the other way. No layer crosses another.
3. **All mutation is a Command.** UI never edits the document directly. It dispatches named commands through the `CommandBus`. Commands are pure, produce invertible `Patch`es, and are grouped in `Transaction`s.
4. **Features are plugins.** Tables, lists, footnotes, comments, revisions, fields, hyperlinks, drawings, images, frames, mail-merge, spellcheck, autocorrect, macro-preserve — each is a `Plugin` over a minimal core. A new feature that belongs in the core needs an ADR.
5. **DOCX round-trip preserves the unknown.** The two-stage `AST ↔ Domain` mapper attaches unrecognised XML as opaque passthrough. Never drop what you don't understand.
6. **Deterministic output.** Save the same document twice → identical bytes.
7. **IPC is typed.** Every main↔renderer channel has a Zod schema in `@word/ipc-schema`, validated at both ends. No ad-hoc channels.
8. **Security baseline is frozen.** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP, no remote content. Changing any of these requires an ADR and a security review.
9. **Macros are never executed.** `vbaProject.bin` is preserved as opaque bytes. `.docm` opens read-only with a warning.
10. **Word 95 parity is the scope.** Post-95 features (ribbon, SmartArt, content controls, track-changes balloons, task panes) are out of scope. Pre-95 compat (binary `.doc`) is import-only via external converter.

## Conventions

### TypeScript
- `strict: true`, `noImplicitAny: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`.
- Prefer discriminated unions for variant types; no ad-hoc string flags.
- Exported public API uses named types, not inline shapes.
- No default exports except React components or lazy-loaded routes.
- `readonly` by default for data shapes. Mutability is explicit and local.

### React
- Function components only. Hooks for state and effects.
- `React.memo` on any component rendered in a list or hot path.
- Split contexts by volatility. Never wrap the whole app in one mutable context.
- `useDeferredValue` / `useTransition` for non-urgent updates (status bar, decorations).

### Code style
- ESLint + Prettier via `tooling/eslint-config`. Commits are blocked by pre-commit hook if either fails.
- File names: `kebab-case.ts`. Class names: `PascalCase`. Functions and variables: `camelCase`. Types: `PascalCase`.
- One public export per file unless the file is an index.
- Imports: `import type` when importing only for types.
- Comments explain **why**, not what. Trivial `// reads the file` comments are rejected.

### Tests
- Colocated `*.test.ts` next to the unit under test.
- Vitest for unit. Playwright for E2E. Storybook for UI. axe-core for a11y.
- Domain invariants covered by `fast-check` property tests.
- Every DOCX mapper ships a round-trip test.
- Budgets from `non-functional.md` are enforced in CI.

### Git
- Branches: `feat/<slug>`, `fix/<slug>`, `refactor/<slug>`, `docs/<slug>`, `chore/<slug>`.
- Commits: conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`). One logical change per commit.
- PRs: link to the issue, list ADRs affected, include screenshots for UI changes, include perf numbers for layout/render changes.
- Never commit `node_modules/`, build output, personal IDE files, or DOCX fixtures without git-lfs.
- Never `push --force` to `main` or `master`.

## Scripts

Run from the repo root with `pnpm`:

```
pnpm install            # install workspace deps
pnpm dev                # Electron + renderer with HMR
pnpm typecheck          # tsc --noEmit across workspaces
pnpm lint               # eslint + prettier --check
pnpm fmt                # prettier --write
pnpm test               # vitest (unit + property)
pnpm test:int           # integration tests (utility processes, real files)
pnpm e2e                # Playwright against built Electron
pnpm build              # full build (tsc + Vite + electron-forge)
pnpm package            # OS installers (requires signing creds)
pnpm perf               # performance harness; compares to baseline
pnpm storybook          # UI component catalog
```

## Common pitfalls and gotchas

- **Don't add dependencies to `@word/domain`.** If you think you need one, open an ADR.
- **Don't use `contenteditable` for the main editor.** We own layout and selection. The only `contenteditable` allowed is the hidden IME input surface described in `rendering.md`.
- **Don't bypass `CommandBus`.** Even "trivial" updates (e.g., setting a toolbar button state) go through commands so undo works.
- **Don't use native HTML tables for rendered document tables.** Tables are laid out by our engine; the DOM reflects the layout output.
- **Don't trust a DOCX file you just received.** Zip-bomb and XXE defenses are always on; use the provided `readDocx` which enforces them.
- **Don't execute WordBasic, VBA, or any macro.** Round-trip as opaque.
- **Don't fetch from the network in the renderer.** The CSP forbids it. File I/O goes through the main process.
- **Don't write to arbitrary paths.** Use the path allowlist from `shell/fileio.ts`.
- **Don't rename a node ID.** Node IDs are stable across edits so bookmarks, comments, and selections survive. Generate fresh IDs only on new nodes.
- **Don't fix a bug by widening a type.** Find the invariant you broke and reassert it.

## What to always remember

- The document model is the product. Everything else is a view of it.
- A correct `Patch` is invertible. If `undo` can't reverse your op, the op is wrong.
- Round-trip fidelity > features. A feature that loses user content in a round trip is a regression.
- Performance budgets are commitments, not aspirations. CI enforces them.
- When a user action has more than one reasonable outcome, check how Word 95 behaves. It's the spec.
- Clean architecture is not a style — it is the product's guarantee that you can understand one layer without the rest.

## Where to ask

- Architectural ambiguity → open an ADR draft under `docs/adr/`.
- Product/UX ambiguity → check `requirements/features.md` or `requirements/ux.md`, then open a discussion.
- Performance regression → re-run `pnpm perf` against main, attach numbers to the PR.
- Security concern → do not merge; tag the platform lead.

## For Claude specifically

- Prefer editing existing files to creating new ones. If you are about to create a new package, first verify there isn't an existing one that belongs in.
- When planning non-trivial work, mention the relevant architecture doc and the layer rule you are satisfying.
- Never delegate understanding of a bug. Read the relevant `editor-core.md` / `rendering.md` / `persistence.md` section in full before changing anything in that area.
- When adding a new dependency, justify it in the PR body and confirm license compatibility (no GPL in distributed artifact).
- Do not generate comments that restate the code. Do not add "this handles edge case X" comments unless the edge case is non-obvious and documented nowhere else.
- Do not auto-commit. Wait for explicit user instruction to `git commit`.
