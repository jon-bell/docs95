import { describe, it, expect } from 'vitest';
import { validateDocument } from './schema.js';
import { createEmptyDocument, createMutablePropsRegistry } from './document-factory.js';
import { createIdGen } from './id-gen.js';
import type { Document } from './document.js';
import type { Paragraph, Section } from './block.js';
import { asNodeId } from './node.js';
import { asPropsId } from './props.js';
import type { IsoDateTime } from './node.js';
import type { Run } from './inline.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIdGen(): ReturnType<typeof createIdGen> {
  return createIdGen();
}

function freshDoc(): Document {
  return createEmptyDocument(makeIdGen());
}

/** Replace a top-level field on the document (immutable update). */
function withDoc<K extends keyof Document>(doc: Document, key: K, value: Document[K]): Document {
  return { ...doc, [key]: value };
}

// ---------------------------------------------------------------------------
// Basic: valid document passes
// ---------------------------------------------------------------------------

describe('validateDocument — valid document', () => {
  it('accepts the empty document from createEmptyDocument', () => {
    const doc = freshDoc();
    const result = validateDocument(doc);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// empty-section
// ---------------------------------------------------------------------------

describe('validateDocument — empty-section', () => {
  it('reports empty-section when a section has no blocks', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    // Replace the section's children with an empty array.
    const section = doc.sections[0]!;
    const emptySection: Section = { ...section, children: [] };
    const badDoc = withDoc(doc, 'sections', [emptySection]);
    const result = validateDocument(badDoc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'empty-section')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// duplicate-node-id
// ---------------------------------------------------------------------------

describe('validateDocument — duplicate-node-id', () => {
  it('reports duplicate when two paragraphs share an id', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const section = doc.sections[0]!;
    const para = section.children[0]! as Paragraph;
    // Duplicate: add a second paragraph with the same id.
    const dup: Paragraph = { ...para }; // same id
    const newSection: Section = { ...section, children: [para, dup] };
    const badDoc = withDoc(doc, 'sections', [newSection]);
    const result = validateDocument(badDoc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'duplicate-node-id')).toBe(true);
  });

  it('reports duplicate when a paragraph id collides with the section id', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const section = doc.sections[0]!;
    // Give the only paragraph the same id as the section.
    const para = section.children[0]! as Paragraph;
    const clashPara: Paragraph = { ...para, id: section.id };
    const newSection: Section = { ...section, children: [clashPara] };
    const badDoc = withDoc(doc, 'sections', [newSection]);
    const result = validateDocument(badDoc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'duplicate-node-id')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// bad-props-id
// ---------------------------------------------------------------------------

describe('validateDocument — bad-props-id', () => {
  it('reports bad-props-id when defaults.runPropsId is unknown', () => {
    const doc = freshDoc();
    const badDoc = withDoc(doc, 'defaults', {
      ...doc.defaults,
      runPropsId: asPropsId('nonexistent'),
    });
    const result = validateDocument(badDoc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'bad-props-id')).toBe(true);
  });

  it('reports bad-props-id when a paragraph paraPropsId is unknown', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const section = doc.sections[0]!;
    const para = section.children[0]! as Paragraph;
    const badPara: Paragraph = {
      ...para,
      attrs: { paraPropsId: asPropsId('no-such-props') },
    };
    const newSection: Section = { ...section, children: [badPara] };
    const badDoc = withDoc(doc, 'sections', [newSection]);
    const result = validateDocument(badDoc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'bad-props-id')).toBe(true);
  });

  it('reports bad-props-id for sectionPropsId', () => {
    const doc = freshDoc();
    const section = doc.sections[0]!;
    const badSection: Section = {
      ...section,
      attrs: { sectionPropsId: asPropsId('ghost') },
    };
    const badDoc = withDoc(doc, 'sections', [badSection]);
    const result = validateDocument(badDoc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'bad-props-id')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// orphan-ref — inline markers pointing to non-existent side-store entries
// ---------------------------------------------------------------------------

describe('validateDocument — orphan-ref', () => {
  it('reports orphan-ref when a CommentMarker references a missing comment', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const section = doc.sections[0]!;
    const para = section.children[0]! as Paragraph;

    const orphanId = asNodeId('orphan-comment-id-xxx');
    const startMarker = {
      id: idGen.newId(),
      type: 'commentMarker' as const,
      attrs: { commentId: orphanId, side: 'start' as const },
    };
    const endMarker = {
      id: idGen.newId(),
      type: 'commentMarker' as const,
      attrs: { commentId: orphanId, side: 'end' as const },
    };
    const badPara: Paragraph = { ...para, children: [startMarker, endMarker] };
    const newSection: Section = { ...section, children: [badPara] };
    const badDoc = withDoc(doc, 'sections', [newSection]);
    const result = validateDocument(badDoc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'orphan-ref')).toBe(true);
  });

  it('reports orphan-ref when a BookmarkMarker references a missing bookmark', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const section = doc.sections[0]!;
    const para = section.children[0]! as Paragraph;

    const bkId = asNodeId('no-such-bookmark-xxx12');
    const startMarker = {
      id: idGen.newId(),
      type: 'bookmarkMarker' as const,
      attrs: { bookmarkId: bkId, side: 'start' as const },
    };
    const endMarker = {
      id: idGen.newId(),
      type: 'bookmarkMarker' as const,
      attrs: { bookmarkId: bkId, side: 'end' as const },
    };
    const badPara: Paragraph = { ...para, children: [startMarker, endMarker] };
    const newSection: Section = { ...section, children: [badPara] };
    const badDoc = withDoc(doc, 'sections', [newSection]);
    const result = validateDocument(badDoc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'orphan-ref')).toBe(true);
  });

  it('reports orphan-ref when a FootnoteMarker references a missing footnote', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const section = doc.sections[0]!;
    const para = section.children[0]! as Paragraph;

    const fnId = asNodeId('no-such-footnote-xxx1');
    const marker = {
      id: idGen.newId(),
      type: 'footnoteMarker' as const,
      attrs: { footnoteId: fnId },
    };
    const badPara: Paragraph = { ...para, children: [marker] };
    const newSection: Section = { ...section, children: [badPara] };
    const badDoc = withDoc(doc, 'sections', [newSection]);
    const result = validateDocument(badDoc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'orphan-ref')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// marker-mismatched
// ---------------------------------------------------------------------------

describe('validateDocument — marker-mismatched', () => {
  it('reports marker-mismatched when a comment start has no end', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const section = doc.sections[0]!;
    const para = section.children[0]! as Paragraph;

    // Add a comment to the side store so it resolves.
    const commentId = idGen.newId();
    const comments = new Map(doc.comments);
    comments.set(commentId, {
      id: commentId,
      type: 'comment',
      attrs: {
        author: 'Test',
        date: '2026-04-18T00:00:00Z' as IsoDateTime,
      },
      children: [],
    });

    const startOnly = {
      id: idGen.newId(),
      type: 'commentMarker' as const,
      attrs: { commentId, side: 'start' as const },
    };
    const badPara: Paragraph = { ...para, children: [startOnly] };
    const newSection: Section = { ...section, children: [badPara] };
    const badDoc = withDoc(withDoc(doc, 'sections', [newSection]), 'comments', comments);
    const result = validateDocument(badDoc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'marker-mismatched')).toBe(true);
  });

  it('passes when comment markers are balanced', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const section = doc.sections[0]!;
    const para = section.children[0]! as Paragraph;

    const commentId = idGen.newId();
    const comments = new Map(doc.comments);
    comments.set(commentId, {
      id: commentId,
      type: 'comment',
      attrs: {
        author: 'Test',
        date: '2026-04-18T00:00:00Z' as IsoDateTime,
      },
      children: [],
    });

    const start = {
      id: idGen.newId(),
      type: 'commentMarker' as const,
      attrs: { commentId, side: 'start' as const },
    };
    const end = {
      id: idGen.newId(),
      type: 'commentMarker' as const,
      attrs: { commentId, side: 'end' as const },
    };
    const goodPara: Paragraph = { ...para, children: [start, end] };
    const newSection: Section = { ...section, children: [goodPara] };
    const goodDoc = withDoc(withDoc(doc, 'sections', [newSection]), 'comments', comments);
    const result = validateDocument(goodDoc);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// bad-run-text — lone surrogates
// ---------------------------------------------------------------------------

describe('validateDocument — bad-run-text', () => {
  it('reports bad-run-text for a lone high surrogate', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const section = doc.sections[0]!;
    const para = section.children[0]! as Paragraph;

    const run = {
      id: idGen.newId(),
      type: 'run' as const,
      // Lone high surrogate (no following low surrogate).
      text: '\uD83D',
      attrs: { runPropsId: doc.defaults.runPropsId },
    };
    const badPara: Paragraph = { ...para, children: [run] };
    const newSection: Section = { ...section, children: [badPara] };
    const badDoc = withDoc(doc, 'sections', [newSection]);
    const result = validateDocument(badDoc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'bad-run-text')).toBe(true);
  });

  it('accepts a valid surrogate pair', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const section = doc.sections[0]!;
    const para = section.children[0]! as Paragraph;

    const run = {
      id: idGen.newId(),
      type: 'run' as const,
      // Valid pair: U+1F600
      text: '\uD83D\uDE00',
      attrs: { runPropsId: doc.defaults.runPropsId },
    };
    const goodPara: Paragraph = { ...para, children: [run] };
    const newSection: Section = { ...section, children: [goodPara] };
    const goodDoc = withDoc(doc, 'sections', [newSection]);
    const result = validateDocument(goodDoc);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// orphan-ref — DrawingRun and EndnoteMarker
// ---------------------------------------------------------------------------

describe('validateDocument — orphan-ref for DrawingRun and EndnoteMarker', () => {
  it('reports orphan-ref for a DrawingRun with unknown drawingId', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const section = doc.sections[0]!;
    const para = section.children[0]! as Paragraph;

    const drawingRun = {
      id: idGen.newId(),
      type: 'drawingRun' as const,
      attrs: {
        drawingId: asNodeId('no-such-drawing-xxxxx'),
        anchorKind: 'inline' as const,
      },
    };
    const badPara: Paragraph = { ...para, children: [drawingRun] };
    const newSection: Section = { ...section, children: [badPara] };
    const badDoc = withDoc(doc, 'sections', [newSection]);
    const result = validateDocument(badDoc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'orphan-ref')).toBe(true);
  });

  it('reports orphan-ref for an EndnoteMarker with unknown endnoteId', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const section = doc.sections[0]!;
    const para = section.children[0]! as Paragraph;

    const endnoteMarker = {
      id: idGen.newId(),
      type: 'endnoteMarker' as const,
      attrs: { endnoteId: asNodeId('no-such-endnote-xxxx') },
    };
    const badPara: Paragraph = { ...para, children: [endnoteMarker] };
    const newSection: Section = { ...section, children: [badPara] };
    const badDoc = withDoc(doc, 'sections', [newSection]);
    const result = validateDocument(badDoc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'orphan-ref')).toBe(true);
  });

  it('reports orphan-ref when a Drawing imageId is unknown', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const drawingId = idGen.newId();
    const drawings = new Map(doc.drawings);
    drawings.set(drawingId, {
      id: drawingId,
      type: 'drawing',
      kind: 'picture',
      extentEMU: { cx: 100, cy: 100 },
      attrs: {},
      imageId: asNodeId('ghost-image-id-xxxxxx'),
    });
    const badDoc = withDoc(doc, 'drawings', drawings);
    const result = validateDocument(badDoc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'orphan-ref')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// orphan-ref — FieldRun and HyperlinkRun
// ---------------------------------------------------------------------------

describe('validateDocument — orphan-ref for FieldRun and HyperlinkRun', () => {
  it('reports orphan-ref for a FieldRun with unknown fieldId', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const section = doc.sections[0]!;
    const para = section.children[0]! as Paragraph;

    const fieldRun = {
      id: idGen.newId(),
      type: 'fieldRun' as const,
      attrs: { fieldId: asNodeId('no-such-field-xxxxxx'), locked: false, dirty: false },
      children: [] as Run[],
    };
    const badPara: Paragraph = { ...para, children: [fieldRun] };
    const newSection: Section = { ...section, children: [badPara] };
    const badDoc = withDoc(doc, 'sections', [newSection]);
    const result = validateDocument(badDoc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'orphan-ref')).toBe(true);
  });

  it('reports orphan-ref for a HyperlinkRun with unknown hyperlinkId', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const section = doc.sections[0]!;
    const para = section.children[0]! as Paragraph;

    const hyperlinkRun = {
      id: idGen.newId(),
      type: 'hyperlinkRun' as const,
      attrs: { hyperlinkId: asNodeId('no-such-hyperlink-xx') },
      children: [],
    };
    const badPara: Paragraph = { ...para, children: [hyperlinkRun] };
    const newSection: Section = { ...section, children: [badPara] };
    const badDoc = withDoc(doc, 'sections', [newSection]);
    const result = validateDocument(badDoc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'orphan-ref')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// duplicate-node-id in side stores
// ---------------------------------------------------------------------------

describe('validateDocument — duplicate-node-id in side stores', () => {
  it('reports duplicate when a bookmark id matches the document id', () => {
    const idGen = makeIdGen();
    const doc = createEmptyDocument(idGen);
    const bookmarks = new Map(doc.bookmarks);
    // Use the document's own id as a bookmark id — guaranteed clash.
    bookmarks.set(doc.id, { id: doc.id, type: 'bookmark', attrs: { name: 'clash' } });
    const badDoc = withDoc(doc, 'bookmarks', bookmarks);
    const result = validateDocument(badDoc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'duplicate-node-id')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PropsRegistry interning
// ---------------------------------------------------------------------------

describe('createMutablePropsRegistry', () => {
  it('interns identical RunProps to the same id', () => {
    const reg = createMutablePropsRegistry();
    const id1 = reg.internRun({ bold: true });
    const id2 = reg.internRun({ bold: true });
    expect(id1).toBe(id2);
  });

  it('assigns different ids for different RunProps', () => {
    const reg = createMutablePropsRegistry();
    const id1 = reg.internRun({ bold: true });
    const id2 = reg.internRun({ italic: true });
    expect(id1).not.toBe(id2);
  });

  it('is stable across key-insertion order', () => {
    const reg = createMutablePropsRegistry();
    const id1 = reg.internRun({ bold: true, italic: false });
    const id2 = reg.internRun({ italic: false, bold: true });
    expect(id1).toBe(id2);
  });

  it('freeze returns a PropsRegistry containing interned entries', () => {
    const reg = createMutablePropsRegistry();
    const id = reg.internRun({ bold: true });
    const frozen = reg.freeze();
    expect(frozen.run.has(id)).toBe(true);
    expect(frozen.run.get(id)).toEqual({ bold: true });
  });
});
