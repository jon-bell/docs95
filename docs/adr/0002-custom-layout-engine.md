# ADR-0002: Custom measure/shape/break/paginate engine over `contenteditable`

- Status: Accepted
- Date: 2026-04-18

## Context

`contenteditable` is nondeterministic across browsers, adversarial to IME beyond baseline Latin input, tightly coupled to the DOM's implicit selection model, and incapable of guaranteeing exact pagination or print output. Word 95 parity demands reproducible line breaks, Word-semantic cursor movement, a deterministic accessibility tree independent of visual layout, and pagination that matches between screen, print preview, and PDF export.

## Decision

We own the layout pipeline end-to-end, as six deterministic stages (Measure, Line Break, Block Layout, Table Layout, Pagination, Positioning) — see `docs/architecture/rendering.md`. The DOM is an **output** of layout coordinates, never a source of truth. The only `contenteditable` element permitted is a hidden IME input surface described in `docs/architecture/rendering.md`. We do not call `document.execCommand` anywhere.

## Consequences

### Positive

- Deterministic pagination; testable via JSON diff of `PageLayout[]` and pixel diff of rendered pages.
- Cross-OS, cross-browser parity.
- Print output uses the same `PageLayout` as the viewport — no divergence.

### Negative

- ~3,200 lines of layout to own and defend (`rendering.md`).
- We rebuild affordances the browser gives for free: spellcheck squiggles, native selection gestures, drag-to-select kinetics.
- Worker + main-thread coordination cost (see ADR-0010, ADR-0016).

### Follow-up required

- Canvas-fallback mode for very large documents is referenced in `rendering.md` but needs a specific trigger threshold and switch UX.

## Alternatives considered

- **`contenteditable` + Slate/ProseMirror.** Rejected: fails Word-exact pagination and determinism; IME edge cases remain browser-specific.
- **Canvas-only rendering.** Rejected: kills accessibility; Canvas text is inaccessible without a parallel a11y tree.
- **Native platform text editing.** Rejected: fragments cross-platform story; disqualifies Electron's single-code-base advantage.

## References

- `docs/architecture/rendering.md:39-92` and the full file
- `CLAUDE.md:94` ("Don't use `contenteditable` for the main editor")
- Related: ADR-0009, ADR-0010, ADR-0012
