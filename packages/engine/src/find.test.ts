/**
 * Tests for the find service (find.ts).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { findAll, findNext, findPrev } from './find.js';
import { makeDocument, makeParagraph, resetIdCounter } from './test-helpers.js';

beforeEach(() => {
  resetIdCounter();
});

// ---------------------------------------------------------------------------
// findAll
// ---------------------------------------------------------------------------

describe('findAll', () => {
  it('returns empty array for empty query', () => {
    const doc = makeDocument([makeParagraph('hello world')]);
    expect(findAll(doc, { query: '' })).toHaveLength(0);
  });

  it('finds a single match in one paragraph', () => {
    const para = makeParagraph('hello world');
    const doc = makeDocument([para]);
    const results = findAll(doc, { query: 'world' });
    expect(results).toHaveLength(1);
    expect(results[0]?.paragraphId).toBe(para.id);
    expect(results[0]?.range.anchor.offset).toBe(6);
    expect(results[0]?.range.focus.offset).toBe(11);
  });

  it('finds multiple matches in one paragraph', () => {
    const para = makeParagraph('aababab');
    const doc = makeDocument([para]);
    const results = findAll(doc, { query: 'ab' });
    expect(results).toHaveLength(3);
  });

  it('finds matches across multiple paragraphs', () => {
    const p1 = makeParagraph('hello world');
    const p2 = makeParagraph('world of worlds');
    const doc = makeDocument([p1, p2]);
    const results = findAll(doc, { query: 'world' });
    expect(results).toHaveLength(3);
    expect(results[0]?.paragraphId).toBe(p1.id);
    expect(results[1]?.paragraphId).toBe(p2.id);
    expect(results[2]?.paragraphId).toBe(p2.id);
  });

  it('snippet contains the match text', () => {
    const para = makeParagraph('hello world');
    const doc = makeDocument([para]);
    const results = findAll(doc, { query: 'world' });
    expect(results[0]?.snippet).toContain('world');
  });

  it('is case-insensitive by default', () => {
    const para = makeParagraph('Hello WORLD hello');
    const doc = makeDocument([para]);
    const results = findAll(doc, { query: 'hello' });
    expect(results).toHaveLength(2);
  });

  it('respects caseSensitive=true', () => {
    const para = makeParagraph('Hello WORLD hello');
    const doc = makeDocument([para]);
    const results = findAll(doc, { query: 'hello', caseSensitive: true });
    expect(results).toHaveLength(1);
    expect(results[0]?.range.anchor.offset).toBe(12);
  });

  it('respects wholeWord=true — matches only whole words', () => {
    const para = makeParagraph('word wordly word');
    const doc = makeDocument([para]);
    const results = findAll(doc, { query: 'word', wholeWord: true });
    // "word" at 0 and 12; "wordly" at 5 should not match
    expect(results).toHaveLength(2);
    expect(results[0]?.range.anchor.offset).toBe(0);
    expect(results[1]?.range.anchor.offset).toBe(12);
  });

  it('respects regex=true', () => {
    const para = makeParagraph('cat bat hat mat');
    const doc = makeDocument([para]);
    const results = findAll(doc, { query: '[cbh]at', regex: true });
    expect(results).toHaveLength(3);
  });

  it('returns no results when query is not found', () => {
    const para = makeParagraph('hello world');
    const doc = makeDocument([para]);
    const results = findAll(doc, { query: 'xyz' });
    expect(results).toHaveLength(0);
  });

  it('range anchor and focus bracket the match correctly', () => {
    const para = makeParagraph('abcXYZdef');
    const doc = makeDocument([para]);
    const results = findAll(doc, { query: 'XYZ', caseSensitive: true });
    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.range.anchor.offset).toBe(3);
    expect(r.range.focus.offset).toBe(6);
    expect(r.paragraphId).toBe(para.id);
  });
});

// ---------------------------------------------------------------------------
// findNext
// ---------------------------------------------------------------------------

describe('findNext', () => {
  it('returns the first result when starting before all matches', () => {
    const p1 = makeParagraph('hello');
    const p2 = makeParagraph('world hello');
    const doc = makeDocument([p1, p2]);
    const result = findNext(doc, { leafId: p1.id, offset: 0 }, { query: 'hello' });
    expect(result).toBeDefined();
    // The first match at offset 0 in p1; fromPos is also at 0 — so it should advance
    // to the second match or wrap. Since offset 0 is not strictly after offset 0:
    // Our impl: offset > fromPos.offset. So it advances to p2's "hello".
    expect(result?.paragraphId).toBe(p2.id);
  });

  it('wraps around to the start when past the last match', () => {
    const p1 = makeParagraph('hello world');
    const doc = makeDocument([p1]);
    // Position after last match
    const result = findNext(doc, { leafId: p1.id, offset: 11 }, { query: 'hello' });
    expect(result).toBeDefined();
    expect(result?.range.anchor.offset).toBe(0);
  });

  it('returns undefined for query with no matches', () => {
    const doc = makeDocument([makeParagraph('hello world')]);
    const para = doc.sections[0]!.children[0]!;
    const result = findNext(doc, { leafId: para.id, offset: 0 }, { query: 'xyz' });
    expect(result).toBeUndefined();
  });

  it('advances to next match in same paragraph', () => {
    const para = makeParagraph('hello hello hello');
    const doc = makeDocument([para]);
    // Start after first match (offset 5)
    const result = findNext(doc, { leafId: para.id, offset: 5 }, { query: 'hello' });
    expect(result).toBeDefined();
    // Second match at offset 6
    expect(result?.range.anchor.offset).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// findPrev
// ---------------------------------------------------------------------------

describe('findPrev', () => {
  it('returns the match before fromPos', () => {
    const para = makeParagraph('hello hello hello');
    const doc = makeDocument([para]);
    // "hello hello hello": matches at 0-5, 6-11, 12-17
    // fromPos at offset 12 (start of third match) → prev is second match at 6-11
    const result = findPrev(
      doc,
      { leafId: para.id, offset: 12 },
      { query: 'hello', caseSensitive: true },
    );
    expect(result).toBeDefined();
    expect(result?.range.anchor.offset).toBe(6);
  });

  it('wraps to end when before first match', () => {
    const para = makeParagraph('hello hello hello');
    const doc = makeDocument([para]);
    // fromPos at offset 0 (before first match)
    const result = findPrev(doc, { leafId: para.id, offset: 0 }, { query: 'hello' });
    expect(result).toBeDefined();
    // Should wrap to last match at offset 12
    expect(result?.range.anchor.offset).toBe(12);
  });

  it('returns undefined for query with no matches', () => {
    const doc = makeDocument([makeParagraph('hello world')]);
    const para = doc.sections[0]!.children[0]!;
    const result = findPrev(doc, { leafId: para.id, offset: 5 }, { query: 'xyz' });
    expect(result).toBeUndefined();
  });

  it('navigates backward across paragraphs', () => {
    const p1 = makeParagraph('hello world');
    const p2 = makeParagraph('another hello');
    const doc = makeDocument([p1, p2]);
    // fromPos in p2 before any match in p2
    const result = findPrev(doc, { leafId: p2.id, offset: 0 }, { query: 'hello' });
    expect(result).toBeDefined();
    // Should find p1's hello
    expect(result?.paragraphId).toBe(p1.id);
  });
});
