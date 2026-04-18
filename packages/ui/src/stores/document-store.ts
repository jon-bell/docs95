import { create } from 'zustand';
import type { Document, NodeId } from '@word/domain';
import type { SelectionSet } from '@word/engine';
import type { Transaction } from '@word/engine';

export interface DocumentState {
  readonly doc: Document | null;
  readonly selection: SelectionSet;
  readonly dirty: boolean;
  readonly filePath: string | null;
}

export interface DocumentActions {
  applyTransaction(txn: Transaction, newDoc: Document): void;
  replaceDocument(doc: Document, path?: string): void;
  markDirty(b: boolean): void;
  setSelection(sel: SelectionSet): void;
  reset(): void;
}

export type DocumentStore = DocumentState & DocumentActions;

const EMPTY_SELECTION: SelectionSet = {
  primary: {
    anchor: { leafId: '' as NodeId, offset: 0 },
    focus: { leafId: '' as NodeId, offset: 0 },
  },
  additional: [],
};

export const useDocumentStore = create<DocumentStore>((set) => ({
  doc: null,
  selection: EMPTY_SELECTION,
  dirty: false,
  filePath: null,

  applyTransaction(_txn: Transaction, newDoc: Document): void {
    set({ doc: newDoc, dirty: true });
  },

  replaceDocument(doc: Document, path?: string): void {
    set({ doc, dirty: false, filePath: path ?? null });
  },

  markDirty(b: boolean): void {
    set({ dirty: b });
  },

  setSelection(sel: SelectionSet): void {
    set({ selection: sel });
  },

  reset(): void {
    set({ doc: null, selection: EMPTY_SELECTION, dirty: false, filePath: null });
  },
}));
