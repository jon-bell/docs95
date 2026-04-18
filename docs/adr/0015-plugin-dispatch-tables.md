# ADR-0015: Core has no type switches on governed unions; plugins contribute dispatch-table rows

- Status: Accepted
- Date: 2026-04-18

## Context

Review Phase 2 identified five independent places where the core hard-switches on a governed union:

- Position remapping switches on `op.kind` (`docs/architecture/editor-core.md:1891-1918`).
- DOCX reader/writer switches on element namespace/local-name (`docs/architecture/persistence.md:172-254`).
- Schema validator hard-codes node-type rules (`docs/architecture/editor-core.md:2408-2425`).
- Coalescing rules stored as a hardcoded array, not plugin-contributable (`docs/architecture/editor-core.md:1722-1750`).
- Menu accelerator engine hard-codes key-binding formats (`docs/architecture/ui-components.md:814-922`).

Each switch makes ADR-0006's "feature as plugin" promise silently untrue: adding a table-cell, footnote, or hyperlink plugin touches a central switch in multiple packages.

## Decision

Every such switch is refactored into a **dispatch table** keyed by the governed kind/namespace. The core owns the dispatcher; plugins register rows during boot. Specifically:

- `OpRemapRegistry`: `Map<OpKind, (op, pos) => pos>`.
- `DocxElementRegistry`: `Map<{ns, localName}, ElementMapper>`.
- `SchemaRuleRegistry`: `Map<NodeType, SchemaRule>`.
- `CoalesceRegistry`: `Map<IntentKind, CoalesceRule>`.
- `KeymapRegistry`: already partially present; extended to plugin-contributable.

An ESLint rule `no-kind-switch` forbids `switch (x.kind)` and chained `if (x.kind === ...)` over the governed unions inside `@word/domain`, `@word/engine`, `@word/docx`, and `@word/engine-plugin-*`.

## Consequences

### Positive
- Features are genuinely pluggable; adding a DOCX element touches one plugin file, not five core files.
- Tests register spy handlers at runtime to observe dispatch.
- Dead-code deletion per unused feature is one config change.

### Negative
- One indirection per dispatch; performance-negligible in practice.
- Dispatch-table typing requires care; template types (`Record<Kind, Handler<OfKind<Kind>>>`) do the work in TS 5.
- Registration ordering bugs surface at boot, not at build time; mitigated by boot-time conformance checks.

### Follow-up required
- Audit all existing type switches at M0 exit; file one refactor issue per switch.
- Author the `no-kind-switch` ESLint rule under `tooling/eslint-config/rules/`.

## Alternatives considered

- **Visitor pattern.** Rejected: more classes; less ergonomic in TypeScript; visitor acceptor interfaces compound ISP problems.
- **Status quo with careful review.** Rejected: review discipline does not prevent drift; the plugin promise stays a lie.
- **Pattern-matching via `ts-pattern`.** Rejected: syntactic sugar over a switch; same OCP problem.

## References

- `docs/architecture/editor-core.md:1722-1750, 1891-1918, 2408-2425`
- `docs/architecture/persistence.md:172-254`
- `docs/architecture/ui-components.md:814-922`
- Review Phase 2 P2-C1, P2-C2, P2-W8
- Related: ADR-0006
