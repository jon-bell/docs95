/**
 * Tests for replace command (replace.ts and replace-all.ts).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createReplaceCommand } from './replace.js';
import { createReplaceAllCommand } from './replace-all.js';
import { applyPatch } from '../patch.js';
import {
  makeDocument,
  makeParagraph,
  makeTestIdGen,
  makeTestClock,
  makeTestRandom,
  makeTestLog,
  firstParaText,
  nthParaText,
  resetIdCounter,
} from '../test-helpers.js';
import { singleSelection } from '../selection.js';
import type { CommandContext } from '../command.js';
import type { Paragraph } from '@word/domain';

beforeEach(() => {
  resetIdCounter();
});

function makeCtx(doc: ReturnType<typeof makeDocument>, paragraphId?: string): CommandContext {
  const para = paragraphId
    ? (doc.sections[0]!.children.find((c) => c.id === paragraphId) as Paragraph)
    : (doc.sections[0]!.children[0] as Paragraph);
  return {
    doc,
    selection: singleSelection({
      anchor: { leafId: para.id, offset: 0 },
      focus: { leafId: para.id, offset: 0 },
    }),
    idGen: makeTestIdGen(),
    clock: makeTestClock(),
    random: makeTestRandom(),
    log: makeTestLog(),
  };
}

// ---------------------------------------------------------------------------
// createReplaceCommand
// ---------------------------------------------------------------------------

describe('createReplaceCommand', () => {
  it('has correct command id', () => {
    expect(createReplaceCommand().meta.id).toBe('app.edit.replace');
  });

  it('replaces a range with replacement text', () => {
    const para = makeParagraph('hello world');
    const doc = makeDocument([para]);
    const cmd = createReplaceCommand();
    const ctx = makeCtx(doc);
    const result = cmd.run(ctx, {
      range: {
        anchor: { leafId: para.id, offset: 6 },
        focus: { leafId: para.id, offset: 11 },
      },
      replacement: 'earth',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { doc: newDoc } = applyPatch(doc, result.value, { idGen: makeTestIdGen() });
    expect(firstParaText(newDoc)).toBe('hello earth');
  });

  it('replaces with empty string (delete)', () => {
    const para = makeParagraph('hello world');
    const doc = makeDocument([para]);
    const cmd = createReplaceCommand();
    const ctx = makeCtx(doc);
    const result = cmd.run(ctx, {
      range: {
        anchor: { leafId: para.id, offset: 5 },
        focus: { leafId: para.id, offset: 11 },
      },
      replacement: '',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { doc: newDoc } = applyPatch(doc, result.value, { idGen: makeTestIdGen() });
    expect(firstParaText(newDoc)).toBe('hello');
  });

  it('inverse restores original text', () => {
    const para = makeParagraph('hello world');
    const doc = makeDocument([para]);
    const cmd = createReplaceCommand();
    const ctx = makeCtx(doc);
    const result = cmd.run(ctx, {
      range: {
        anchor: { leafId: para.id, offset: 6 },
        focus: { leafId: para.id, offset: 11 },
      },
      replacement: 'earth',
    });
    if (!result.ok) return;
    const idGen = makeTestIdGen();
    const { doc: newDoc, inverse } = applyPatch(doc, result.value, { idGen });
    const { doc: restoredDoc } = applyPatch(newDoc, inverse, { idGen });
    expect(firstParaText(restoredDoc)).toBe('hello world');
  });

  it('rejects cross-paragraph range', () => {
    const p1 = makeParagraph('hello');
    const p2 = makeParagraph('world');
    const doc = makeDocument([p1, p2]);
    const cmd = createReplaceCommand();
    const ctx = makeCtx(doc);
    const result = cmd.run(ctx, {
      range: {
        anchor: { leafId: p1.id, offset: 0 },
        focus: { leafId: p2.id, offset: 5 },
      },
      replacement: 'x',
    });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createReplaceAllCommand
// ---------------------------------------------------------------------------

describe('createReplaceAllCommand', () => {
  it('has correct command id', () => {
    expect(createReplaceAllCommand().meta.id).toBe('app.edit.replaceAll');
  });

  it('replaces all occurrences in a paragraph', () => {
    const para = makeParagraph('cat bat cat hat');
    const doc = makeDocument([para]);
    const cmd = createReplaceAllCommand();
    const ctx = makeCtx(doc);
    const result = cmd.run(ctx, {
      findOptions: { query: 'cat' },
      replacement: 'dog',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { doc: newDoc } = applyPatch(doc, result.value, { idGen: makeTestIdGen() });
    expect(firstParaText(newDoc)).toBe('dog bat dog hat');
  });

  it('replaces across multiple paragraphs', () => {
    const p1 = makeParagraph('hello world');
    const p2 = makeParagraph('world of worlds');
    const doc = makeDocument([p1, p2]);
    const cmd = createReplaceAllCommand();
    const ctx = makeCtx(doc);
    const result = cmd.run(ctx, {
      findOptions: { query: 'world', wholeWord: true },
      replacement: 'earth',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { doc: newDoc } = applyPatch(doc, result.value, { idGen: makeTestIdGen() });
    expect(firstParaText(newDoc)).toBe('hello earth');
    expect(nthParaText(newDoc, 1)).toBe('earth of worlds');
  });

  it('returns empty ops when no matches', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createReplaceAllCommand();
    const ctx = makeCtx(doc);
    const result = cmd.run(ctx, {
      findOptions: { query: 'xyz' },
      replacement: 'abc',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ops).toHaveLength(0);
  });

  it('canRun returns false for empty query', () => {
    const para = makeParagraph('hello');
    const doc = makeDocument([para]);
    const cmd = createReplaceAllCommand();
    const ctx = makeCtx(doc);
    expect(cmd.canRun(ctx, { findOptions: { query: '' }, replacement: 'x' })).toBe(false);
  });

  it('replaces with regex mode', () => {
    const para = makeParagraph('cat bat hat');
    const doc = makeDocument([para]);
    const cmd = createReplaceAllCommand();
    const ctx = makeCtx(doc);
    const result = cmd.run(ctx, {
      findOptions: { query: '[cbh]at', regex: true },
      replacement: 'dog',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { doc: newDoc } = applyPatch(doc, result.value, { idGen: makeTestIdGen() });
    expect(firstParaText(newDoc)).toBe('dog dog dog');
  });

  it('inverse of replaceAll restores original text', () => {
    const para = makeParagraph('cat bat cat hat');
    const doc = makeDocument([para]);
    const cmd = createReplaceAllCommand();
    const ctx = makeCtx(doc);
    const result = cmd.run(ctx, {
      findOptions: { query: 'cat' },
      replacement: 'dog',
    });
    if (!result.ok) return;
    const idGen = makeTestIdGen();
    const { doc: newDoc, inverse } = applyPatch(doc, result.value, { idGen });
    const { doc: restoredDoc } = applyPatch(newDoc, inverse, { idGen });
    expect(firstParaText(restoredDoc)).toBe('cat bat cat hat');
  });
});
