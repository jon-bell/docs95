# ADR-0007: No WordBasic or VBA execution; preservation default, strip-on-save offered

- Status: Accepted
- Date: 2026-04-18

## Context

Word 95 shipped WordBasic. DOCX carries VBA in `vbaProject.bin` and `vbaData.xml`. Macros are the single largest document-as-code attack surface in the office-suite ecosystem. Many users expect we will *not* execute macros; enterprise IT admins depend on that guarantee.

## Decision

We **never execute** any macro language — WordBasic, VBA, JScript, ActiveX, OLE automation. `vbaProject.bin` and `vbaData.xml` round-trip as opaque bytes by default (`docs/requirements/non-functional.md:474`). `.docm` and `.dotm` open **read-only** with a persistent banner. ActiveX controls render as placeholders; OLE servers are never launched.

Users may opt into **strip macros on save** as a first-class preference (per-document and global). The preference UX surfaces the implication: "If you preserve macros, recipients opening this file in stock Word may execute them."

## Consequences

### Positive
- Removes the largest document-executable attack class.
- Simplifies security review (no "sandbox an interpreter" question).
- Legal and compliance clarity for enterprise deployment.

### Negative
- Word-95 macro-heavy documents lose behavior inside our app; some users will be unhappy.
- Recipient risk if user saves with macros preserved and the recipient opens in stock Word — UX must surface this (see review Phase 4 P4-W4).

### Follow-up required
- Specify the macro-warning banner, strip-on-save preference, and recipient-risk UX in `docs/requirements/ux.md`.

## Alternatives considered

- **Execute in a sandboxed interpreter.** Rejected: VBA semantics are intractable; vast maintenance cost; attack surface.
- **Strip macros on import.** Rejected: breaks round-trip fidelity; violates ADR-0001's single-format contract.
- **Refuse to open `.docm` entirely.** Rejected: users must be able to *read* macro-bearing documents.

## References

- `docs/requirements/non-functional.md:469-478`
- `docs/architecture/persistence.md:1916, 2284-2286`
- `CLAUDE.md:99-100`
