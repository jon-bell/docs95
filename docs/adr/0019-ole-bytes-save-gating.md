# ADR-0019: OLE object bytes are gated on save with CLSID check, hash log, and user banner

- Status: Accepted
- Date: 2026-04-18

## Context

`docs/architecture/persistence.md:1916` preserves OLE embedded bytes verbatim on round-trip. Our non-execution posture (ADR-0007) protects *us* — we never launch OLE servers locally. But a recipient opening our saved file in stock Word may still be prompted to launch the OLE server and execute the embedded bytes. Review Phase 4 P4-C2 escalated this to Critical for *recipients* (Warning for our users).

## Decision

On save, if the document contains any OLE object:

1. **CLSID check.** Compare every OLE `CLSID` against a known-malicious list shipped with the app. If any CLSID matches, refuse to save and surface an error with the CLSID and a link to the relevant advisory.
2. **Hash log.** Compute SHA-256 of each OLE object's embedded stream; emit a structured log entry per object with the hash, CLSID, and uncompressed size. This lets ops trace an object across user reports without needing the file.
3. **One-time banner on first save after edit.** If the user has modified the document since open and the doc contains OLE objects, surface a banner: "This document contains embedded OLE objects (N objects). Recipients opening it in Microsoft Word may be prompted to run them. [Strip OLE objects on save] [Keep] [Don't ask again for this document]."
4. **User preference.** `Tools → Options → Save → Strip OLE objects on save` is **off** by default (preserves round-trip). Users who enable it remove all OLE object streams on every save (with a warning that round-trip is broken).
5. **Strip semantics.** When stripping, the OLE relationship and placeholder image are retained; the underlying `.bin` stream is removed from the ZIP and the relationship target becomes a dangling reference flagged as `w:movie` or similar null-op. A log entry records the strip.

## Consequences

### Positive
- Addresses P4-C2 recipient risk.
- Preserves ADR-0001's round-trip default while giving users a safety opt-in.
- Known-malicious CLSIDs are refused as an active defense, not a best-effort warning.

### Negative
- Banner-fatigue risk; mitigated by per-document "don't ask again".
- Malicious-CLSID list must be maintained; stale lists are a real vulnerability.
- Stripped-then-saved documents no longer round-trip; user must understand this.

### Follow-up required
- Define the malicious-CLSID update channel (signed bundle shipped with the app; monthly refresh; manual override disabled by default).
- Specify the banner UX in `docs/requirements/ux.md`.
- Add an integration test: document with benign OLE CLSID → save → open → byte-equal OLE stream.
- Add an integration test: document with flagged CLSID → save → refused with clear error.

## Alternatives considered

- **Always strip OLE on save.** Rejected: violates the round-trip contract (ADR-0001); many legitimate documents contain benign OLE (Excel worksheets, Equation 2.x).
- **Never surface a banner.** Rejected: silent recipient risk; P4-C2 unaddressed.
- **Warn on open instead of on save.** Rejected: users who read a document without editing it are not the right audience; the risk materializes on *distribution*, not reading.

## References

- `docs/architecture/persistence.md:1916`
- `docs/requirements/non-functional.md:504-510`
- Review Phase 4 P4-C2, P4-W4
- Related: ADR-0001, ADR-0007, ADR-0014
