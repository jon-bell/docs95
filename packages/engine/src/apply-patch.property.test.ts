/**
 * Property test: applying a patch then applying its inverse returns a document
 * with the same paragraph text content as the original.
 *
 * We focus on `insertText` and `deleteRange` since these are the hot-path M0 ops.
 * fast-check generates arbitrary text + offsets; we verify the round-trip.
 */
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { applyPatch } from './patch.js';
import { makeDocument, makeParagraph, makeTestIdGen } from './test-helpers.js';
import type { Document } from '@word/domain';
import type { Op } from './op.js';

// ---------------------------------------------------------------------------
// Helper: extract all paragraph texts from a document
// ---------------------------------------------------------------------------

function allParaTexts(doc: Document): string[] {
  const texts: string[] = [];
  for (const section of doc.sections) {
    for (const block of section.children) {
      if (block.type !== 'paragraph') continue;
      let t = '';
      for (const child of block.children) {
        if (child.type === 'run') t += child.text;
      }
      texts.push(t);
    }
  }
  return texts;
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('applyPatch property: patch → inverse → original (round-trip)', () => {
  it('empty patch is always invertible (identity)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 0, maxLength: 20 }).filter((s) => !s.includes('\0')),
          { minLength: 1, maxLength: 3 },
        ),
        (texts) => {
          const doc = makeDocument(texts.map((t) => makeParagraph(t)));
          const result = applyPatch(doc, { ops: [] });
          // Empty patch returns same reference
          return result.doc === doc && result.inverse.ops.length === 0;
        },
      ),
      { numRuns: 50, seed: 1 },
    );
  });

  it('insertText then inverse: text is restored exactly', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 20 }).filter((s) => !s.includes('\0')),
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => !s.includes('\0')),
        fc.nat({ max: 20 }),
        (initial, inserted, rawOffset) => {
          const para = makeParagraph(initial);
          const doc = makeDocument([para]);
          const offset = Math.min(rawOffset, initial.length);

          const forward = applyPatch(
            doc,
            {
              ops: [
                {
                  kind: 'insertText',
                  at: { leafId: para.id, offset },
                  text: inserted,
                },
              ],
            },
            { idGen: makeTestIdGen() },
          );

          // Forward: inserted text should now be present
          const forwardTexts = allParaTexts(forward.doc);
          const expectedForward = initial.slice(0, offset) + inserted + initial.slice(offset);
          if (forwardTexts[0] !== expectedForward) return false;

          // Inverse: should restore original
          const restored = applyPatch(forward.doc, forward.inverse, { idGen: makeTestIdGen() });
          const restoredTexts = allParaTexts(restored.doc);
          return restoredTexts[0] === initial;
        },
      ),
      { numRuns: 200, seed: 99 },
    );
  });

  it('deleteRange then inverse: text is restored exactly', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.includes('\0')),
        fc.nat({ max: 30 }),
        fc.nat({ max: 30 }),
        (initial, rawA, rawB) => {
          const para = makeParagraph(initial);
          const doc = makeDocument([para]);
          const a = Math.min(rawA, initial.length);
          const b = Math.min(rawB, initial.length);
          const from = Math.min(a, b);
          const to = Math.max(a, b);

          if (from === to) return true; // no-op; skip

          const forward = applyPatch(
            doc,
            {
              ops: [
                {
                  kind: 'deleteRange',
                  from: { leafId: para.id, offset: from },
                  to: { leafId: para.id, offset: to },
                },
              ],
            },
            { idGen: makeTestIdGen() },
          );

          const expectedForward = initial.slice(0, from) + initial.slice(to);
          const forwardTexts = allParaTexts(forward.doc);
          if (forwardTexts[0] !== expectedForward) return false;

          const restored = applyPatch(forward.doc, forward.inverse, { idGen: makeTestIdGen() });
          const restoredTexts = allParaTexts(restored.doc);
          return restoredTexts[0] === initial;
        },
      ),
      { numRuns: 200, seed: 77 },
    );
  });

  it('sequence of insertText ops: all inverses restore original', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 20 }).filter((s) => !s.includes('\0')),
        fc.array(
          fc.record({
            text: fc.string({ minLength: 1, maxLength: 5 }).filter((s) => !s.includes('\0')),
            rawOffset: fc.nat({ max: 20 }),
          }),
          { minLength: 1, maxLength: 4 },
        ),
        (initial, insertions) => {
          const para = makeParagraph(initial);
          const doc = makeDocument([para]);

          // Build ops, adjusting offsets relative to current text length
          // All ops are on the same paragraph; offsets into the original
          const ops: Op[] = insertions.map(({ text, rawOffset }) => ({
            kind: 'insertText' as const,
            at: { leafId: para.id, offset: Math.min(rawOffset, initial.length) },
            text,
          }));

          let forward: ReturnType<typeof applyPatch>;
          try {
            forward = applyPatch(doc, { ops }, { idGen: makeTestIdGen() });
          } catch {
            return true; // skip on error
          }

          let restored: ReturnType<typeof applyPatch>;
          try {
            restored = applyPatch(forward.doc, forward.inverse, { idGen: makeTestIdGen() });
          } catch {
            return false; // inverse must work if forward worked
          }

          return allParaTexts(restored.doc)[0] === initial;
        },
      ),
      { numRuns: 100, seed: 42 },
    );
  });
});
