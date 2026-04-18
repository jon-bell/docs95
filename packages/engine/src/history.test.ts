import { describe, it, expect, beforeEach } from 'vitest';
import { createHistory } from './history.js';
import type { IsoDateTime } from '@word/domain';
import { makeDocument, makeParagraph, resetIdCounter } from './test-helpers.js';
import { asNodeId } from '@word/domain';
import type { Transaction } from './transaction.js';

let txnCounter = 0;
function makeTxn(label: string, coalesceKey?: string, tsMs = 1000000000000): Transaction {
  const id = asNodeId(`txn-${++txnCounter}`);
  const base = {
    id,
    label,
    timestamp: new Date(tsMs).toISOString() as IsoDateTime,
    atomic: true,
    ops: { ops: [] },
    inverse: { ops: [] },
  } satisfies Omit<Transaction, 'coalesceKey'>;
  return coalesceKey !== undefined ? { ...base, coalesceKey } : base;
}

beforeEach(() => {
  resetIdCounter();
  txnCounter = 0;
});

describe('createHistory – basic push/undo/redo', () => {
  it('starts empty', () => {
    const h = createHistory();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.length).toBe(0);
  });

  it('push makes canUndo true', () => {
    const h = createHistory();
    const doc = makeDocument();
    h.push(makeTxn('t1'), doc);
    expect(h.canUndo).toBe(true);
    expect(h.length).toBe(1);
  });

  it('undo returns the prior document', () => {
    const h = createHistory();
    const doc1 = makeDocument([makeParagraph('before')]);
    const doc2 = makeDocument([makeParagraph('after')]);
    // Use _pushWithBefore so docBefore is explicit
    h._pushWithBefore(makeTxn('t1'), doc2, doc1);
    const result = h.undo();
    expect(result).toBeDefined();
    expect(result?.doc).toBe(doc1);
  });

  it('undo populates redo stack', () => {
    const h = createHistory();
    const doc1 = makeDocument();
    const doc2 = makeDocument();
    h._pushWithBefore(makeTxn('t1'), doc2, doc1);
    h.undo();
    expect(h.canRedo).toBe(true);
  });

  it('redo restores document after undo', () => {
    const h = createHistory();
    const doc1 = makeDocument([makeParagraph('before')]);
    const doc2 = makeDocument([makeParagraph('after')]);
    h._pushWithBefore(makeTxn('t1'), doc2, doc1);
    h.undo();
    const redoResult = h.redo();
    expect(redoResult?.doc).toBe(doc2);
  });

  it('new push clears redo stack', () => {
    const h = createHistory();
    const d1 = makeDocument();
    const d2 = makeDocument();
    const d3 = makeDocument();
    h._pushWithBefore(makeTxn('t1'), d2, d1);
    h.undo();
    expect(h.canRedo).toBe(true);
    h._pushWithBefore(makeTxn('t2'), d3, d1);
    expect(h.canRedo).toBe(false);
  });

  it('respects the limit', () => {
    const h = createHistory({ limit: 3 });
    for (let i = 0; i < 5; i++) {
      h.push(makeTxn(`t${i}`), makeDocument());
    }
    expect(h.length).toBe(3);
  });

  it('clear empties both stacks', () => {
    const h = createHistory();
    h.push(makeTxn('t1'), makeDocument());
    h.clear();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });

  it('undo on empty returns undefined', () => {
    const h = createHistory();
    expect(h.undo()).toBeUndefined();
  });

  it('redo on empty returns undefined', () => {
    const h = createHistory();
    expect(h.redo()).toBeUndefined();
  });
});

describe('createHistory – coalescing', () => {
  it('merges transactions with same coalesceKey within 1000ms', () => {
    const h = createHistory();
    const d0 = makeDocument();
    const d1 = makeDocument();
    const d2 = makeDocument();
    const ts = 1000000000000;
    h._pushWithBefore(makeTxn('t1', 'typing', ts), d1, d0);
    h._pushWithBefore(makeTxn('t2', 'typing', ts + 500), d2, d1);
    expect(h.length).toBe(1); // merged
  });

  it('does not merge when over 1000ms apart', () => {
    const h = createHistory();
    const d0 = makeDocument();
    const d1 = makeDocument();
    const d2 = makeDocument();
    const ts = 1000000000000;
    h._pushWithBefore(makeTxn('t1', 'typing', ts), d1, d0);
    h._pushWithBefore(makeTxn('t2', 'typing', ts + 1001), d2, d1);
    expect(h.length).toBe(2); // not merged
  });

  it('does not merge different coalesceKeys', () => {
    const h = createHistory();
    const d0 = makeDocument();
    const d1 = makeDocument();
    const d2 = makeDocument();
    const ts = 1000000000000;
    h._pushWithBefore(makeTxn('t1', 'typing', ts), d1, d0);
    h._pushWithBefore(makeTxn('t2', 'format', ts + 100), d2, d1);
    expect(h.length).toBe(2);
  });

  it('does not merge when coalesceKey is undefined', () => {
    const h = createHistory();
    const d0 = makeDocument();
    const d1 = makeDocument();
    const d2 = makeDocument();
    const ts = 1000000000000;
    h._pushWithBefore(makeTxn('t1', undefined, ts), d1, d0);
    h._pushWithBefore(makeTxn('t2', undefined, ts + 100), d2, d1);
    expect(h.length).toBe(2);
  });
});
