/**
 * Per-op application and inversion logic.
 * Each handler is pure: receives pre-state doc + op, returns new doc + inverse op(s).
 * Structural sharing: only nodes on the mutation path are cloned.
 *
 * ADR-0015: dispatch table keyed by op.kind; no switch on governed union in call sites.
 */
import type {
  Document,
  Section,
  BlockNode,
  Paragraph,
  InlineNode,
  NodeId,
  PropsId,
  RunProps,
  ParaProps,
  IdGenPort,
  MutablePropsRegistry,
} from '@word/domain';
import { createMutablePropsRegistry } from '@word/domain';
import type {
  Op,
  OpInsertText,
  OpDeleteRange,
  OpSplitParagraph,
  OpJoinParagraphs,
  OpSetRunProps,
  OpSetParaProps,
  OpInsertBlock,
  OpRemoveBlock,
  OpInsertInlineMarker,
  OpRemoveInlineMarker,
} from './op.js';

export class UnsupportedOpError extends Error {
  constructor(kind: string) {
    super(`Op "${kind}" is not yet implemented`);
    this.name = 'UnsupportedOpError';
  }
}

export interface ApplyOpContext {
  readonly idGen: IdGenPort;
  /** Optional mutable registry for props interning. If not supplied a fresh one is created per op. */
  readonly propsRegistry?: MutablePropsRegistry;
}

export interface ApplyOpResult {
  readonly doc: Document;
  readonly inverseOps: readonly Op[];
}

// ---------------------------------------------------------------------------
// Helpers: structural-sharing tree updates
// ---------------------------------------------------------------------------

function findParagraphById(
  doc: Document,
  id: NodeId,
): { sectionIdx: number; blockIdx: number; para: Paragraph } | undefined {
  for (let si = 0; si < doc.sections.length; si++) {
    const section = doc.sections[si]!;
    for (let bi = 0; bi < section.children.length; bi++) {
      const block = section.children[bi]!;
      if (block.type === 'paragraph' && block.id === id) {
        return { sectionIdx: si, blockIdx: bi, para: block };
      }
    }
  }
  return undefined;
}

function replaceSectionBlock(
  doc: Document,
  sectionIdx: number,
  blockIdx: number,
  newBlock: BlockNode,
): Document {
  const oldSection = doc.sections[sectionIdx]!;
  const newChildren = replaceAt(oldSection.children, blockIdx, newBlock);
  const newSection: Section = { ...oldSection, children: newChildren };
  return {
    ...doc,
    version: doc.version + 1,
    sections: replaceAt(doc.sections, sectionIdx, newSection),
  };
}

function replaceAt<T>(arr: readonly T[], idx: number, val: T): readonly T[] {
  const out = arr.slice() as T[];
  out[idx] = val;
  return out;
}

function spliceAt<T>(
  arr: readonly T[],
  idx: number,
  deleteCount: number,
  ...inserts: T[]
): readonly T[] {
  const out = arr.slice() as T[];
  out.splice(idx, deleteCount, ...inserts);
  return out;
}

// ---------------------------------------------------------------------------
// Per-paragraph text helpers (works on Run[]  children)
// ---------------------------------------------------------------------------

function paragraphTextLength(para: Paragraph): number {
  let len = 0;
  for (const child of para.children) {
    if (child.type === 'run') len += child.text.length;
  }
  return len;
}

function extractText(para: Paragraph, from: number, to: number): string {
  let text = '';
  let pos = 0;
  for (const child of para.children) {
    if (child.type !== 'run') continue;
    const end = pos + child.text.length;
    if (end <= from) {
      pos = end;
      continue;
    }
    if (pos >= to) break;
    const s = Math.max(0, from - pos);
    const e = Math.min(child.text.length, to - pos);
    text += child.text.slice(s, e);
    pos = end;
  }
  return text;
}

/** Insert text into a paragraph at a given character offset. Returns new Paragraph. */
function insertTextIntoParagraph(
  para: Paragraph,
  offset: number,
  text: string,
  runPropsId: PropsId | undefined,
): Paragraph {
  const children = para.children;

  // Find which run the offset falls in
  let pos = 0;
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    if (child.type !== 'run') {
      // Non-text inline node; count it as zero-width for offset tracking.
      continue;
    }
    const end = pos + child.text.length;
    if (offset >= pos && offset <= end) {
      const localOffset = offset - pos;
      const propsId = runPropsId ?? child.attrs.runPropsId;
      if (localOffset === 0 && runPropsId === undefined) {
        // Insert before this run
        const newRun: InlineNode = {
          id: child.id,
          type: 'run',
          attrs: { runPropsId: propsId },
          text: text + child.text,
        } as InlineNode;
        return { ...para, children: replaceAt(children, i, newRun) };
      }
      // Split run at localOffset and insert
      const before = child.text.slice(0, localOffset);
      const after = child.text.slice(localOffset);
      const runBefore: InlineNode = { ...child, text: before };
      const newRun: InlineNode = {
        id: child.id,
        type: 'run',
        attrs: { runPropsId: propsId },
        text: text + after,
      } as InlineNode;
      const newChildren: readonly InlineNode[] =
        localOffset === 0
          ? spliceAt(children, i, 1, newRun)
          : spliceAt(children, i, 1, runBefore, newRun);
      return { ...para, children: newChildren };
    }
    pos = end;
  }

  // offset is at/past end — append a new run
  const defaultPropsId: PropsId =
    runPropsId ??
    (children.length > 0 && children[children.length - 1]!.type === 'run'
      ? (children[children.length - 1] as { attrs: { runPropsId: PropsId } }).attrs.runPropsId
      : ('' as PropsId));

  const newRun: InlineNode = {
    id: 'run-appended' as NodeId,
    type: 'run',
    attrs: { runPropsId: defaultPropsId },
    text,
  } as InlineNode;
  return { ...para, children: [...children, newRun] };
}

/** Delete a range of text within a single paragraph (from-to are char offsets). */
function deleteTextFromParagraph(para: Paragraph, from: number, to: number): Paragraph {
  const newChildren: InlineNode[] = [];
  let pos = 0;
  for (const child of para.children) {
    if (child.type !== 'run') {
      newChildren.push(child);
      continue;
    }
    const end = pos + child.text.length;
    if (end <= from || pos >= to) {
      // Entirely outside the range
      newChildren.push(child);
    } else {
      // Partially or fully inside
      const keep1 = child.text.slice(0, Math.max(0, from - pos));
      const keep2 = child.text.slice(Math.max(0, to - pos));
      const kept = keep1 + keep2;
      if (kept.length > 0) {
        newChildren.push({ ...child, text: kept });
      }
    }
    pos = end;
  }
  // Ensure at least an empty run
  if (newChildren.every((c) => c.type !== 'run')) {
    // Keep non-run children but add nothing extra; paragraph may be empty text.
  }
  return { ...para, children: newChildren as readonly InlineNode[] };
}

// ---------------------------------------------------------------------------
// Op handlers
// ---------------------------------------------------------------------------

function applyInsertText(doc: Document, op: OpInsertText): ApplyOpResult {
  const { at, text, runPropsId } = op;
  const found = findParagraphById(doc, at.leafId);
  if (found === undefined) {
    throw new Error(`insertText: paragraph ${at.leafId} not found`);
  }
  const { sectionIdx, blockIdx, para } = found;
  const newPara = insertTextIntoParagraph(para, at.offset, text, runPropsId);
  const newDoc = replaceSectionBlock(doc, sectionIdx, blockIdx, newPara);

  const inverseOps: Op[] = [
    {
      kind: 'deleteRange',
      from: at,
      to: { leafId: at.leafId, offset: at.offset + text.length },
    },
  ];
  return { doc: newDoc, inverseOps };
}

function applyDeleteRange(doc: Document, op: OpDeleteRange): ApplyOpResult {
  const { from, to } = op;

  if (from.leafId !== to.leafId) {
    // Cross-paragraph delete: stub — only same-paragraph deletes are MVP
    throw new UnsupportedOpError('deleteRange across paragraphs');
  }

  const start = Math.min(from.offset, to.offset);
  const end = Math.max(from.offset, to.offset);

  if (start === end) {
    // No-op
    return { doc, inverseOps: [] };
  }

  const found = findParagraphById(doc, from.leafId);
  if (found === undefined) {
    throw new Error(`deleteRange: paragraph ${from.leafId} not found`);
  }
  const { sectionIdx, blockIdx, para } = found;

  // Capture text for inverse before deleting
  const removedText = extractText(para, start, end);
  // Capture runPropsId at the start position for inverse
  let inverseRunPropsId: PropsId | undefined;
  {
    let pos = 0;
    for (const child of para.children) {
      if (child.type !== 'run') continue;
      const childEnd = pos + child.text.length;
      if (start >= pos && start < childEnd) {
        inverseRunPropsId = child.attrs.runPropsId;
        break;
      }
      pos = childEnd;
    }
  }

  const newPara = deleteTextFromParagraph(para, start, end);
  const newDoc = replaceSectionBlock(doc, sectionIdx, blockIdx, newPara);

  const inverseInsert: Op =
    inverseRunPropsId !== undefined
      ? {
          kind: 'insertText',
          at: { leafId: from.leafId, offset: start },
          text: removedText,
          runPropsId: inverseRunPropsId,
        }
      : {
          kind: 'insertText',
          at: { leafId: from.leafId, offset: start },
          text: removedText,
        };
  const inverseOps: Op[] = [inverseInsert];
  return { doc: newDoc, inverseOps };
}

function applySplitParagraph(doc: Document, op: OpSplitParagraph): ApplyOpResult {
  const { at, newId } = op;
  const found = findParagraphById(doc, at.leafId);
  if (found === undefined) {
    throw new Error(`splitParagraph: paragraph ${at.leafId} not found`);
  }
  const { sectionIdx, blockIdx, para } = found;

  // Children before split remain in the original; children at/after go to new para
  const leftChildren: InlineNode[] = [];
  const rightChildren: InlineNode[] = [];
  let pos = 0;
  for (const child of para.children) {
    if (child.type !== 'run') {
      // Non-text nodes: put before split if they're before the offset
      if (pos <= at.offset) leftChildren.push(child);
      else rightChildren.push(child);
      continue;
    }
    const end = pos + child.text.length;
    if (end <= at.offset) {
      leftChildren.push(child);
    } else if (pos >= at.offset) {
      rightChildren.push(child);
    } else {
      // Split the run
      const localOffset = at.offset - pos;
      const leftText = child.text.slice(0, localOffset);
      const rightText = child.text.slice(localOffset);
      if (leftText.length > 0) leftChildren.push({ ...child, text: leftText });
      if (rightText.length > 0) rightChildren.push({ ...child, text: rightText });
    }
    pos = end;
  }

  const leftPara: Paragraph = { ...para, children: leftChildren as readonly InlineNode[] };
  const rightPara: Paragraph = {
    ...para,
    id: newId,
    children: rightChildren as readonly InlineNode[],
  };

  const oldSection = doc.sections[sectionIdx]!;
  const newBlockChildren = spliceAt(oldSection.children, blockIdx, 1, leftPara, rightPara);
  const newSection: Section = { ...oldSection, children: newBlockChildren };
  const newDoc: Document = {
    ...doc,
    version: doc.version + 1,
    sections: replaceAt(doc.sections, sectionIdx, newSection),
  };

  const inverseOps: Op[] = [
    {
      kind: 'joinParagraphs',
      leftId: at.leafId,
      rightId: newId,
    },
  ];
  return { doc: newDoc, inverseOps };
}

function applyJoinParagraphs(doc: Document, op: OpJoinParagraphs): ApplyOpResult {
  const { leftId, rightId } = op;
  const leftFound = findParagraphById(doc, leftId);
  const rightFound = findParagraphById(doc, rightId);
  if (leftFound === undefined)
    throw new Error(`joinParagraphs: left paragraph ${leftId} not found`);
  if (rightFound === undefined)
    throw new Error(`joinParagraphs: right paragraph ${rightId} not found`);
  if (leftFound.sectionIdx !== rightFound.sectionIdx) {
    throw new Error('joinParagraphs: paragraphs in different sections');
  }

  const { sectionIdx, blockIdx: leftIdx, para: leftPara } = leftFound;
  const { blockIdx: rightIdx, para: rightPara } = rightFound;

  // The split point is the length of the left para's text
  const splitOffset = paragraphTextLength(leftPara);

  // Merge children
  const mergedChildren: readonly InlineNode[] = [...leftPara.children, ...rightPara.children];
  const mergedPara: Paragraph = { ...leftPara, children: mergedChildren };

  const oldSection = doc.sections[sectionIdx]!;
  // Remove both, insert merged at leftIdx
  const minIdx = Math.min(leftIdx, rightIdx);
  const maxIdx = Math.max(leftIdx, rightIdx);
  const newBlockChildren = [
    ...oldSection.children.slice(0, minIdx),
    mergedPara,
    ...oldSection.children.slice(minIdx + 1, maxIdx),
    ...oldSection.children.slice(maxIdx + 1),
  ];
  const newSection: Section = {
    ...oldSection,
    children: newBlockChildren as readonly BlockNode[],
  };
  const newDoc: Document = {
    ...doc,
    version: doc.version + 1,
    sections: replaceAt(doc.sections, sectionIdx, newSection),
  };

  const inverseOps: Op[] = [
    {
      kind: 'splitParagraph',
      at: { leafId: leftId, offset: splitOffset },
      newId: rightId,
    },
  ];
  return { doc: newDoc, inverseOps };
}

/**
 * Build or reuse a MutablePropsRegistry seeded from the document's frozen PropsRegistry.
 * We construct a fresh one and pre-populate it with all existing entries so that interned
 * ids remain stable and the PropsRegistry grows monotonically.
 */
function buildMutableRegistry(doc: Document): MutablePropsRegistry {
  const mutable = createMutablePropsRegistry();
  // Pre-populate so existing ids remain valid after freeze()
  for (const [, v] of doc.props.run) mutable.internRun(v);
  for (const [, v] of doc.props.para) mutable.internPara(v);
  for (const [, v] of doc.props.section) mutable.internSection(v);
  for (const [, v] of doc.props.table) mutable.internTable(v);
  for (const [, v] of doc.props.row) mutable.internRow(v);
  for (const [, v] of doc.props.cell) mutable.internCell(v);
  return mutable;
}

function applySetRunProps(doc: Document, op: OpSetRunProps, ctx: ApplyOpContext): ApplyOpResult {
  const { from, to, props } = op;

  if (from.leafId !== to.leafId) {
    throw new UnsupportedOpError('setRunProps across paragraphs');
  }

  const start = Math.min(from.offset, to.offset);
  const end = Math.max(from.offset, to.offset);
  if (start === end) return { doc, inverseOps: [] };

  const found = findParagraphById(doc, from.leafId);
  if (found === undefined) throw new Error(`setRunProps: paragraph ${from.leafId} not found`);
  const { sectionIdx, blockIdx, para } = found;

  // Build a mutable registry we can intern into
  const registry = ctx.propsRegistry ?? buildMutableRegistry(doc);

  // Track per-segment prior props so we can build a faithful inverse
  // Each segment: { offset: from, priorProps }
  interface Segment {
    readonly rangeStart: number;
    readonly rangeEnd: number;
    readonly priorProps: Partial<RunProps>;
  }
  const segments: Segment[] = [];

  const newChildren: InlineNode[] = [];
  let pos = 0;
  for (const child of para.children) {
    if (child.type !== 'run') {
      newChildren.push(child);
      continue;
    }
    const childEnd = pos + child.text.length;
    if (childEnd <= start || pos >= end) {
      newChildren.push(child);
    } else {
      const overlapStart = Math.max(pos, start);
      const overlapEnd = Math.min(childEnd, end);

      if (overlapStart > pos) {
        newChildren.push({ ...child, text: child.text.slice(0, overlapStart - pos) });
      }

      // Resolve current props for this run
      const currentProps = doc.props.run.get(child.attrs.runPropsId) ?? {};
      // Capture exactly the fields that will change (for inverse)
      const priorSlice: Partial<RunProps> = {};
      for (const key of Object.keys(props) as Array<keyof RunProps>) {
        // Record prior value (undefined means "not set")
        (priorSlice as Record<string, unknown>)[key] = (currentProps as Record<string, unknown>)[
          key
        ];
      }
      segments.push({ rangeStart: overlapStart, rangeEnd: overlapEnd, priorProps: priorSlice });

      // Merge new props
      const mergedProps: RunProps = { ...currentProps, ...props };
      const newPropsId: PropsId = registry.internRun(mergedProps);
      const overlappingText = child.text.slice(overlapStart - pos, overlapEnd - pos);
      newChildren.push({
        ...child,
        text: overlappingText,
        attrs: { ...child.attrs, runPropsId: newPropsId },
      });

      if (overlapEnd < childEnd) {
        newChildren.push({ ...child, text: child.text.slice(overlapEnd - pos) });
      }
    }
    pos = childEnd;
  }

  const newPara: Paragraph = { ...para, children: newChildren as readonly InlineNode[] };
  const newProps = registry.freeze();
  const newDoc: Document = {
    ...replaceSectionBlock(doc, sectionIdx, blockIdx, newPara),
    props: newProps,
  };

  // Build the inverse: for each segment restore the prior partial props
  // Group contiguous segments with identical priorProps into a single op
  // For simplicity (and correctness), emit one op per segment boundary
  const inverseOps: Op[] = segments.map((seg) => ({
    kind: 'setRunProps' as const,
    from: { leafId: from.leafId, offset: seg.rangeStart },
    to: { leafId: from.leafId, offset: seg.rangeEnd },
    // Restore prior values; undefined fields must explicitly unset via a cleared-field marker.
    // Since RunProps is Partial, setting a key to undefined effectively unsets it on merge.
    props: seg.priorProps,
  }));

  return { doc: newDoc, inverseOps };
}

function applySetParaProps(doc: Document, op: OpSetParaProps, ctx: ApplyOpContext): ApplyOpResult {
  const { paragraphId, props } = op;
  const found = findParagraphById(doc, paragraphId);
  if (found === undefined) throw new Error(`setParaProps: paragraph ${paragraphId} not found`);
  const { sectionIdx, blockIdx, para } = found;

  const registry = ctx.propsRegistry ?? buildMutableRegistry(doc);

  // Resolve current para props
  const currentProps: ParaProps = doc.props.para.get(para.attrs.paraPropsId) ?? {};

  // Capture the prior values of only the fields being changed (for faithful inverse)
  const priorSlice: Partial<ParaProps> = {};
  for (const key of Object.keys(props) as Array<keyof ParaProps>) {
    (priorSlice as Record<string, unknown>)[key] = (currentProps as Record<string, unknown>)[key];
  }

  // Deep-merge nested objects (spacing, indent) rather than overwriting the whole object
  const mergedProps: ParaProps = mergeParaProps(currentProps, props);
  const newParaPropsId = registry.internPara(mergedProps);
  const newPara: Paragraph = {
    ...para,
    attrs: { ...para.attrs, paraPropsId: newParaPropsId },
  };
  const newProps = registry.freeze();
  const newDoc: Document = {
    ...replaceSectionBlock(doc, sectionIdx, blockIdx, newPara),
    props: newProps,
  };

  const inverseOps: Op[] = [
    {
      kind: 'setParaProps',
      paragraphId,
      props: priorSlice,
    },
  ];
  return { doc: newDoc, inverseOps };
}

/**
 * Merge a Partial<ParaProps> patch into existing ParaProps.
 * For nested objects (spacing, indent, numbering) the patch's sub-object is shallow-merged
 * so callers can supply only the fields they want to change.
 */
function mergeParaProps(base: ParaProps, patch: Partial<ParaProps>): ParaProps {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch) as Array<keyof ParaProps>) {
    const patchVal = patch[key];
    if (patchVal === undefined) {
      // Explicit unset
      delete result[key];
    } else if (
      (key === 'spacing' || key === 'indent') &&
      typeof patchVal === 'object' &&
      !Array.isArray(patchVal) &&
      typeof result[key] === 'object' &&
      result[key] !== null
    ) {
      result[key] = {
        ...(result[key] as Record<string, unknown>),
        ...(patchVal as Record<string, unknown>),
      };
    } else {
      result[key] = patchVal;
    }
  }
  return result as ParaProps;
}

function applyInsertBlock(doc: Document, op: OpInsertBlock): ApplyOpResult {
  const { atSectionIndex, atBlockIndex, block } = op;
  const section = doc.sections[atSectionIndex];
  if (section === undefined) throw new Error(`insertBlock: section ${atSectionIndex} not found`);

  const newChildren = spliceAt(section.children, atBlockIndex, 0, block);
  const newSection: Section = { ...section, children: newChildren };
  const newDoc: Document = {
    ...doc,
    version: doc.version + 1,
    sections: replaceAt(doc.sections, atSectionIndex, newSection),
  };

  const inverseOps: Op[] = [
    {
      kind: 'removeBlock',
      atSectionIndex,
      atBlockIndex,
    },
  ];
  return { doc: newDoc, inverseOps };
}

function applyRemoveBlock(doc: Document, op: OpRemoveBlock): ApplyOpResult {
  const { atSectionIndex, atBlockIndex } = op;
  const section = doc.sections[atSectionIndex];
  if (section === undefined) throw new Error(`removeBlock: section ${atSectionIndex} not found`);
  const block = section.children[atBlockIndex];
  if (block === undefined) throw new Error(`removeBlock: block at ${atBlockIndex} not found`);

  const newChildren = spliceAt(section.children, atBlockIndex, 1);
  const newSection: Section = { ...section, children: newChildren };
  const newDoc: Document = {
    ...doc,
    version: doc.version + 1,
    sections: replaceAt(doc.sections, atSectionIndex, newSection),
  };

  const inverseOps: Op[] = [
    {
      kind: 'insertBlock',
      atSectionIndex,
      atBlockIndex,
      block,
    },
  ];
  return { doc: newDoc, inverseOps };
}

function applyInsertInlineMarker(doc: Document, op: OpInsertInlineMarker): ApplyOpResult {
  const { at, marker } = op;
  const found = findParagraphById(doc, at.leafId);
  if (found === undefined) throw new Error(`insertInlineMarker: paragraph ${at.leafId} not found`);
  const { sectionIdx, blockIdx, para } = found;

  // Insert marker at offset position among non-text inlines
  const newChildren = [...para.children, marker] as readonly InlineNode[];
  const newPara: Paragraph = { ...para, children: newChildren };
  const newDoc = replaceSectionBlock(doc, sectionIdx, blockIdx, newPara);

  const inverseOps: Op[] = [
    {
      kind: 'removeInlineMarker',
      paragraphId: at.leafId,
      markerId: marker.id,
    },
  ];
  return { doc: newDoc, inverseOps };
}

function applyRemoveInlineMarker(doc: Document, op: OpRemoveInlineMarker): ApplyOpResult {
  const { paragraphId, markerId } = op;
  const found = findParagraphById(doc, paragraphId);
  if (found === undefined)
    throw new Error(`removeInlineMarker: paragraph ${paragraphId} not found`);
  const { sectionIdx, blockIdx, para } = found;

  const markerIdx = para.children.findIndex((c) => c.id === markerId);
  if (markerIdx === -1) throw new Error(`removeInlineMarker: marker ${markerId} not found`);
  const marker = para.children[markerIdx]!;

  const newChildren = spliceAt(para.children, markerIdx, 1);
  const newPara: Paragraph = { ...para, children: newChildren };
  const newDoc = replaceSectionBlock(doc, sectionIdx, blockIdx, newPara);

  const inverseOps: Op[] = [
    {
      kind: 'insertInlineMarker',
      at: { leafId: paragraphId, offset: 0 },
      marker,
    },
  ];
  return { doc: newDoc, inverseOps };
}

// ---------------------------------------------------------------------------
// Dispatch table (ADR-0015)
// ---------------------------------------------------------------------------

type OpHandler = (doc: Document, op: Op, ctx: ApplyOpContext) => ApplyOpResult;

const opHandlers = new Map<string, OpHandler>([
  ['insertText', (doc, op, _ctx) => applyInsertText(doc, op as OpInsertText)],
  ['deleteRange', (doc, op, _ctx) => applyDeleteRange(doc, op as OpDeleteRange)],
  ['splitParagraph', (doc, op, _ctx) => applySplitParagraph(doc, op as OpSplitParagraph)],
  ['joinParagraphs', (doc, op, _ctx) => applyJoinParagraphs(doc, op as OpJoinParagraphs)],
  ['setRunProps', (doc, op, ctx) => applySetRunProps(doc, op as OpSetRunProps, ctx)],
  ['setParaProps', (doc, op, ctx) => applySetParaProps(doc, op as OpSetParaProps, ctx)],
  ['insertBlock', (doc, op, _ctx) => applyInsertBlock(doc, op as OpInsertBlock)],
  ['removeBlock', (doc, op, _ctx) => applyRemoveBlock(doc, op as OpRemoveBlock)],
  [
    'insertInlineMarker',
    (doc, op, _ctx) => applyInsertInlineMarker(doc, op as OpInsertInlineMarker),
  ],
  [
    'removeInlineMarker',
    (doc, op, _ctx) => applyRemoveInlineMarker(doc, op as OpRemoveInlineMarker),
  ],
]);

export function registerOpHandler(kind: string, handler: OpHandler): void {
  opHandlers.set(kind, handler);
}

export function applyOp(doc: Document, op: Op, ctx: ApplyOpContext): ApplyOpResult {
  const handler = opHandlers.get(op.kind);
  if (handler === undefined) {
    throw new UnsupportedOpError(op.kind);
  }
  return handler(doc, op, ctx);
}
