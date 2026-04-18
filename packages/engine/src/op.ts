// Public Op union shape. Fleet agent provides implementations + invertibility guarantees.
import type {
  IdPosition,
  NodeId,
  PropsId,
  RunProps,
  ParaProps,
  InlineNode,
  BlockNode,
} from '@word/domain';

export type Op =
  | OpInsertText
  | OpDeleteRange
  | OpSplitParagraph
  | OpJoinParagraphs
  | OpSetRunProps
  | OpSetParaProps
  | OpInsertBlock
  | OpRemoveBlock
  | OpInsertInlineMarker
  | OpRemoveInlineMarker;

export interface OpBase {
  readonly kind: string;
}

export interface OpInsertText extends OpBase {
  readonly kind: 'insertText';
  readonly at: IdPosition;
  readonly text: string;
  readonly runPropsId?: PropsId;
}

export interface OpDeleteRange extends OpBase {
  readonly kind: 'deleteRange';
  readonly from: IdPosition;
  readonly to: IdPosition;
}

export interface OpSplitParagraph extends OpBase {
  readonly kind: 'splitParagraph';
  readonly at: IdPosition;
  readonly newId: NodeId;
}

export interface OpJoinParagraphs extends OpBase {
  readonly kind: 'joinParagraphs';
  readonly leftId: NodeId;
  readonly rightId: NodeId;
}

export interface OpSetRunProps extends OpBase {
  readonly kind: 'setRunProps';
  readonly from: IdPosition;
  readonly to: IdPosition;
  readonly props: Partial<RunProps>;
}

export interface OpSetParaProps extends OpBase {
  readonly kind: 'setParaProps';
  readonly paragraphId: NodeId;
  readonly props: Partial<ParaProps>;
}

export interface OpInsertBlock extends OpBase {
  readonly kind: 'insertBlock';
  readonly atSectionIndex: number;
  readonly atBlockIndex: number;
  readonly block: BlockNode;
}

export interface OpRemoveBlock extends OpBase {
  readonly kind: 'removeBlock';
  readonly atSectionIndex: number;
  readonly atBlockIndex: number;
}

export interface OpInsertInlineMarker extends OpBase {
  readonly kind: 'insertInlineMarker';
  readonly at: IdPosition;
  readonly marker: InlineNode;
}

export interface OpRemoveInlineMarker extends OpBase {
  readonly kind: 'removeInlineMarker';
  readonly paragraphId: NodeId;
  readonly markerId: NodeId;
}
