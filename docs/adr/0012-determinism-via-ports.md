# ADR-0012: Determinism via injected `ClockPort`/`RandomPort`; auto-update fields is opt-in

- Status: Accepted
- Date: 2026-04-18

## Context

`docs/architecture/overview.md:18` and `CLAUDE.md:95` commit to byte-identical output on repeated saves. `Date.now`, `crypto.getRandomValues`, `w14:paraId` generation, RSID generation, and `DATE`/`TIME`/`PAGE` field auto-recomputation break this silently (`docs/requirements/docx-format.md:1054-1082, 1848-1852, 2070-2072`). Snapshot tests (NFR-9-30) and byte-diff round-trip assertions will flake until fixed. Review Phase 1 P1-C5 escalated this to a Critical finding.

## Decision

1. All uses of time and randomness inside `@word/engine`, `@word/layout`, `@word/docx`, and any plugin route through injected `ClockPort` and `RandomPort` (`docs/architecture/editor-core.md:2665-2671`).
2. Production binds system impls; tests inject deterministic fixed-clock and seeded-PRNG impls.
3. `w14:paraId` is seeded from a document-local deterministic stream (hash of document ID + counter), never from a cryptographic source.
4. Auto-updating fields (`DATE`, `TIME`, `PAGE`, computed `TOC`) **do not** recompute on save. A user preference `Tools → Options → Save → Update fields on save` is off by default. Users wanting Word's legacy behavior opt in.
5. Restated contract: "Saved bytes are identical for repeated saves of an unmodified document given a fixed clock." Tests inject the clock.

## Consequences

### Positive

- Snapshot and golden-corpus tests become reproducible; NFR-9-30 achievable.
- DOCX outputs diff cleanly in VCS, enabling byte-diff-review workflows.
- Fuzz reproducers are deterministic.

### Negative

- Users who expect Word's auto-DATE behavior must toggle a preference; release-notes call-out required.
- Every future contributor must route time/random through ports; enforced by lint rule banning `Date.now` / `Math.random` / `crypto.getRandomValues` outside the port implementations.

### Follow-up required

- Add lint rule `no-ambient-time-or-random` to `tooling/eslint-config`.
- Define the doc-local PRNG seed derivation and commit to a test vector.

## Alternatives considered

- **Claim determinism without enforcement.** Rejected: CI flakes prove it false; spec becomes dishonest.
- **Accept non-determinism as a future goal.** Rejected: abandons the core contract and the byte-diff feature that the NFR gating matrix depends on.

## References

- `docs/architecture/overview.md:18`; `CLAUDE.md:95`
- `docs/requirements/docx-format.md:1054-1082, 1848-1862, 2070-2072`
- `docs/architecture/editor-core.md:104, 2665-2671`
- Review Phase 1 P1-C5
- Related: ADR-0005
