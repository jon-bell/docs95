import type { IdRange, NodeId } from '@word/domain';

/** MDI can hold several selections (multiple cursors or block selection) per document. */
export interface SelectionSet {
  readonly primary: IdRange;
  readonly additional: readonly IdRange[];
}

export const singleSelection = (r: IdRange): SelectionSet => ({ primary: r, additional: [] });

/**
 * Collapse the selection to its start position (the lesser of anchor/focus in document order).
 * Without a layout index, we use a simple heuristic: if anchor and focus are in the same leaf,
 * the start is the lesser offset; otherwise we treat anchor as start (caller should resolve).
 */
export function collapseToStart(sel: SelectionSet): SelectionSet {
  const { anchor, focus } = sel.primary;
  if (anchor.leafId === focus.leafId) {
    const startOffset = Math.min(anchor.offset, focus.offset);
    const startPos = { leafId: anchor.leafId, offset: startOffset };
    return singleSelection({ anchor: startPos, focus: startPos });
  }
  // Different leaves: collapse to anchor (caller determines document order)
  return singleSelection({ anchor, focus: anchor });
}

/**
 * Collapse the selection to its end position (the greater of anchor/focus in document order).
 * Without a layout index, we use a simple heuristic.
 */
export function collapseToEnd(sel: SelectionSet): SelectionSet {
  const { anchor, focus } = sel.primary;
  if (anchor.leafId === focus.leafId) {
    const endOffset = Math.max(anchor.offset, focus.offset);
    const endPos = { leafId: anchor.leafId, offset: endOffset };
    return singleSelection({ anchor: endPos, focus: endPos });
  }
  // Different leaves: collapse to focus
  return singleSelection({ anchor: focus, focus });
}

/** Returns true if the primary range is collapsed (caret, not a selection span). */
export function isCollapsed(sel: SelectionSet): boolean {
  const { anchor, focus } = sel.primary;
  return anchor.leafId === focus.leafId && anchor.offset === focus.offset;
}

/** Move the primary caret to a new position, discarding any selection span. */
export function moveCaret(sel: SelectionSet, leafId: NodeId, offset: number): SelectionSet {
  const pos = { leafId, offset };
  return singleSelection({ anchor: pos, focus: pos });
}

/** Extend the focus of the primary selection without moving the anchor. */
export function extendFocus(sel: SelectionSet, leafId: NodeId, offset: number): SelectionSet {
  return singleSelection({ anchor: sel.primary.anchor, focus: { leafId, offset } });
}
