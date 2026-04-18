# ADR-0013: Opaque XML subtrees anchored by stable `NodeId`, not position-in-parent

- Status: Accepted
- Date: 2026-04-18

## Context

`docs/architecture/persistence.md:1692-1695` currently falls back to "append at end of nearest known parent" when an edit's insertion point intersects or is adjacent to an opaque (unknown-namespace) subtree. This is **silent content relocation**: the unknown child ends up in a different position than it started. For a round-trip-fidelity product whose core contract is "don't lose what you don't understand" (`docs/architecture/overview.md:17`), silent motion is a correctness failure. Review Phase 1 P1-W7 flagged this.

## Decision

Every AST subtree — known or opaque — receives a stable `NodeId` at parse time. The `NodeId` is a 21-char nanoid for new content; for imported content without one, the reader generates it deterministically from the subtree's content hash (namespace + local-name + attribute list + child-content hash). The Domain references content by `NodeId`, never by sibling index. The writer re-emits each opaque subtree at the position indicated by its `NodeId` anchor, even after the surrounding structure has been edited.

## Consequences

### Positive
- Opaque content never silently relocates on edit.
- Unknown-namespace content survives edits intact for round-trip.
- `NodeId` scheme is already committed in `overview.md:157`; this ADR extends its scope to opaque subtrees.

### Negative
- Each document carries a `NodeId` index in memory; bounded by document size.
- Content-hash-derived IDs are stable only for unmodified imports; modification by another tool between reads produces different IDs. Documented as a known limitation; not a correctness hazard.

### Follow-up required
- Persistence integration tests must include: "edit adjacent to opaque subtree; re-save; assert opaque subtree byte-identical and at the same document-order position."

## Alternatives considered

- **Status quo (append-at-end fallback).** Rejected: silent data motion; violates round-trip fidelity.
- **Refuse to edit documents containing unknown subtrees.** Rejected: user-hostile; most real corpus documents have at least one opaque subtree.
- **Serialize opaque subtrees as text into the domain.** Rejected: pollutes the domain with format concerns; violates ADR-0005.

## References

- `docs/architecture/persistence.md:1691-1695`; `docs/architecture/overview.md:157`
- Review Phase 1 P1-W7
- Related: ADR-0005
