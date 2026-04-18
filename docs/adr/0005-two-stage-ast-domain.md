# ADR-0005: Two-stage AST ↔ Domain pipeline for DOCX

- Status: Accepted
- Date: 2026-04-18

## Context

ECMA-376 is vast. A direct XML↔Domain mapper drops whatever the Domain doesn't model. Word ships namespaces (`w14:`, `w15:`, `w16cid:`) faster than any independent implementation can. Real-world corpus DOCX files routinely contain vendor extensions we've never seen. Round-trip fidelity requires that unknown content survives the edit-save cycle byte-exact.

## Decision

Persistence is two explicit layers:

1. **AST** — ECMA-376-faithful: every element, attribute, text node, namespace preserved. Unknown subtrees attach as `OpaqueXml`. `mc:AlternateContent` is resolved at AST time with the highest `Requires` branch selected and `Fallback` retained.
2. **Domain** — the semantic model the editor mutates.

Bidirectional mappers move between the two. The AST is the persistence-side contract; the Domain is the engine-side contract.

## Consequences

### Positive

- Forward compatibility: novel vendor XML round-trips verbatim.
- Layered testing: AST↔XML and AST↔Domain test separately; each has a property-test surface (`non-functional.md:875-879`).
- The Domain remains free of format concerns (`CLAUDE.md:67`).

### Negative

- Two model surfaces to maintain; doubled mapping code per feature.
- Opaque subtrees need position anchoring across edits (ADR-0013) or they relocate silently.
- Canonicalization must be specified precisely or round-trip is not byte-stable (ADR-0012).

### Follow-up required

- Enumerate every `[verify]` in `docs/requirements/docx-format.md` as an AST-level decision; resolve each before M1 exit.

## Alternatives considered

- **Single XML ↔ Domain mapper.** Rejected: drops unknown content; no forward compatibility.
- **Store raw XML blobs in the Domain.** Rejected: pollutes the Domain with persistence concerns; violates `CLAUDE.md:67`.

## References

- `docs/architecture/persistence.md:129-137, 886-921, 1664-1695`
- `docs/requirements/docx-format.md:1664-1695`
- `docs/architecture/overview.md:17`
- Related: ADR-0012, ADR-0013
