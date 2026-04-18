import type { NodeBase, NodeId } from './node.js';
import type { PropsId } from './props.js';

export type InlineNode =
  | Run
  | FieldRun
  | HyperlinkRun
  | DrawingRun
  | CommentMarker
  | BookmarkMarker
  | FootnoteMarker
  | EndnoteMarker
  | Break;

export interface RunAttrs {
  readonly runPropsId: PropsId;
}

/** A contiguous run of characters sharing RunProps. */
export interface Run extends NodeBase<'run', RunAttrs> {
  readonly text: string; // UTF-16
}

export interface FieldRunAttrs {
  readonly fieldId: NodeId;
  readonly locked?: boolean;
  readonly dirty?: boolean;
}

export interface FieldRun extends NodeBase<'fieldRun', FieldRunAttrs> {
  readonly children: readonly Run[];
}

export interface HyperlinkAttrs {
  readonly hyperlinkId: NodeId;
  readonly anchor?: string;
}

export interface HyperlinkRun extends NodeBase<'hyperlinkRun', HyperlinkAttrs> {
  readonly children: readonly InlineNode[];
}

export type WrapKind = 'square' | 'tight' | 'through' | 'topAndBottom' | 'behind' | 'inFront';

export interface DrawingAttrs {
  readonly drawingId: NodeId;
  readonly anchorKind: 'inline' | 'floating';
  readonly behindText?: boolean;
  readonly wrap?: WrapKind;
}

export interface DrawingRun extends NodeBase<'drawingRun', DrawingAttrs> {}

export interface CommentMarkerAttrs {
  readonly commentId: NodeId;
  readonly side: 'start' | 'end' | 'reference';
}
export interface CommentMarker extends NodeBase<'commentMarker', CommentMarkerAttrs> {}

export interface BookmarkMarkerAttrs {
  readonly bookmarkId: NodeId;
  readonly side: 'start' | 'end';
}
export interface BookmarkMarker extends NodeBase<'bookmarkMarker', BookmarkMarkerAttrs> {}

export interface FootnoteMarker extends NodeBase<'footnoteMarker', { footnoteId: NodeId }> {}
export interface EndnoteMarker extends NodeBase<'endnoteMarker', { endnoteId: NodeId }> {}

export interface BreakAttrs {
  readonly kind: 'line' | 'column' | 'page' | 'textWrapping';
  readonly clear?: 'none' | 'left' | 'right' | 'all';
}
export interface Break extends NodeBase<'break', BreakAttrs> {}
