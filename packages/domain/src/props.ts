export type PropsId = string & { readonly __brand: 'PropsId' };
export const asPropsId = (s: string): PropsId => s as PropsId;

/** Character-level formatting. Resolution order: doc default → paragraph style → run style → direct. */
export interface RunProps {
  readonly fontName?: string;
  readonly fontNameEastAsia?: string;
  readonly fontNameComplex?: string;
  readonly halfPoints?: number; // 2× point size
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: UnderlineKind;
  readonly strike?: boolean;
  readonly doubleStrike?: boolean;
  readonly caps?: boolean;
  readonly smallCaps?: boolean;
  readonly color?: ColorValue;
  readonly highlight?: HighlightColor;
  readonly shading?: ShadingValue;
  readonly verticalAlign?: 'baseline' | 'superscript' | 'subscript';
  readonly kerning?: number;
  readonly spacing?: number; // twips
  readonly position?: number; // half-points raised/lowered
  readonly styleRef?: string; // w:rStyle (resolved against StyleRegistry)
  readonly lang?: string;
  readonly langEastAsia?: string;
  readonly langComplex?: string;
  readonly hidden?: boolean;
  readonly rtl?: boolean;
}

export type UnderlineKind =
  | 'none'
  | 'single'
  | 'words'
  | 'double'
  | 'thick'
  | 'dotted'
  | 'dottedHeavy'
  | 'dash'
  | 'dashHeavy'
  | 'dashLong'
  | 'dashLongHeavy'
  | 'dotDash'
  | 'dotDashHeavy'
  | 'dotDotDash'
  | 'dotDotDashHeavy'
  | 'wave'
  | 'wavyHeavy'
  | 'wavyDouble';

export type ColorValue =
  | { readonly kind: 'auto' }
  | { readonly kind: 'rgb'; readonly value: string /* 6-hex */ }
  | {
      readonly kind: 'themed';
      readonly themeColor: string;
      readonly tint?: string;
      readonly shade?: string;
    };

export type HighlightColor =
  | 'none'
  | 'black'
  | 'blue'
  | 'cyan'
  | 'darkBlue'
  | 'darkCyan'
  | 'darkGray'
  | 'darkGreen'
  | 'darkMagenta'
  | 'darkRed'
  | 'darkYellow'
  | 'green'
  | 'lightGray'
  | 'magenta'
  | 'red'
  | 'white'
  | 'yellow';

export interface ShadingValue {
  readonly fill?: string;
  readonly color?: string;
  readonly pattern?: string;
}

/** Paragraph-level formatting. */
export interface ParaProps {
  readonly styleRef?: string;
  readonly alignment?: 'left' | 'center' | 'right' | 'justify' | 'distribute';
  readonly indent?: {
    readonly leftTwips?: number;
    readonly rightTwips?: number;
    readonly firstLineTwips?: number;
    readonly hangingTwips?: number;
  };
  readonly spacing?: {
    readonly beforeTwips?: number;
    readonly afterTwips?: number;
    readonly lineTwips?: number;
    readonly lineRule?: 'auto' | 'atLeast' | 'exact';
  };
  readonly numbering?: { readonly numId: number; readonly ilvl: number };
  readonly tabs?: readonly TabStop[];
  readonly keepLines?: boolean;
  readonly keepNext?: boolean;
  readonly pageBreakBefore?: boolean;
  readonly widowControl?: boolean;
  readonly outlineLevel?: number; // 0-9
  readonly bidi?: boolean;
}

export interface TabStop {
  readonly positionTwips: number;
  readonly kind: 'left' | 'center' | 'right' | 'decimal' | 'bar' | 'clear';
  readonly leader?: 'none' | 'dot' | 'hyphen' | 'underscore' | 'heavy' | 'middleDot';
}

/** Section-level formatting. */
export interface SectionProps {
  readonly pageSize: {
    readonly widthTwips: number;
    readonly heightTwips: number;
    readonly orient: 'portrait' | 'landscape';
  };
  readonly pageMargin: {
    readonly topTwips: number;
    readonly bottomTwips: number;
    readonly leftTwips: number;
    readonly rightTwips: number;
    readonly headerTwips: number;
    readonly footerTwips: number;
    readonly gutterTwips: number;
  };
  readonly cols?: {
    readonly count: number;
    readonly spaceTwips?: number;
    readonly equalWidth: boolean;
  };
  readonly type?: 'continuous' | 'nextPage' | 'evenPage' | 'oddPage' | 'nextColumn';
  readonly pgNumType?: { readonly start?: number; readonly fmt?: string };
  readonly headerRefs?: ReadonlyArray<{
    readonly type: 'default' | 'first' | 'even';
    readonly id: string;
  }>;
  readonly footerRefs?: ReadonlyArray<{
    readonly type: 'default' | 'first' | 'even';
    readonly id: string;
  }>;
  readonly titlePage?: boolean;
  readonly vAlign?: 'top' | 'center' | 'both' | 'bottom';
}

export interface TableProps {
  readonly widthTwips?: number;
  readonly widthType?: 'auto' | 'dxa' | 'pct' | 'nil';
  readonly alignment?: 'left' | 'center' | 'right';
  readonly indentTwips?: number;
  readonly layout?: 'fixed' | 'autofit';
  readonly borders?: unknown;
  readonly cellMarginTwips?: {
    readonly top?: number;
    readonly bottom?: number;
    readonly left?: number;
    readonly right?: number;
  };
  readonly look?: number;
  readonly styleRef?: string;
}

export interface RowProps {
  readonly cantSplit?: boolean;
  readonly isHeader?: boolean;
}

export interface CellProps {
  readonly widthTwips?: number;
  readonly widthType?: 'auto' | 'dxa' | 'pct' | 'nil';
  readonly vAlign?: 'top' | 'center' | 'bottom';
  readonly borders?: unknown;
  readonly shading?: ShadingValue;
}

export interface PropsRegistry {
  readonly run: ReadonlyMap<PropsId, RunProps>;
  readonly para: ReadonlyMap<PropsId, ParaProps>;
  readonly section: ReadonlyMap<PropsId, SectionProps>;
  readonly table: ReadonlyMap<PropsId, TableProps>;
  readonly row: ReadonlyMap<PropsId, RowProps>;
  readonly cell: ReadonlyMap<PropsId, CellProps>;
}

export interface MutablePropsRegistry {
  internRun(p: RunProps): PropsId;
  internPara(p: ParaProps): PropsId;
  internSection(p: SectionProps): PropsId;
  internTable(p: TableProps): PropsId;
  internRow(p: RowProps): PropsId;
  internCell(p: CellProps): PropsId;
  freeze(): PropsRegistry;
}
