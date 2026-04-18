# ADR-0020: Plugin API stability policy — internal semver in v1; public API in v2

- Status: Accepted
- Date: 2026-04-18

## Context

ADR-0006 makes the `Plugin` contract the central feature-extension mechanism: 17+ subsystems ship as plugins from day one. `NFR-16-80` (`docs/requirements/non-functional.md:1405-1407`) declares no public plugin API in v1, but commits to semver when one is introduced. Without a stability policy for the _internal_ plugin contract, internal contributors silently break each other, refactors cascade, and moving to a public API in v2 becomes a "big bang" rewrite. Review Phase 3 P3-W3 flagged this.

## Decision

**v1: internal-only, semver-enforced.**

- All plugins are internal (packages named `@word/engine-plugin-*`). Not published to the public registry.
- The engine–plugin contract is semver-versioned against `@word/engine`'s major version:
  - **patch** = bugfix, no contract change;
  - **minor** = additive to the Plugin contract (new optional hook, new capability port, new `CommandDef` field with a default);
  - **major** = any breaking change: removing a hook, changing a type signature, changing registration order semantics.
- Each engine major ships with a migration guide under `docs/plugin-migrations/<from>-to-<to>.md`.
- A plugin declares the engine majors it supports via `peerDependencies` on `@word/engine`.

**v2: public API introduction.**

- Public plugin API opens after the internal contract has survived at least two engine majors with no forced breakage reverted.
- Public contract is a _subset_ of the internal contract, explicitly re-exported from `@word/plugin-api`. The engine is allowed to use internal-only hooks; plugins publishing against `@word/plugin-api` cannot.
- The public API carries its own independent semver track.

**Contract tests.** Every internal plugin ships with a conformance test (`plugin.contract.test.ts`) that asserts: (a) it declares all hooks it implements; (b) input/output payloads match the declared types under fuzzing; (c) plugin init is all-or-nothing (review P2-W7). CI blocks merge if conformance fails.

## Consequences

### Positive

- Internal contributors get a predictable contract with known change cadence.
- Refactors of the core are cheap: a single engine-major migration moves all plugins in lockstep.
- The v2 public surface is pre-hardened by two internal majors of real use.
- No premature lock-in to a public API we'd regret.

### Negative

- Versioning discipline has a cost; every contract change requires review against the semver categorization.
- Plugin authors must re-declare peer-dep ranges on each engine major; scripted via Renovate (`non-functional.md:548`).

### Follow-up required

- Author the Plugin contract test harness.
- Define the plugin manifest schema (fields: `id`, `engineMajor`, `capabilities`, `provides`, `requires`).
- Stand up `docs/plugin-migrations/` and land an empty `1-to-2.md` template.

## Alternatives considered

- **No versioning until public launch.** Rejected: internal plugins silently drift, making migration to public API a rewrite.
- **Ship public API in v1.** Rejected: premature commitment; the contract is not yet battle-tested.
- **Per-plugin independent versioning with peer ranges.** Rejected: matrix explosion; `yarn resolutions` hell; difficult for a monorepo.

## References

- `docs/requirements/non-functional.md:1405-1407`
- `docs/architecture/overview.md:163-192`
- `docs/architecture/editor-core.md:2121-2141`
- Review Phase 3 P3-W3; Phase 2 P2-W7
- Related: ADR-0006, ADR-0015
