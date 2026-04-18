import type { NodeId } from './node.js';

/** A point within a leaf (paragraph or cell). Offset is in UTF-16 code units. */
export interface IdPosition {
  readonly leafId: NodeId;
  readonly offset: number;
}

export interface IdRange {
  readonly anchor: IdPosition;
  readonly focus: IdPosition;
}

export const posEquals = (a: IdPosition, b: IdPosition): boolean =>
  a.leafId === b.leafId && a.offset === b.offset;

export const rangeIsCollapsed = (r: IdRange): boolean => posEquals(r.anchor, r.focus);
