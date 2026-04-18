# Architecture Decision Records

Governance procedure in `../architecture/overview.md:385-398` and `../requirements/non-functional.md:1291-1298`.

A new ADR is required for any change touching architecture boundaries, major dependency adds/removes, security posture, performance budgets, or cross-process boundaries.

## Index

| Num | Title | Status | Date |
|---|---|---|---|
| [0001](0001-docx-as-wire-format.md) | DOCX Transitional as the sole canonical wire format | Accepted | 2026-04-18 |
| [0002](0002-custom-layout-engine.md) | Custom measure/shape/break/paginate engine over `contenteditable` | Accepted | 2026-04-18 |
| [0003](0003-piece-table-text-storage.md) | Piece table for paragraph text storage | Accepted | 2026-04-18 |
| [0004](0004-in-renderer-mdi.md) | In-renderer MDI on all platforms; native multi-window opt-in | Accepted | 2026-04-18 |
| [0005](0005-two-stage-ast-domain.md) | Two-stage AST ↔ Domain pipeline for DOCX | Accepted | 2026-04-18 |
| [0006](0006-plugin-based-composition.md) | Plugin-based feature composition over a minimal core | Accepted | 2026-04-18 |
| [0007](0007-no-macro-execution.md) | No macro execution; preservation default, strip-on-save offered | Accepted | 2026-04-18 |
| [0008](0008-zustand-over-redux.md) | Engine-owned state + Zustand UI/prefs stores, bridged by events | Accepted | 2026-04-18 |
| [0009](0009-harfbuzz-wasm-staged.md) | HarfBuzz WASM for complex-script shaping, staged via segmentation | Accepted | 2026-04-18 |
| [0010](0010-utility-processes.md) | Utility processes for parse, spell-check, indexing, macro-sanitize | Accepted | 2026-04-18 |
| [0011](0011-accessible-theme-default.md) | Accessible (Modern) theme is default; Word 95 fidelity opt-in | Accepted | 2026-04-18 |
| [0012](0012-determinism-via-ports.md) | Determinism via `ClockPort`/`RandomPort`; auto-update fields opt-in | Accepted | 2026-04-18 |
| [0013](0013-opaque-xml-nodeid-anchoring.md) | Opaque XML subtrees anchored by stable `NodeId` | Accepted | 2026-04-18 |
| [0014](0014-hyperlink-scheme-allowlist.md) | Hyperlink scheme allowlist, not blocklist | Accepted | 2026-04-18 |
| [0015](0015-plugin-dispatch-tables.md) | No type switches on governed unions; plugins contribute dispatch rows | Accepted | 2026-04-18 |
| [0016](0016-autosave-and-timeouts.md) | Autosave 120 s; enforced IPC/worker timeouts; stale-result telemetry | Accepted | 2026-04-18 |
| [0017](0017-csp-unsafe-inline-styles.md) | CSP `style-src 'unsafe-inline'` permitted; `script-src` strict | Accepted | 2026-04-18 |
| [0018](0018-i18next-for-ui-localization.md) | i18next + react-i18next for UI localization | Accepted | 2026-04-18 |
| [0019](0019-ole-bytes-save-gating.md) | OLE bytes gated on save with CLSID check, hash log, user banner | Accepted | 2026-04-18 |
| [0020](0020-plugin-api-stability.md) | Plugin API stability — internal semver v1, public API v2 | Accepted | 2026-04-18 |

## Template

Every ADR follows: `Status`, `Date`, `Context`, `Decision`, `Consequences` (positive / negative / follow-up), `Alternatives considered`, `References`.

Numbering is sequential; never reuse a retired number — use `Status: Superseded by ADR-NNNN` instead.

## Legacy aliases

Older parts of the documentation reference ADRs by descriptive name rather than number. The aliases resolve as follows:

| Legacy name | Canonical |
|---|---|
| `ADR-security-001` | [ADR-0017](0017-csp-unsafe-inline-styles.md) |
| `ADR-i18n-001` | [ADR-0018](0018-i18next-for-ui-localization.md) |

Future documentation should use the numeric canonical form.
