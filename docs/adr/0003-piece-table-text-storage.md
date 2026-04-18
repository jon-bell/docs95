# ADR-0003: Piece table for paragraph text storage

- Status: Accepted
- Date: 2026-04-18

## Context

Paragraph text must support O(log n) insert/delete, zero-copy snapshots for layout workers, and an append-only mutation model compatible with invertible patches (ADR-0006, ADR-0012) and crash-recovery transaction logs. A contiguous string per paragraph is O(n) per edit — fatal for NFR-1-30 typing latency (≤ 16 ms p95) on long paragraphs.

## Decision

Text inside a paragraph is stored in a **piece table**: a read-only original buffer (from the source document), an append-only add buffer (for edits), and a balanced tree of `Piece` nodes indexing into either buffer (`docs/architecture/editor-core.md:1276-1356`). Paragraph **structure** is an immutable tree with structural sharing (separate decision, baked into the domain).

## Consequences

### Positive

- O(log n) edits; amortized O(1) undo (the inverse op is always a delete-by-piece-range).
- Snapshots to layout/spell/index workers are structural shares, zero-copy (`docs/architecture/editor-core.md:2494`).
- Append-only add buffer is the transaction log: crash-recovery by replay is natural.

### Negative

- Native offsets are UTF-16 code units, not grapheme clusters; grapheme movement is implemented a layer up (`non-functional.md:803-807`).
- Periodic compaction required to bound fragmentation; compaction events surfaced in telemetry.

### Follow-up required

- Define the compaction trigger (edits-since-last-compact and memory-pressure thresholds) and test hooks to observe it.

## Alternatives considered

- **Contiguous string per paragraph.** Rejected: O(n) per edit; fails typing latency on long paragraphs.
- **Rope per paragraph.** Rejected: similar asymptotics, but worse fit for append-only undo and transaction logs.
- **Gap buffer per paragraph.** Rejected: poor for multi-site programmatic edits from Commands.

## References

- `docs/architecture/editor-core.md:1276-1356, 2494`
- `docs/architecture/overview.md:156`
- `docs/requirements/non-functional.md:803-807`
- Related: ADR-0006, ADR-0012
