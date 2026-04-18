# ADR-0009: HarfBuzz WASM for complex-script shaping, staged via segmentation

- Status: Accepted
- Date: 2026-04-18

## Context

Latin and CJK shape correctly using the browser's Canvas `measureText`. Complex scripts — Arabic, Hebrew, Devanagari, Thai, Myanmar, Khmer, Tibetan — require a real shaper to correctly handle cursive joining, reordering, cluster formation, and mark positioning. HarfBuzz is the reference implementation. Loading HarfBuzz (~2–3 MB WASM) on every cold start taxes the 80% Latin-only launch scenario.

## Decision

v1 ships Canvas `measureText` as a fast path for Latin and CJK. UAX #24 script segmentation identifies complex-script runs; first use of a complex-script run triggers lazy HarfBuzz WASM load. Shaping results are cached with a key of (script, font, language, text) per `docs/architecture/rendering.md:641, 657`. Canvas–HarfBuzz divergence on overlap cases is CI-gated via the regression suite referenced in `rendering.md:1744-1753`.

## Consequences

### Positive
- Cold-start budget met (`non-functional.md:175-189`) for the Latin-only scenario.
- Correct shaping for RTL and Indic text from v1 (text-level; UI-mirroring remains v2 per `ux.md:2141-2142`).

### Negative
- Two shaping paths = visual-regression surface; divergence must be gated in CI or bugs silently creep in.
- First-use latency spike for RTL users (WASM download + warmup).

### Follow-up required
- Define the divergence tolerance between Canvas and HarfBuzz widths (target: ≤ 0.5 px on a documented font corpus).

## Alternatives considered

- **HarfBuzz always-on.** Rejected: pays shaping cost on the 80% case; cold-start budget violated.
- **Canvas only.** Rejected: fails correctness for Arabic, Indic, Thai — blocks NFR-8-20 BiDi conformance.
- **Skia text shaping.** Rejected: similar WASM size, no advantage over HarfBuzz for our purposes.

## References

- `docs/architecture/rendering.md:414-450, 502-566, 641, 657, 1744-1753`
- `docs/requirements/non-functional.md:771-792, 786-792`
- Related: ADR-0002
