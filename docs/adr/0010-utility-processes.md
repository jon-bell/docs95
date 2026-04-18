# ADR-0010: Utility processes for parse, spell-check, indexing, macro-sanitize

- Status: Accepted
- Date: 2026-04-18

## Context

Parsing a 1000-page DOCX, running Hunspell over 100k words, maintaining a find-all index, and sanitizing macro content all burn CPU and risk OOM. Doing this work in the renderer threatens NFR-1-30 typing latency (≤ 16 ms p95) and means a parser crash kills the edit session.

## Decision

Each CPU-heavy or risky subsystem runs in a dedicated Electron `utilityProcess`: `docx-parser`, `spell-check`, `indexer`, `macro-sanitizer`. IPC uses the shared typed envelope (`docs/architecture/electron.md:2362-2381`). Crashes respawn with exponential backoff (`electron.md:2034-2050`); three crashes in 60 s disables the feature with a user-visible banner (`electron.md:2052-2053`). The `UtilityClient` supervisor enforces per-call timeouts and fails in-flight calls explicitly (ADR-0016).

## Consequences

### Positive
- Renderer stays under typing-latency budget.
- Parser / spell-check / indexer crashes do not kill the edit session.
- Principle-of-least-privilege: macro-sanitizer has no filesystem access.

### Negative
- Extra IPC cost and serialization overhead for every call.
- `utilityProcess` is Electron-specific; the browser-target port (`non-functional.md:1418-1419`) needs a Web Worker fallback.
- A single utility cannot share in-memory state with other utilities.

### Follow-up required
- Specify per-utility concurrency caps and request-queue depth (currently unbounded — review Phase 3 P3-W4).

## Alternatives considered

- **Web Workers only.** Rejected: share renderer heap; a parser OOM is fatal to the tab.
- **All work in the main process.** Rejected: bloats the privileged process; violates privilege-minimization; a parser crash kills everything.
- **Long-lived one-shot subprocess per call.** Rejected: spawn cost dominates; no cache warmup.

## References

- `docs/architecture/electron.md:2034-2063, 2362-2447`
- `docs/architecture/overview.md:130-142`
- Related: ADR-0016
