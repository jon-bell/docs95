# ADR-0006: Plugin-based feature composition over a minimal core

- Status: Accepted
- Date: 2026-04-18

## Context

Tables, lists, styles, footnotes, endnotes, comments, revisions, fields, bookmarks, hyperlinks, drawings, images, frames, mail-merge, spellcheck, autocorrect, autoformat, macro-preserve — at least 17 subsystems. Embedding all of them in a monolithic engine ossifies the core, makes feature ownership diffuse, and prevents targeted deletion of unused features.

## Decision

The engine core understands only `Paragraph` and `Run`. Every other feature is a `Plugin` contributing schema extensions, commands, keymap, input handlers, decorations, state slice, and per-format serializer mappers (`docs/architecture/overview.md:176-192`). The `PluginHost` topologically sorts plugins and boots them. Core cannot import a plugin.

New feature proposals that claim to belong in the core require an ADR (per `CLAUDE.md:74`).

## Consequences

### Positive

- Core stays small, well-tested, and stable.
- Features are independently ownable, testable, and removable.
- DOCX mappers per feature live with the feature, not scattered in a central reader/writer (supports ADR-0015).

### Negative

- Plugin contract is load-bearing; breaking it is equivalent to a core break. A Plugin API semver policy is required.
- Cross-plugin interactions (table-cell → footnote → tracked-change) need explicit sequencing rules, documented per plugin.
- Plugin init failures must not leave the engine degraded with a logged warning (see review Phase 2 P2-W7); init is all-or-nothing.

### Follow-up required

- Draft ADR-0018: Plugin API stability and versioning (internal-only in v1).

## Alternatives considered

- **Monolithic engine.** Rejected: unsustainable at feature count; diffuse ownership.
- **Micro-kernel with scripting.** Rejected: over-engineered; no scripting mandate; widens attack surface.

## References

- `docs/architecture/overview.md:163-192`
- `docs/architecture/editor-core.md:2121-2141, 2357-2365`
- `CLAUDE.md:74`
- Related: ADR-0015
