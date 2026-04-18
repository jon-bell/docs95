import { useMemo } from 'react';
import type { Document, RunProps, ParaProps, BlockNode, InlineNode } from '@word/domain';
import type { SelectionSet } from '@word/engine';

export type ListKind = 'bulleted' | 'numbered';

export interface ActiveFormatting {
  readonly bold?: boolean;
  readonly italic?: boolean;
  // underline is a union type; toolbar shows active when it is not 'none'
  readonly underline?: boolean;
  readonly strikethrough?: boolean;
  readonly fontName?: string;
  readonly halfPoints?: number;
  readonly color?: string;
  readonly alignment?: 'left' | 'center' | 'right' | 'justify';
  readonly styleRef?: string;
  readonly listKind?: ListKind;
}

// Sentinel used to signal that values are mixed across the selection.
const MIXED = Symbol('mixed');

type MixedOrValue<T> = T | typeof MIXED;

function mergeMixed<T>(
  acc: MixedOrValue<T | undefined>,
  next: T | undefined,
): MixedOrValue<T | undefined> {
  if (acc === MIXED) return MIXED;
  if (acc === undefined) return next;
  if (acc !== next) return MIXED;
  return acc;
}

function collectRuns(block: BlockNode, doc: Document, out: RunProps[]): void {
  if (block.type === 'paragraph') {
    collectRunsFromInline(block.children, doc, out);
  } else if (block.type === 'table') {
    for (const row of block.children) {
      for (const cell of row.children) {
        for (const child of cell.children) {
          collectRuns(child, doc, out);
        }
      }
    }
  }
}

function collectRunsFromInline(nodes: readonly InlineNode[], doc: Document, out: RunProps[]): void {
  for (const node of nodes) {
    if (node.type === 'run') {
      const props = doc.props.run.get(node.attrs.runPropsId);
      out.push(props ?? {});
    } else if (node.type === 'hyperlinkRun') {
      collectRunsFromInline(node.children, doc, out);
    } else if (node.type === 'fieldRun') {
      collectRunsFromInline(node.children, doc, out);
    }
  }
}

function getParaProps(block: BlockNode, doc: Document): ParaProps | undefined {
  if (block.type === 'paragraph') {
    return doc.props.para.get(block.attrs.paraPropsId);
  }
  return undefined;
}

/**
 * Derives ActiveFormatting from the current document selection.
 * When multiple runs have differing values the field is `undefined` (mixed).
 * When doc is null or the document has no content, returns empty object.
 *
 * The `selection` parameter is included so the memo re-computes whenever the
 * selection changes. Precise per-run filtering will narrow the walk once the
 * layout index is available; for now the hook walks all paragraphs in the
 * document.
 */
export function useActiveFormatting(
  doc: Document | null,
  selection: SelectionSet,
): ActiveFormatting {
  return useMemo((): ActiveFormatting => {
    if (doc === null) return {};
    // The selection drives which paragraphs/runs are inspected.  Once the layout
    // index is available this walk will be narrowed to the selected range; for
    // now we record the selection id so the memo invalidates on any movement.
    void selection;

    const allRuns: RunProps[] = [];
    const allParas: ParaProps[] = [];

    for (const section of doc.sections) {
      for (const block of section.children) {
        collectRuns(block, doc, allRuns);
        const pp = getParaProps(block, doc);
        if (pp !== undefined) allParas.push(pp);
      }
    }

    if (allRuns.length === 0 && allParas.length === 0) return {};

    // Fold run props — undefined means not set, MIXED means heterogeneous.
    let bold: MixedOrValue<boolean | undefined> = undefined;
    let italic: MixedOrValue<boolean | undefined> = undefined;
    let underlineActive: MixedOrValue<boolean | undefined> = undefined;
    let strike: MixedOrValue<boolean | undefined> = undefined;
    let fontName: MixedOrValue<string | undefined> = undefined;
    let halfPoints: MixedOrValue<number | undefined> = undefined;
    let colorStr: MixedOrValue<string | undefined> = undefined;

    for (const rp of allRuns) {
      bold = mergeMixed(bold, rp.bold);
      italic = mergeMixed(italic, rp.italic);
      const ul = rp.underline !== undefined && rp.underline !== 'none';
      underlineActive = mergeMixed(underlineActive, ul);
      strike = mergeMixed(strike, rp.strike);
      fontName = mergeMixed(fontName, rp.fontName);
      halfPoints = mergeMixed(halfPoints, rp.halfPoints);

      let cs: string | undefined;
      if (rp.color !== undefined) {
        cs = rp.color.kind === 'rgb' ? rp.color.value : undefined;
      }
      colorStr = mergeMixed(colorStr, cs);
    }

    // Fold para props
    let alignment: MixedOrValue<'left' | 'center' | 'right' | 'justify' | undefined> = undefined;
    let styleRef: MixedOrValue<string | undefined> = undefined;
    let listKind: MixedOrValue<ListKind | undefined> = undefined;

    for (const pp of allParas) {
      // 'distribute' is not surfaced in the toolbar — treat as undefined
      const al: 'left' | 'center' | 'right' | 'justify' | undefined =
        pp.alignment === 'distribute' ? undefined : pp.alignment;
      alignment = mergeMixed(alignment, al);
      styleRef = mergeMixed(styleRef, pp.styleRef);
      const lk: ListKind | undefined = pp.numbering !== undefined ? 'numbered' : undefined;
      listKind = mergeMixed(listKind, lk);
    }

    // Helper: resolve MIXED → undefined (heterogeneous shown as inactive).
    // Returns undefined for MIXED or unset, otherwise returns the value.
    function resolve<T>(v: MixedOrValue<T | undefined>): T | undefined {
      return v === MIXED ? undefined : v;
    }

    // With exactOptionalPropertyTypes we cannot set a key to `undefined` explicitly.
    // Build the object by only assigning keys that have concrete values.
    const result: ActiveFormatting = {};
    const rb = resolve(bold);
    const ri = resolve(italic);
    const ru = resolve(underlineActive);
    const rs = resolve(strike);
    const rfn = resolve(fontName);
    const rhp = resolve(halfPoints);
    const rc = resolve(colorStr);
    const ral = resolve(alignment);
    const rsr = resolve(styleRef);
    const rlk = resolve(listKind);

    return {
      ...(rb !== undefined && { bold: rb }),
      ...(ri !== undefined && { italic: ri }),
      ...(ru !== undefined && { underline: ru }),
      ...(rs !== undefined && { strikethrough: rs }),
      ...(rfn !== undefined && { fontName: rfn }),
      ...(rhp !== undefined && { halfPoints: rhp }),
      ...(rc !== undefined && { color: rc }),
      ...(ral !== undefined && { alignment: ral }),
      ...(rsr !== undefined && { styleRef: rsr }),
      ...(rlk !== undefined && { listKind: rlk }),
      ...result,
    };
  }, [doc, selection]);
}
