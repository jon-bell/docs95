import type { NodeBase, ParentNode } from './node.js';
import type { InlineNode } from './inline.js';
import type { PropsId, SectionProps } from './props.js';

export type BlockNode = Paragraph | Table;

export interface ParagraphAttrs {
  readonly paraPropsId: PropsId;
  readonly sectPr?: SectionProps;
}

export interface Paragraph extends ParentNode<'paragraph', ParagraphAttrs, InlineNode> {}

export interface TableAttrs {
  readonly tablePropsId: PropsId;
  readonly tblGrid: readonly number[]; // column widths in twips
}

export interface Table extends ParentNode<'table', TableAttrs, Row> {}

export interface RowAttrs {
  readonly rowPropsId: PropsId;
  readonly heightTwips?: number;
  readonly heightRule?: 'atLeast' | 'exact' | 'auto';
  readonly isHeader?: boolean;
  readonly cantSplit?: boolean;
}
export interface Row extends ParentNode<'row', RowAttrs, Cell> {}

export interface CellAttrs {
  readonly cellPropsId: PropsId;
  readonly gridSpan?: number;
  readonly vMerge?: 'restart' | 'continue';
}
export interface Cell extends ParentNode<'cell', CellAttrs, BlockNode> {}

// Helper kind guards — cheap and widely used across the codebase.
export const isParagraph = (b: BlockNode): b is Paragraph => b.type === 'paragraph';
export const isTable = (b: BlockNode): b is Table => b.type === 'table';

export type { NodeBase };
