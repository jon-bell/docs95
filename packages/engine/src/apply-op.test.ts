import { describe, it, expect, beforeEach } from 'vitest';
import { applyOp, UnsupportedOpError } from './apply-op.js';
import {
  makeDocument,
  makeParagraph,
  makeRun,
  makeId,
  makeTestIdGen,
  firstParaText,
  nthParaText,
  testPropsId,
  resetIdCounter,
} from './test-helpers.js';
import type { ApplyOpContext } from './apply-op.js';
import { asNodeId } from '@word/domain';

let ctx: ApplyOpContext;

beforeEach(() => {
  resetIdCounter();
  ctx = { idGen: makeTestIdGen() };
});

describe('applyOp – insertText', () => {
  it('inserts text at the beginning of a paragraph', () => {
    const para = makeParagraph('world');
    const doc = makeDocument([para]);
    const result = applyOp(
      doc,
      {
        kind: 'insertText',
        at: { leafId: para.id, offset: 0 },
        text: 'hello ',
        runPropsId: undefined,
      },
      ctx,
    );
    expect(firstParaText(result.doc)).toBe('hello world');
    expect(result.doc.version).toBe(1);
  });

  it('inserts text at the end of a paragraph', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const result = applyOp(
      doc,
      {
        kind: 'insertText',
        at: { leafId: para.id, offset: 5 },
        text: ' world',
        runPropsId: undefined,
      },
      ctx,
    );
    expect(firstParaText(result.doc)).toBe('hello world');
  });

  it('inserts text in the middle', () => {
    const para = makeParagraph('helo');
    const doc = makeDocument([para]);
    const result = applyOp(
      doc,
      {
        kind: 'insertText',
        at: { leafId: para.id, offset: 3 },
        text: 'l',
        runPropsId: undefined,
      },
      ctx,
    );
    expect(firstParaText(result.doc)).toBe('hello');
  });

  it('produces a correct inverse (deleteRange)', () => {
    const para = makeParagraph('world');
    const doc = makeDocument([para]);
    const result = applyOp(
      doc,
      {
        kind: 'insertText',
        at: { leafId: para.id, offset: 0 },
        text: 'hello ',
        runPropsId: undefined,
      },
      ctx,
    );
    expect(result.inverseOps).toHaveLength(1);
    expect(result.inverseOps[0]?.kind).toBe('deleteRange');
  });

  it('throws if paragraph not found', () => {
    const doc = makeDocument([makeParagraph('hello')]);
    expect(() =>
      applyOp(
        doc,
        {
          kind: 'insertText',
          at: { leafId: asNodeId('nonexistent'), offset: 0 },
          text: 'x',
          runPropsId: undefined,
        },
        ctx,
      ),
    ).toThrow();
  });
});

describe('applyOp – deleteRange', () => {
  it('deletes a range of text', () => {
    const para = makeParagraph('hello world');
    const doc = makeDocument([para]);
    const result = applyOp(
      doc,
      {
        kind: 'deleteRange',
        from: { leafId: para.id, offset: 5 },
        to: { leafId: para.id, offset: 11 },
      },
      ctx,
    );
    expect(firstParaText(result.doc)).toBe('hello');
  });

  it('returns no-op for zero-length range', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const result = applyOp(
      doc,
      {
        kind: 'deleteRange',
        from: { leafId: para.id, offset: 2 },
        to: { leafId: para.id, offset: 2 },
      },
      ctx,
    );
    expect(result.doc).toBe(doc); // same reference
  });

  it('handles reversed from/to', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const result = applyOp(
      doc,
      {
        kind: 'deleteRange',
        from: { leafId: para.id, offset: 5 },
        to: { leafId: para.id, offset: 0 },
      },
      ctx,
    );
    expect(firstParaText(result.doc)).toBe('');
  });

  it('produces a correct inverse (insertText)', () => {
    const para = makeParagraph('hello world');
    const doc = makeDocument([para]);
    const result = applyOp(
      doc,
      {
        kind: 'deleteRange',
        from: { leafId: para.id, offset: 0 },
        to: { leafId: para.id, offset: 5 },
      },
      ctx,
    );
    const inv = result.inverseOps[0];
    expect(inv?.kind).toBe('insertText');
    if (inv?.kind === 'insertText') {
      expect(inv.text).toBe('hello');
    }
  });
});

describe('applyOp – splitParagraph', () => {
  it('splits a paragraph at an offset', () => {
    const para = makeParagraph('hello world');
    const doc = makeDocument([para]);
    const newId = makeId('new-para');
    const result = applyOp(
      doc,
      {
        kind: 'splitParagraph',
        at: { leafId: para.id, offset: 5 },
        newId,
      },
      ctx,
    );
    expect(result.doc.sections[0]?.children).toHaveLength(2);
    expect(nthParaText(result.doc, 0)).toBe('hello');
    expect(nthParaText(result.doc, 1)).toBe(' world');
  });

  it('splits at the beginning', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const newId = makeId('new-para');
    const result = applyOp(
      doc,
      {
        kind: 'splitParagraph',
        at: { leafId: para.id, offset: 0 },
        newId,
      },
      ctx,
    );
    expect(nthParaText(result.doc, 0)).toBe('');
    expect(nthParaText(result.doc, 1)).toBe('hello');
  });

  it('splits at the end', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const newId = makeId('new-para');
    const result = applyOp(
      doc,
      {
        kind: 'splitParagraph',
        at: { leafId: para.id, offset: 5 },
        newId,
      },
      ctx,
    );
    expect(nthParaText(result.doc, 0)).toBe('hello');
    expect(nthParaText(result.doc, 1)).toBe('');
  });

  it('produces joinParagraphs as inverse', () => {
    const para = makeParagraph('hello world');
    const doc = makeDocument([para]);
    const newId = makeId('new-para');
    const result = applyOp(
      doc,
      {
        kind: 'splitParagraph',
        at: { leafId: para.id, offset: 5 },
        newId,
      },
      ctx,
    );
    expect(result.inverseOps[0]?.kind).toBe('joinParagraphs');
  });
});

describe('applyOp – joinParagraphs', () => {
  it('joins two adjacent paragraphs', () => {
    const p1 = makeParagraph('hello');
    const p2 = makeParagraph(' world');
    const doc = makeDocument([p1, p2]);
    const result = applyOp(
      doc,
      {
        kind: 'joinParagraphs',
        leftId: p1.id,
        rightId: p2.id,
      },
      ctx,
    );
    expect(result.doc.sections[0]?.children).toHaveLength(1);
    expect(firstParaText(result.doc)).toBe('hello world');
  });

  it('produces splitParagraph as inverse', () => {
    const p1 = makeParagraph('hello');
    const p2 = makeParagraph(' world');
    const doc = makeDocument([p1, p2]);
    const result = applyOp(
      doc,
      {
        kind: 'joinParagraphs',
        leftId: p1.id,
        rightId: p2.id,
      },
      ctx,
    );
    expect(result.inverseOps[0]?.kind).toBe('splitParagraph');
  });
});

describe('applyOp – insertBlock / removeBlock', () => {
  it('inserts a block at position', () => {
    const doc = makeDocument([makeParagraph('existing')]);
    const newPara = makeParagraph('new');
    const result = applyOp(
      doc,
      {
        kind: 'insertBlock',
        atSectionIndex: 0,
        atBlockIndex: 0,
        block: newPara,
      },
      ctx,
    );
    expect(result.doc.sections[0]?.children).toHaveLength(2);
    expect(nthParaText(result.doc, 0)).toBe('new');
    expect(nthParaText(result.doc, 1)).toBe('existing');
  });

  it('inserts block produces removeBlock inverse', () => {
    const doc = makeDocument([makeParagraph('existing')]);
    const newPara = makeParagraph('new');
    const result = applyOp(
      doc,
      {
        kind: 'insertBlock',
        atSectionIndex: 0,
        atBlockIndex: 0,
        block: newPara,
      },
      ctx,
    );
    expect(result.inverseOps[0]?.kind).toBe('removeBlock');
  });

  it('removes a block', () => {
    const p1 = makeParagraph('keep');
    const p2 = makeParagraph('delete me');
    const doc = makeDocument([p1, p2]);
    const result = applyOp(
      doc,
      {
        kind: 'removeBlock',
        atSectionIndex: 0,
        atBlockIndex: 1,
      },
      ctx,
    );
    expect(result.doc.sections[0]?.children).toHaveLength(1);
    expect(firstParaText(result.doc)).toBe('keep');
  });

  it('removeBlock produces insertBlock inverse', () => {
    const doc = makeDocument([makeParagraph('keep'), makeParagraph('delete me')]);
    const result = applyOp(
      doc,
      {
        kind: 'removeBlock',
        atSectionIndex: 0,
        atBlockIndex: 1,
      },
      ctx,
    );
    expect(result.inverseOps[0]?.kind).toBe('insertBlock');
  });
});

describe('applyOp – setParaProps', () => {
  it('updates paragraph props', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const result = applyOp(
      doc,
      {
        kind: 'setParaProps',
        paragraphId: para.id,
        props: { alignment: 'center' },
      },
      ctx,
    );
    // Props ID should have changed
    const newPara = result.doc.sections[0]?.children[0];
    expect(newPara?.type).toBe('paragraph');
    if (newPara?.type === 'paragraph') {
      expect(newPara.attrs.paraPropsId).not.toBe(testPropsId);
    }
  });

  it('setParaProps produces setParaProps inverse', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const result = applyOp(
      doc,
      {
        kind: 'setParaProps',
        paragraphId: para.id,
        props: { alignment: 'center' },
      },
      ctx,
    );
    expect(result.inverseOps[0]?.kind).toBe('setParaProps');
  });
});

describe('applyOp – insertInlineMarker / removeInlineMarker', () => {
  it('inserts a marker', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const marker = {
      id: makeId('marker'),
      type: 'break' as const,
      attrs: { kind: 'line' as const },
    };
    const result = applyOp(
      doc,
      {
        kind: 'insertInlineMarker',
        at: { leafId: para.id, offset: 5 },
        marker,
      },
      ctx,
    );
    const newPara = result.doc.sections[0]?.children[0];
    if (newPara?.type === 'paragraph') {
      const hasMarker = newPara.children.some((c) => c.id === marker.id);
      expect(hasMarker).toBe(true);
    }
  });

  it('removes a marker', () => {
    const markerId = makeId('marker');
    const marker = {
      id: markerId,
      type: 'break' as const,
      attrs: { kind: 'line' as const },
    };
    const para = {
      id: makeId('para'),
      type: 'paragraph' as const,
      attrs: { paraPropsId: testPropsId },
      children: [makeRun('hello'), marker],
    };
    const doc = makeDocument([para]);
    const result = applyOp(
      doc,
      {
        kind: 'removeInlineMarker',
        paragraphId: para.id,
        markerId,
      },
      ctx,
    );
    const newPara = result.doc.sections[0]?.children[0];
    if (newPara?.type === 'paragraph') {
      const hasMarker = newPara.children.some((c) => c.id === markerId);
      expect(hasMarker).toBe(false);
    }
  });
});

describe('applyOp – unsupported ops', () => {
  it('throws UnsupportedOpError for unknown op kind', () => {
    const doc = makeDocument();
    expect(() => applyOp(doc, { kind: 'nonExistentOp' } as never, ctx)).toThrow(UnsupportedOpError);
  });
});
