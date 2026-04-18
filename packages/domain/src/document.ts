import type { BlobRef, IsoDateTime, NodeBase, NodeId, ParentNode } from './node.js';
import type { BlockNode } from './block.js';
import type { PropsId, PropsRegistry } from './props.js';

export interface Section extends ParentNode<'section', { sectionPropsId: PropsId }, BlockNode> {}

export interface Footnote extends ParentNode<
  'footnote',
  { note: 'sep' | 'continuationSep' | 'continuationNotice' | 'regular' },
  BlockNode
> {}

export interface Endnote extends ParentNode<
  'endnote',
  { note: 'sep' | 'continuationSep' | 'continuationNotice' | 'regular' },
  BlockNode
> {}

export interface CommentAttrs {
  readonly author: string;
  readonly initials?: string;
  readonly date: IsoDateTime;
  readonly parentId?: NodeId;
  readonly resolved?: boolean;
}
export interface Comment extends NodeBase<'comment', CommentAttrs> {
  readonly children: readonly BlockNode[];
}

export interface Bookmark extends NodeBase<'bookmark', { name: string }> {}

export interface HyperlinkDefAttrs {
  readonly kind: 'external' | 'internal';
  readonly target: string;
  readonly tooltip?: string;
  readonly targetFrame?: string;
}
export interface Hyperlink extends NodeBase<'hyperlink', HyperlinkDefAttrs> {}

export interface DrawingDefAttrs {
  readonly altText?: string;
  readonly title?: string;
  readonly locked?: boolean;
}
export interface Drawing extends NodeBase<'drawing', DrawingDefAttrs> {
  readonly kind: 'picture' | 'shape' | 'chart' | 'diagram';
  readonly extentEMU: { cx: number; cy: number };
  readonly imageId?: NodeId;
}

export interface ImageAttrs {
  readonly mimeType: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly dpi?: number;
}
export interface Image extends NodeBase<'image', ImageAttrs> {
  readonly blobRef: BlobRef;
}

export interface FieldAttrs {
  readonly code: string; // PAGE, DATE, ...
  readonly switches: readonly string[];
}
export interface Field extends NodeBase<'field', FieldAttrs> {
  readonly instrText: string;
  readonly resultPlain?: string;
}

export interface DocumentMeta {
  readonly title?: string;
  readonly author?: string;
  readonly subject?: string;
  readonly keywords?: readonly string[];
  readonly created?: IsoDateTime;
  readonly modified?: IsoDateTime;
  readonly lastModifiedBy?: string;
  readonly revision?: number;
}

export interface StyleDef {
  readonly id: string;
  readonly name: string;
  readonly type: 'paragraph' | 'character' | 'table' | 'numbering';
  readonly basedOn?: string;
  readonly next?: string;
  readonly link?: string;
  readonly runPropsId?: PropsId;
  readonly paraPropsId?: PropsId;
  readonly hidden?: boolean;
  readonly isDefault?: boolean;
  readonly builtIn?: boolean;
}
export interface StyleRegistry {
  readonly styles: ReadonlyMap<string, StyleDef>;
  readonly defaultParagraphStyleId: string;
  readonly defaultCharacterStyleId: string;
}

export interface NumberingDef {
  readonly id: number; // numId
  readonly abstractId: number;
  readonly overrides?: readonly unknown[];
}
export interface NumberingRegistry {
  readonly nums: ReadonlyMap<number, NumberingDef>;
  readonly abstracts: ReadonlyMap<number, unknown>;
}

export interface FontFaceDef {
  readonly name: string;
  readonly family?: string;
  readonly pitch?: 'fixed' | 'variable' | 'default';
  readonly charset?: string;
  readonly altName?: string;
  readonly panose?: string;
  readonly embeddedRefs?: readonly string[];
}
export interface FontRegistry {
  readonly faces: ReadonlyMap<string, FontFaceDef>;
}

export interface DocDefaults {
  readonly runPropsId: PropsId;
  readonly paraPropsId: PropsId;
}

export interface Document {
  readonly id: NodeId;
  readonly version: number;
  readonly sections: readonly Section[];

  readonly footnotes: ReadonlyMap<NodeId, Footnote>;
  readonly endnotes: ReadonlyMap<NodeId, Endnote>;
  readonly comments: ReadonlyMap<NodeId, Comment>;
  readonly bookmarks: ReadonlyMap<NodeId, Bookmark>;
  readonly hyperlinks: ReadonlyMap<NodeId, Hyperlink>;
  readonly drawings: ReadonlyMap<NodeId, Drawing>;
  readonly images: ReadonlyMap<NodeId, Image>;
  readonly fields: ReadonlyMap<NodeId, Field>;

  readonly styles: StyleRegistry;
  readonly numbering: NumberingRegistry;
  readonly fonts: FontRegistry;
  readonly props: PropsRegistry;
  readonly defaults: DocDefaults;
  readonly meta: DocumentMeta;
}
