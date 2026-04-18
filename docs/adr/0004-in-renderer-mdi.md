# ADR-0004: In-renderer MDI on all platforms; native multi-window is opt-in

- Status: Accepted
- Date: 2026-04-18

## Context

Word 95 was MDI (Multiple Document Interface): one top-level window hosting child documents, with Window menu, Ctrl+F6 cycling, cascade/tile, and maximized-child chrome merge. macOS HIG prefers one document per window. Windows and Linux expectations are mixed. Pure native multi-window loses Word 95 parity (Ctrl+F6, Window-menu list, unified Customize scope, cascading).

## Decision

MDI is implemented **inside the renderer process** on all OSes. The user preference `Tools → Options → Use multiple document interface` exists from v1; toggling it to "native multi-window" is stubbed in v1 (documented no-op) and delivered in v2. Focus management, menu state, and accessibility tree are MDI-aware from day one.

## Consequences

### Positive

- Single implementation of child-window semantics across Windows, macOS, Linux.
- Word-95-accurate keyboard and focus behavior (Ctrl+F6, Alt+-, cascade/tile).
- One Customize scope and one Window menu.

### Negative

- macOS HIG default violation; needs clear release-notes messaging.
- Accessibility tree for MDI is nonstandard; screen-reader behavior must be explicitly choreographed (see ADR-0011).
- macOS Dock "all windows" list shows one app window instead of per-document.

### Follow-up required

- Document the MDI accessibility-tree shape in `docs/architecture/ui-components.md` (parent-frame → child-window → document → content hierarchy).

## Alternatives considered

- **Native multi-window by default on all OSes.** Rejected: loses Word-95 parity for the product's main user population.
- **Tabbed document interface.** Rejected: neither Word 95 nor native; worst of both.
- **MDI on Windows/Linux, native on macOS.** Rejected: divergent UX per OS; doubles test matrix without corresponding benefit.

## References

- `docs/architecture/ui-components.md:84-122, 1936-1953`
- `docs/requirements/ux.md:1-30, 128-130`
- Related: ADR-0011
