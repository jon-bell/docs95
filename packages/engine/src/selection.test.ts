import { describe, it, expect } from 'vitest';
import {
  singleSelection,
  collapseToStart,
  collapseToEnd,
  isCollapsed,
  moveCaret,
  extendFocus,
} from './selection.js';
import { asNodeId } from '@word/domain';

const leaf1 = asNodeId('leaf-1');
const leaf2 = asNodeId('leaf-2');

describe('singleSelection', () => {
  it('creates a collapsed selection', () => {
    const sel = singleSelection({
      anchor: { leafId: leaf1, offset: 0 },
      focus: { leafId: leaf1, offset: 0 },
    });
    expect(isCollapsed(sel)).toBe(true);
  });
});

describe('collapseToStart', () => {
  it('collapses a same-leaf selection to min offset', () => {
    const sel = singleSelection({
      anchor: { leafId: leaf1, offset: 5 },
      focus: { leafId: leaf1, offset: 2 },
    });
    const collapsed = collapseToStart(sel);
    expect(collapsed.primary.anchor.offset).toBe(2);
    expect(collapsed.primary.focus.offset).toBe(2);
    expect(isCollapsed(collapsed)).toBe(true);
  });

  it('collapses an already-collapsed selection', () => {
    const sel = singleSelection({
      anchor: { leafId: leaf1, offset: 3 },
      focus: { leafId: leaf1, offset: 3 },
    });
    expect(collapseToStart(sel)).toEqual(sel);
  });
});

describe('collapseToEnd', () => {
  it('collapses a same-leaf selection to max offset', () => {
    const sel = singleSelection({
      anchor: { leafId: leaf1, offset: 2 },
      focus: { leafId: leaf1, offset: 8 },
    });
    const collapsed = collapseToEnd(sel);
    expect(collapsed.primary.anchor.offset).toBe(8);
    expect(isCollapsed(collapsed)).toBe(true);
  });
});

describe('isCollapsed', () => {
  it('returns true for same leaf+offset', () => {
    const sel = singleSelection({
      anchor: { leafId: leaf1, offset: 0 },
      focus: { leafId: leaf1, offset: 0 },
    });
    expect(isCollapsed(sel)).toBe(true);
  });

  it('returns false for different offsets', () => {
    const sel = singleSelection({
      anchor: { leafId: leaf1, offset: 0 },
      focus: { leafId: leaf1, offset: 5 },
    });
    expect(isCollapsed(sel)).toBe(false);
  });

  it('returns false for different leaves', () => {
    const sel = singleSelection({
      anchor: { leafId: leaf1, offset: 0 },
      focus: { leafId: leaf2, offset: 0 },
    });
    expect(isCollapsed(sel)).toBe(false);
  });
});

describe('moveCaret', () => {
  it('creates a collapsed selection at given position', () => {
    const sel = singleSelection({
      anchor: { leafId: leaf1, offset: 3 },
      focus: { leafId: leaf1, offset: 7 },
    });
    const moved = moveCaret(sel, leaf2, 5);
    expect(moved.primary.anchor.leafId).toBe(leaf2);
    expect(moved.primary.anchor.offset).toBe(5);
    expect(isCollapsed(moved)).toBe(true);
  });
});

describe('extendFocus', () => {
  it('keeps anchor, moves focus', () => {
    const sel = singleSelection({
      anchor: { leafId: leaf1, offset: 2 },
      focus: { leafId: leaf1, offset: 2 },
    });
    const extended = extendFocus(sel, leaf1, 7);
    expect(extended.primary.anchor.offset).toBe(2);
    expect(extended.primary.focus.offset).toBe(7);
  });
});
