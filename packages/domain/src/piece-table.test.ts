import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createPieceTable } from './piece-table.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Apply the same ops to both a PieceTable and a plain string. */
type Op =
  | { kind: 'insert'; offset: number; text: string }
  | { kind: 'delete'; offset: number; count: number };

function applyToString(s: string, op: Op): string {
  if (op.kind === 'insert') {
    const o = Math.max(0, Math.min(op.offset, s.length));
    return s.slice(0, o) + op.text + s.slice(o);
  }
  const o = Math.max(0, Math.min(op.offset, s.length));
  const c = Math.max(0, Math.min(op.count, s.length - o));
  return s.slice(0, o) + s.slice(o + c);
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('createPieceTable', () => {
  it('creates an empty table', () => {
    const pt = createPieceTable();
    expect(pt.length).toBe(0);
    expect(pt.toString()).toBe('');
  });

  it('creates a table from an initial string', () => {
    const pt = createPieceTable('hello');
    expect(pt.length).toBe(5);
    expect(pt.toString()).toBe('hello');
  });

  it('inserts at the beginning', () => {
    const pt = createPieceTable('world').insert(0, 'hello ');
    expect(pt.toString()).toBe('hello world');
  });

  it('inserts at the end', () => {
    const pt = createPieceTable('hello').insert(5, ' world');
    expect(pt.toString()).toBe('hello world');
  });

  it('inserts in the middle', () => {
    const pt = createPieceTable('helo').insert(3, 'l');
    expect(pt.toString()).toBe('hello');
  });

  it('deletes from the beginning', () => {
    const pt = createPieceTable('hello').delete(0, 2);
    expect(pt.toString()).toBe('llo');
  });

  it('deletes from the end', () => {
    const pt = createPieceTable('hello').delete(3, 2);
    expect(pt.toString()).toBe('hel');
  });

  it('deletes from the middle', () => {
    const pt = createPieceTable('hello world').delete(5, 1);
    expect(pt.toString()).toBe('helloworld');
  });

  it('deletes the entire content', () => {
    const pt = createPieceTable('hello').delete(0, 5);
    expect(pt.toString()).toBe('');
    expect(pt.length).toBe(0);
  });

  it('returns the same instance for a no-op insert (empty string)', () => {
    const pt = createPieceTable('hello');
    const pt2 = pt.insert(2, '');
    expect(pt2).toBe(pt);
  });

  it('returns the same instance for a no-op delete (zero count)', () => {
    const pt = createPieceTable('hello');
    const pt2 = pt.delete(2, 0);
    expect(pt2).toBe(pt);
  });

  it('clamps insert offset below 0', () => {
    const pt = createPieceTable('hello').insert(-5, 'X');
    expect(pt.toString()).toBe('Xhello');
  });

  it('clamps insert offset above length', () => {
    const pt = createPieceTable('hello').insert(999, 'X');
    expect(pt.toString()).toBe('helloX');
  });

  it('clamps delete offset and count', () => {
    const pt = createPieceTable('hello').delete(-1, 100);
    expect(pt.toString()).toBe('');
  });

  it('supports chained inserts', () => {
    const pt = createPieceTable('').insert(0, 'a').insert(1, 'b').insert(2, 'c');
    expect(pt.toString()).toBe('abc');
  });

  it('supports interleaved insert and delete', () => {
    const pt = createPieceTable('hello world').delete(5, 6).insert(5, '!');
    expect(pt.toString()).toBe('hello!');
  });

  it('snapshot reflects state', () => {
    const pt = createPieceTable('abc').insert(3, 'def');
    const snap = pt.snapshot();
    expect(snap.length).toBe(6);
    expect(snap.original).toBe('abc');
    expect(snap.added).toBe('def');
  });

  it('does not mutate the original table after insert', () => {
    const pt1 = createPieceTable('hello');
    const pt2 = pt1.insert(5, ' world');
    expect(pt1.toString()).toBe('hello');
    expect(pt2.toString()).toBe('hello world');
  });

  it('does not mutate the original table after delete', () => {
    const pt1 = createPieceTable('hello');
    const pt2 = pt1.delete(0, 3);
    expect(pt1.toString()).toBe('hello');
    expect(pt2.toString()).toBe('lo');
  });

  it('handles surrogate pairs correctly — does not split mid-pair', () => {
    // U+1F600 GRINNING FACE = \uD83D\uDE00 (2 code units)
    const emoji = '\uD83D\uDE00';
    const pt = createPieceTable('a' + emoji + 'b');
    expect(pt.length).toBe(4); // a(1) + emoji(2) + b(1)
    // Deleting code unit 1 (high surrogate) should not produce lone surrogate.
    const afterDelete = pt.delete(1, 1);
    // The implementation must not produce lone surrogates. Verify the result is
    // a valid string (no lone surrogates).
    const result = afterDelete.toString();
    for (let i = 0; i < result.length; i++) {
      const c = result.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const next = result.charCodeAt(i + 1);
        expect(next >= 0xdc00 && next <= 0xdfff).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

const asciiText = fc.string({ minLength: 0, maxLength: 20 });

const opArb = (maxLen: number): fc.Arbitrary<Op> =>
  fc.oneof(
    fc.record({
      kind: fc.constant('insert' as const),
      offset: fc.integer({ min: 0, max: maxLen }),
      text: asciiText,
    }),
    fc.record({
      kind: fc.constant('delete' as const),
      offset: fc.integer({ min: 0, max: maxLen }),
      count: fc.integer({ min: 0, max: maxLen }),
    }),
  );

describe('PieceTable property tests', () => {
  it('toString() matches plain string after arbitrary ops', () => {
    fc.assert(
      fc.property(asciiText, fc.array(opArb(50), { minLength: 0, maxLength: 15 }), (init, ops) => {
        let pt = createPieceTable(init);
        let s = init;
        for (const op of ops) {
          pt =
            op.kind === 'insert' ? pt.insert(op.offset, op.text) : pt.delete(op.offset, op.count);
          s = applyToString(s, op);
        }
        return pt.toString() === s;
      }),
      { numRuns: 500 },
    );
  });

  it('length is always non-negative', () => {
    fc.assert(
      fc.property(asciiText, fc.array(opArb(50), { minLength: 0, maxLength: 10 }), (init, ops) => {
        let pt = createPieceTable(init);
        for (const op of ops) {
          pt =
            op.kind === 'insert' ? pt.insert(op.offset, op.text) : pt.delete(op.offset, op.count);
        }
        return pt.length >= 0;
      }),
    );
  });

  it('length equals toString().length', () => {
    fc.assert(
      fc.property(asciiText, fc.array(opArb(50), { minLength: 0, maxLength: 10 }), (init, ops) => {
        let pt = createPieceTable(init);
        for (const op of ops) {
          pt =
            op.kind === 'insert' ? pt.insert(op.offset, op.text) : pt.delete(op.offset, op.count);
        }
        return pt.length === pt.toString().length;
      }),
    );
  });

  it('snapshot.length matches pt.length', () => {
    fc.assert(
      fc.property(asciiText, fc.array(opArb(30), { minLength: 0, maxLength: 8 }), (init, ops) => {
        let pt = createPieceTable(init);
        for (const op of ops) {
          pt =
            op.kind === 'insert' ? pt.insert(op.offset, op.text) : pt.delete(op.offset, op.count);
        }
        return pt.snapshot().length === pt.length;
      }),
    );
  });

  it('insert followed by delete at same offset is identity', () => {
    fc.assert(
      fc.property(asciiText, fc.integer({ min: 0, max: 20 }), asciiText, (init, offset, text) => {
        const clampedOffset = Math.min(offset, init.length);
        const pt = createPieceTable(init);
        const after = pt.insert(clampedOffset, text).delete(clampedOffset, text.length);
        return after.toString() === init;
      }),
    );
  });
});
