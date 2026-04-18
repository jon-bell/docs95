import { describe, it, expect } from 'vitest';
import {
  walkInlines,
  walkBlocks,
  allParagraphs,
  findParagraph,
  paragraphPathForId,
} from './tree.js';
import { createEmptyDocument, createMutablePropsRegistry } from './document-factory.js';
import { createIdGen } from './id-gen.js';
import { validateDocument } from './schema.js';
import type { Document } from './document.js';
import type { Paragraph, Section, Table, Row, Cell } from './block.js';
import { asNodeId } from './node.js';
import { asPropsId } from './props.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIdGen() {
  return createIdGen();
}

function freshDoc(): Document {
  return createEmptyDocument(makeIdGen());
}

function withDoc<K extends keyof Document>(doc: Document, key: K, value: Document[K]): Document {
  return { ...doc, [key]: value };
}

// Build a minimal table with a single cell containing one paragraph.
function makeTable(
  tableId: string,
  cellParaId: string,
  paraPropsId: string,
  tablePropsId: string,
  rowPropsId: string,
  cellPropsId: string,
): Table {
  const cellPara: Paragraph = {
    id: asNodeId(cellParaId),
    type: 'paragraph',
    attrs: { paraPropsId: asPropsId(paraPropsId) },
    children: [],
  };
  const cell: Cell = {
    id: asNodeId('cell-' + tableId),
    type: 'cell',
    attrs: { cellPropsId: asPropsId(cellPropsId) },
    children: [cellPara],
  };
  const row: Row = {
    id: asNodeId('row-' + tableId),
    type: 'row',
    attrs: { rowPropsId: asPropsId(rowPropsId) },
    children: [cell],
  };
  return {
    id: asNodeId(tableId),
    type: 'table',
    attrs: { tablePropsId: asPropsId(tablePropsId), tblGrid: [9000] },
    children: [row],
  };
}

// ---------------------------------------------------------------------------
// walkInlines
// ---------------------------------------------------------------------------

describe('walkInlines', () => {
  it('yields nothing for an empty paragraph', () => {
    const doc = freshDoc();
    const para = doc.sections[0]!.children[0]! as Paragraph;
    const inlines = [...walkInlines(para)];
    expect(inlines).toHaveLength(0);
  });

  it('yields runs in order', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const section = doc.sections[0]!;
    const para = section.children[0]! as Paragraph;

    const run1 = {
      id: idGen.newId(),
      type: 'run' as const,
      text: 'a',
      attrs: { runPropsId: doc.defaults.runPropsId },
    };
    const run2 = {
      id: idGen.newId(),
      type: 'run' as const,
      text: 'b',
      attrs: { runPropsId: doc.defaults.runPropsId },
    };
    const richPara: Paragraph = { ...para, children: [run1, run2] };
    const inlines = [...walkInlines(richPara)];
    expect(inlines).toHaveLength(2);
    expect(inlines[0]).toBe(run1);
    expect(inlines[1]).toBe(run2);
  });

  it('recurses into HyperlinkRun children', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const section = doc.sections[0]!;
    const para = section.children[0]! as Paragraph;

    const innerRun = {
      id: idGen.newId(),
      type: 'run' as const,
      text: 'link',
      attrs: { runPropsId: doc.defaults.runPropsId },
    };
    const hyperlinkId = idGen.newId();
    const hyperlink = {
      id: idGen.newId(),
      type: 'hyperlinkRun' as const,
      attrs: { hyperlinkId, anchor: undefined },
      children: [innerRun],
    };
    const richPara: Paragraph = { ...para, children: [hyperlink] };
    const inlines = [...walkInlines(richPara)];
    expect(inlines).toHaveLength(2);
    expect(inlines[0]).toBe(hyperlink);
    expect(inlines[1]).toBe(innerRun);
  });
});

// ---------------------------------------------------------------------------
// walkBlocks
// ---------------------------------------------------------------------------

describe('walkBlocks', () => {
  it('yields the paragraph in the empty document', () => {
    const doc = freshDoc();
    const blocks = [...walkBlocks(doc)];
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('paragraph');
  });

  it('descends into table cells', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const reg = createMutablePropsRegistry();
    void reg.internPara({});
    const tablePropsId = reg.internTable({});
    const rowPropsId = reg.internRow({});
    const cellPropsId = reg.internCell({});
    // Combine registries (simpler: just use the doc's existing props id for para).
    const existingParaPropsId = doc.defaults.paraPropsId;

    const table = makeTable(
      'tbl1',
      'para-in-cell',
      existingParaPropsId,
      tablePropsId,
      rowPropsId,
      cellPropsId,
    );
    const section = doc.sections[0]!;
    const newSection: Section = { ...section, children: [table] };
    const docWithTable = withDoc(withDoc(doc, 'sections', [newSection]), 'props', {
      ...doc.props,
      table: new Map([...doc.props.table, [tablePropsId, {}]]),
      row: new Map([...doc.props.row, [rowPropsId, {}]]),
      cell: new Map([...doc.props.cell, [cellPropsId, {}]]),
    });

    const blocks = [...walkBlocks(docWithTable)];
    // Should yield: the table itself + the paragraph inside the cell.
    expect(blocks.some((b) => b.type === 'table')).toBe(true);
    expect(blocks.some((b) => b.type === 'paragraph')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// allParagraphs
// ---------------------------------------------------------------------------

describe('allParagraphs', () => {
  it('returns the one paragraph in an empty document', () => {
    const doc = freshDoc();
    const paras = allParagraphs(doc);
    expect(paras).toHaveLength(1);
    expect(paras[0]!.type).toBe('paragraph');
  });

  it('returns paragraphs from multiple sections in order', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const section1 = doc.sections[0]!;

    // secPropsId intentionally unused — we re-use doc defaults below.

    const para2: Paragraph = {
      id: idGen.newId(),
      type: 'paragraph',
      attrs: { paraPropsId: doc.defaults.paraPropsId },
      children: [],
    };
    const section2: Section = {
      id: idGen.newId(),
      type: 'section',
      attrs: { sectionPropsId: doc.defaults.paraPropsId }, // re-using an existing propsId
      children: [para2],
    };

    const twoSectionDoc = withDoc(doc, 'sections', [section1, section2]);
    const paras = allParagraphs(twoSectionDoc);
    expect(paras).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// findParagraph
// ---------------------------------------------------------------------------

describe('findParagraph', () => {
  it('finds an existing paragraph by id', () => {
    const doc = freshDoc();
    const para = doc.sections[0]!.children[0]! as Paragraph;
    const found = findParagraph(doc, para.id);
    expect(found).toBe(para);
  });

  it('returns undefined for an unknown id', () => {
    const doc = freshDoc();
    const found = findParagraph(doc, asNodeId('nonexistent-id-xxxxxxx'));
    expect(found).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// paragraphPathForId
// ---------------------------------------------------------------------------

describe('paragraphPathForId', () => {
  it('finds the path to the first paragraph', () => {
    const doc = freshDoc();
    const para = doc.sections[0]!.children[0]! as Paragraph;
    const path = paragraphPathForId(doc, para.id);
    expect(path).toBeDefined();
    expect(path!.sectionIdx).toBe(0);
    expect(path!.blockPath).toEqual([0]);
  });

  it('returns undefined for an unknown id', () => {
    const doc = freshDoc();
    const path = paragraphPathForId(doc, asNodeId('no-such-para-xxxxxx'));
    expect(path).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// id-gen
// ---------------------------------------------------------------------------

describe('createIdGen', () => {
  it('generates ids of length 21', () => {
    const idGen = makeIdGen();
    for (let i = 0; i < 20; i++) {
      expect(idGen.newId().length).toBe(21);
    }
  });

  it('generates unique ids', () => {
    const idGen = makeIdGen();
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(idGen.newId());
    }
    expect(ids.size).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// createEmptyDocument
// ---------------------------------------------------------------------------

describe('createEmptyDocument', () => {
  it('produces a valid document structure', () => {
    const doc = freshDoc();
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0]!.children).toHaveLength(1);
    expect(doc.sections[0]!.children[0]!.type).toBe('paragraph');
  });

  it('defaults.runPropsId resolves in props.run', () => {
    const doc = freshDoc();
    expect(doc.props.run.has(doc.defaults.runPropsId)).toBe(true);
  });

  it('defaults.paraPropsId resolves in props.para', () => {
    const doc = freshDoc();
    expect(doc.props.para.has(doc.defaults.paraPropsId)).toBe(true);
  });

  it('section sectionPropsId resolves in props.section', () => {
    const doc = freshDoc();
    expect(doc.props.section.has(doc.sections[0]!.attrs.sectionPropsId)).toBe(true);
  });

  it('passes validateDocument', () => {
    const doc = freshDoc();
    expect(validateDocument(doc).ok).toBe(true);
  });
});
