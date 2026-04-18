import type { Document } from '@word/domain';
import type { Transaction } from './transaction.js';

export interface History {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly length: number;
  push(txn: Transaction, newDoc: Document): void;
  undo(): { readonly doc: Document; readonly txn: Transaction } | undefined;
  redo(): { readonly doc: Document; readonly txn: Transaction } | undefined;
  clear(): void;
}

interface HistoryEntry {
  readonly txn: Transaction;
  /** Document state AFTER txn was applied — used to restore on redo. */
  readonly docAfter: Document;
  /** Document state BEFORE txn was applied — used to restore on undo. */
  readonly docBefore: Document;
}

export interface HistoryOptions {
  readonly limit?: number;
}

/**
 * Creates a History instance with coalescing support.
 *
 * Coalescing rule: if the incoming transaction shares the same `coalesceKey`
 * as the top undo entry AND the timestamps are within 1000ms of each other,
 * the ops (and inverse ops) are merged into the top entry rather than pushing
 * a new one. This produces the Word-style "all typing since last pause is one
 * undo step" behavior.
 *
 * Redo stack is cleared whenever a new (non-coalesced) entry is pushed.
 *
 * History.push receives (txn, docAfter). To track docBefore, the implementation
 * remembers the last-pushed docAfter as the next push's docBefore. The caller
 * (createEditorInstance) must therefore push in document order.
 */
export function createHistory(options: HistoryOptions = {}): History & {
  _pushWithBefore(txn: Transaction, docAfter: Document, docBefore: Document): void;
} {
  const limit = options.limit ?? 100;

  // undoStack[0] is the most recent entry
  let undoStack: HistoryEntry[] = [];
  let redoStack: HistoryEntry[] = [];
  // Track the last known doc so that plain push() can derive docBefore
  let lastKnownDoc: Document | undefined;

  function tsMs(iso: string): number {
    return new Date(iso).getTime();
  }

  function canCoalesce(top: HistoryEntry, incoming: Transaction): boolean {
    if (top.txn.coalesceKey === undefined || incoming.coalesceKey === undefined) {
      return false;
    }
    if (top.txn.coalesceKey !== incoming.coalesceKey) return false;
    const delta = Math.abs(tsMs(incoming.timestamp as string) - tsMs(top.txn.timestamp as string));
    return delta < 1000;
  }

  function mergeIntoTop(
    top: HistoryEntry,
    incoming: Transaction,
    docAfter: Document,
  ): HistoryEntry {
    // Merged transaction: forward ops are top then incoming;
    // inverse ops are incoming's inverse then top's (reversed accumulation for correct undo)
    const mergedTxn: Transaction = {
      ...top.txn,
      timestamp: incoming.timestamp,
      ops: { ops: [...top.txn.ops.ops, ...incoming.ops.ops] },
      inverse: { ops: [...incoming.inverse.ops, ...top.txn.inverse.ops] },
    };
    return {
      txn: mergedTxn,
      docAfter,
      docBefore: top.docBefore,
    };
  }

  function pushEntry(entry: HistoryEntry): void {
    redoStack = [];
    undoStack.unshift(entry);
    if (undoStack.length > limit) {
      undoStack.length = limit;
    }
  }

  const hist = {
    get canUndo(): boolean {
      return undoStack.length > 0;
    },
    get canRedo(): boolean {
      return redoStack.length > 0;
    },
    get length(): number {
      return undoStack.length;
    },

    /**
     * Standard push: docBefore is derived from the last known state.
     * This works correctly as long as the caller calls push() in order.
     */
    push(txn: Transaction, newDoc: Document): void {
      const docBefore = lastKnownDoc ?? newDoc;
      lastKnownDoc = newDoc;

      const top = undoStack[0];
      if (top !== undefined && canCoalesce(top, txn)) {
        undoStack[0] = mergeIntoTop(top, txn, newDoc);
        return;
      }

      pushEntry({ txn, docAfter: newDoc, docBefore });
    },

    /**
     * Extended push that explicitly provides docBefore.
     * Used by createEditorInstance which tracks docBefore precisely.
     */
    _pushWithBefore(txn: Transaction, docAfter: Document, docBefore: Document): void {
      lastKnownDoc = docAfter;

      const top = undoStack[0];
      if (top !== undefined && canCoalesce(top, txn)) {
        undoStack[0] = mergeIntoTop(top, txn, docAfter);
        return;
      }

      pushEntry({ txn, docAfter, docBefore });
    },

    undo(): { readonly doc: Document; readonly txn: Transaction } | undefined {
      const entry = undoStack.shift();
      if (entry === undefined) return undefined;
      redoStack.unshift(entry);
      lastKnownDoc = entry.docBefore;
      return { doc: entry.docBefore, txn: entry.txn };
    },

    redo(): { readonly doc: Document; readonly txn: Transaction } | undefined {
      const entry = redoStack.shift();
      if (entry === undefined) return undefined;
      undoStack.unshift(entry);
      lastKnownDoc = entry.docAfter;
      return { doc: entry.docAfter, txn: entry.txn };
    },

    clear(): void {
      undoStack = [];
      redoStack = [];
      lastKnownDoc = undefined;
    },
  };

  return hist;
}
