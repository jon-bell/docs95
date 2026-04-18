import { describe, it, expect, beforeEach } from 'vitest';
import { applyPatch } from './patch.js';
import {
  makeDocument,
  makeParagraph,
  firstParaText,
  nthParaText,
  makeId,
  makeTestIdGen,
  resetIdCounter,
} from './test-helpers.js';

beforeEach(() => {
  resetIdCounter();
});

describe('applyPatch', () => {
  it('applies multiple ops in sequence', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const newId = makeId('new');
    const ctx = { idGen: makeTestIdGen() };

    const result = applyPatch(
      doc,
      {
        ops: [
          {
            kind: 'insertText',
            at: { leafId: para.id, offset: 5 },
            text: ' world',
            runPropsId: undefined,
          },
          {
            kind: 'splitParagraph',
            at: { leafId: para.id, offset: 5 },
            newId,
          },
        ],
      },
      ctx,
    );

    expect(nthParaText(result.doc, 0)).toBe('hello');
    expect(nthParaText(result.doc, 1)).toBe(' world');
  });

  it('returns an empty inverse for empty patch', () => {
    const doc = makeDocument();
    const result = applyPatch(doc, { ops: [] });
    expect(result.doc).toBe(doc);
    expect(result.inverse.ops).toHaveLength(0);
  });

  it('inverse ops are reversed sequence of per-op inverses', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);

    const result = applyPatch(doc, {
      ops: [
        {
          kind: 'insertText',
          at: { leafId: para.id, offset: 5 },
          text: ' world',
          runPropsId: undefined,
        },
        {
          kind: 'insertText',
          at: { leafId: para.id, offset: 11 },
          text: '!',
          runPropsId: undefined,
        },
      ],
    });

    // Inverse should be [deleteRange for '!', deleteRange for ' world']
    expect(result.inverse.ops).toHaveLength(2);
    expect(result.inverse.ops[0]?.kind).toBe('deleteRange');
    expect(result.inverse.ops[1]?.kind).toBe('deleteRange');
    // Second inverse should cover the first inserted text
    if (result.inverse.ops[1]?.kind === 'deleteRange') {
      expect(result.inverse.ops[1].from.offset).toBe(5);
    }
  });

  it('applying patch then inverse restores original text', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);

    const forward = applyPatch(doc, {
      ops: [
        {
          kind: 'insertText',
          at: { leafId: para.id, offset: 5 },
          text: ' world',
          runPropsId: undefined,
        },
      ],
    });
    expect(firstParaText(forward.doc)).toBe('hello world');

    const restored = applyPatch(forward.doc, forward.inverse);
    expect(firstParaText(restored.doc)).toBe('hello');
  });
});
