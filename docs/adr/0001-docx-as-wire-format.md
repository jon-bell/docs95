# ADR-0001: DOCX Transitional as the sole canonical wire format

- Status: Accepted
- Date: 2026-04-18

## Context

Word 95 wrote binary `.doc`. We target a 2026 ecosystem where DOCX (ECMA-376 Transitional) is the dominant office format, openly specified, and widely exchanged. Reverse-engineering `.doc` for *write* is legally and technically heavy without business upside. Users still receive and expect to read `.doc`, `.rtf`, `.odt`, `.html`, and `.txt`.

The question: which format is canonical — the one we round-trip, byte-diff, and gate on CI? See `docs/architecture/overview.md:7`, `docs/requirements/docx-format.md`, `CLAUDE.md:7`.

## Decision

DOCX Transitional is the only canonical format. `.doc` is **import-only** via an external converter (LibreOffice headless — `docs/architecture/persistence.md:30`). `.rtf`, `.html`, `.txt`, and `.md` are **alternate exports**, not round-trip-preserving and not promoted to canonical. We do not write `.doc`. We do not read or write ODF in v1.

## Consequences

### Positive
- Single round-trip contract; one corpus, one fidelity ledger.
- Security boundary: no in-process binary `.doc` parser.
- Schema evolution bounded to ECMA-376.

### Negative
- Permanent lossy mapping for Word-95 features with no DOCX equivalent — WordBasic (ADR-0007), Frames, OLE 1.x.
- `.doc` import requires LibreOffice on the user's machine; we cannot open `.doc` without it.
- No user-side "save back to Word 95" path.

### Follow-up required
- Land a Fidelity Ledger document enumerating every lossy Word-95 → DOCX mapping.

## Alternatives considered

- **Binary `.doc` write.** Rejected: reverse-engineered format, heavy legal/maintenance surface, no 2026 business value.
- **ODF (`.odt`) peer format.** Rejected: doubles format surface; Domain mismatches (e.g., `w:framePr` has no ODF equivalent).
- **Custom native format.** Rejected: defeats interop mission.

## References

- `docs/architecture/overview.md:7, 17`; `docs/architecture/persistence.md:12-18, 30`
- `docs/requirements/docx-format.md:3, 31-46`; `CLAUDE.md:7, 95`
- Related: ADR-0005, ADR-0007
