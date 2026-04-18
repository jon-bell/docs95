# ADR-0016: Autosave default 120 s; enforced IPC and worker timeouts; stale-result telemetry

- Status: Accepted
- Date: 2026-04-18

## Context

Three safety-adjacent gaps were surfaced in review Phase 4:

1. **Autosave default conflicts.** `docs/requirements/non-functional.md:310` states "default **10 min**" (Word parity); `docs/architecture/electron.md:2129` states "120 s". NFR-4-64 targets "≤ 10 s of work lost" on SIGKILL — 10 min autosave cannot meet this. (Phase 4 P4-W1.)
2. **IPC router has no default timeout.** `electron.md:863-893` — renderer promise hangs indefinitely if the main process drops a response.
3. **Workers silently discard stale results.** `editor-core.md:2515`, `rendering.md:1672-1675` — stale spell-check or pagination results are dropped without log or telemetry. (Phase 2 P2-C4.)
4. **Layout worker has no death supervisor.** `rendering.md:1650-1683` — if a worker dies mid-layout, in-flight requests never resolve. (Phase 4 P4-C3.)

## Decision

1. **Autosave default interval is 120 s.** The preference panel retains 1 / 5 / 10 / 15 / 30 min as choices, but the ship default is 120 s. `non-functional.md:310` and `electron.md:2129` are amended to agree on 120 s.
2. **Every IPC channel has an enforced timeout.** Default 30 s; 120 s for heavy export/import calls. Matches `NFR-5-28`. The `invoke` wrapper in preload enforces it.
3. **Every worker has a heartbeat supervisor.** Unacked requests past 2× expected time trigger worker restart and re-dispatch. Pending futures settle with a typed `WorkerCrashed` error, not a generic rejection.
4. **Stale worker results are surfaced.** Version-gate mismatches emit a `perf.outlier` telemetry event and a machine-readable log entry. Never silently dropped.

## Consequences

### Positive
- NFR-4-64 achievable (≤ 10 s work lost) without heroics.
- No silent hangs on a dropped IPC response.
- No silent correctness failures from stale worker results.
- Uniform supervisor pattern across the four utility processes and the layout workers.

### Negative
- Slightly higher telemetry volume; within `NFR-1-143` 32 KB / 5 min budget.
- Autosave triples daily write count vs. the 10-min default; SSD-only hardware baseline (`NFR-2-1`) makes this acceptable.
- Workers must be re-entrancy-safe on restart + re-dispatch; existing shape/break code must be audited.

### Follow-up required
- Add test: kill a layout worker mid-request; assert client receives `WorkerCrashed` within heartbeat deadline.
- Add test: drop an IPC reply from the main process; assert renderer observes timeout within 30 s.
- Amend `non-functional.md:310` in the same PR that lands this ADR.

## Alternatives considered

- **Keep 10-min autosave "for Word parity".** Rejected: violates NFR-4-64; users lose up to 10 min of work on crash.
- **Per-channel ad-hoc timeouts.** Rejected: every contributor re-invents; review Phase 2 P2-C5.
- **Let workers drop stale results silently with a debug log.** Rejected: debug logs are not user-visible and are dropped in release; defeats the non-functional outlier-tracking budget.

## References

- `docs/requirements/non-functional.md:310, 328-379, 437, 1143`
- `docs/architecture/electron.md:863-893, 2095-2172, 2438-2441, 2052-2053`
- `docs/architecture/editor-core.md:2504-2515`
- `docs/architecture/rendering.md:1650-1708`
- Review Phase 2 P2-C4, P2-C5; Phase 4 P4-C3, P4-W1, P4-W3
- Related: ADR-0010
