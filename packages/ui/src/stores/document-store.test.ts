import { describe, it, expect, beforeEach } from 'vitest';
import { useDocumentStore } from './document-store.js';
import type { Document, NodeId, PropsId, PropsRegistry } from '@word/domain';
import type { SelectionSet, Transaction } from '@word/engine';

const makePropsRegistry = (): PropsRegistry => ({
  run: new Map(),
  para: new Map(),
  section: new Map(),
  table: new Map(),
  row: new Map(),
  cell: new Map(),
});

// Minimal document stub
const makeDoc = (id = 'doc1'): Document => ({
  id: id as NodeId,
  version: 1,
  sections: [],
  footnotes: new Map(),
  endnotes: new Map(),
  comments: new Map(),
  bookmarks: new Map(),
  hyperlinks: new Map(),
  drawings: new Map(),
  images: new Map(),
  fields: new Map(),
  styles: {
    styles: new Map(),
    defaultParagraphStyleId: 'Normal',
    defaultCharacterStyleId: 'DefaultParagraphFont',
  },
  numbering: { nums: new Map(), abstracts: new Map() },
  fonts: { faces: new Map() },
  props: makePropsRegistry(),
  defaults: {
    runPropsId: 'r0' as PropsId,
    paraPropsId: 'p0' as PropsId,
  },
  meta: {},
});

const makeSel = (): SelectionSet => ({
  primary: {
    anchor: { leafId: 'p1' as NodeId, offset: 0 },
    focus: { leafId: 'p1' as NodeId, offset: 5 },
  },
  additional: [],
});

beforeEach(() => {
  useDocumentStore.getState().reset();
});

describe('DocumentStore', () => {
  it('starts with null doc', () => {
    expect(useDocumentStore.getState().doc).toBeNull();
  });

  it('replaceDocument stores the doc and clears dirty', () => {
    const doc = makeDoc();
    useDocumentStore.getState().replaceDocument(doc, '/path/to/file.docx');
    const state = useDocumentStore.getState();
    expect(state.doc).toBe(doc);
    expect(state.filePath).toBe('/path/to/file.docx');
    expect(state.dirty).toBe(false);
  });

  it('replaceDocument without path sets filePath to null', () => {
    const doc = makeDoc();
    useDocumentStore.getState().replaceDocument(doc);
    expect(useDocumentStore.getState().filePath).toBeNull();
  });

  it('applyTransaction sets dirty and updates doc', () => {
    const doc = makeDoc();
    useDocumentStore.getState().replaceDocument(doc);
    expect(useDocumentStore.getState().dirty).toBe(false);

    const doc2 = makeDoc('doc2');
    const txn = {} as Transaction;
    useDocumentStore.getState().applyTransaction(txn, doc2);
    const state = useDocumentStore.getState();
    expect(state.dirty).toBe(true);
    expect(state.doc).toBe(doc2);
  });

  it('markDirty toggles dirty flag', () => {
    useDocumentStore.getState().markDirty(true);
    expect(useDocumentStore.getState().dirty).toBe(true);
    useDocumentStore.getState().markDirty(false);
    expect(useDocumentStore.getState().dirty).toBe(false);
  });

  it('setSelection updates selection', () => {
    const sel = makeSel();
    useDocumentStore.getState().setSelection(sel);
    expect(useDocumentStore.getState().selection).toBe(sel);
  });

  it('reset restores initial state', () => {
    useDocumentStore.getState().replaceDocument(makeDoc(), '/path.docx');
    useDocumentStore.getState().markDirty(true);
    useDocumentStore.getState().reset();
    const state = useDocumentStore.getState();
    expect(state.doc).toBeNull();
    expect(state.dirty).toBe(false);
    expect(state.filePath).toBeNull();
  });
});
