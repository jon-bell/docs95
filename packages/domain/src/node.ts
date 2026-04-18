// Identity and base node shapes shared by every entity in the document tree.

export type NodeId = string & { readonly __brand: 'NodeId' };
export const asNodeId = (s: string): NodeId => s as NodeId;

export type IsoDateTime = string & { readonly __brand: 'IsoDateTime' };
export const asIsoDateTime = (s: string): IsoDateTime => s as IsoDateTime;

export type BlobRef = string & { readonly __brand: 'BlobRef' };
export const asBlobRef = (s: string): BlobRef => s as BlobRef;

export type NodeType =
  | 'document'
  | 'section'
  | 'paragraph'
  | 'run'
  | 'fieldRun'
  | 'hyperlinkRun'
  | 'drawingRun'
  | 'commentMarker'
  | 'bookmarkMarker'
  | 'footnoteMarker'
  | 'endnoteMarker'
  | 'break'
  | 'table'
  | 'row'
  | 'cell'
  | 'footnote'
  | 'endnote'
  | 'comment'
  | 'bookmark'
  | 'hyperlink'
  | 'image'
  | 'field'
  | 'drawing';

export interface NodeBase<T extends NodeType = NodeType, A = unknown> {
  readonly id: NodeId;
  readonly type: T;
  readonly attrs: Readonly<A>;
}

export interface ParentNode<
  T extends NodeType = NodeType,
  A = unknown,
  C = NodeBase,
> extends NodeBase<T, A> {
  readonly children: readonly C[];
}

export interface Mark {
  readonly kind: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
}

/** Inline opaque XML preserved round-trip from unknown DOCX elements. See ADR-0005. */
export interface UnknownElement {
  readonly kind: 'unknownElement';
  readonly ns: string;
  readonly tag: string;
  readonly xml: string;
}
