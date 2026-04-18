import type { Document } from './document.js';
import type { BlockNode, Paragraph } from './block.js';
import type { InlineNode } from './inline.js';
import type { NodeId } from './node.js';

/** A path from the document root to a Paragraph, expressed as indices. */
export interface ParagraphPath {
  readonly sectionIdx: number;
  readonly blockPath: readonly number[]; // nested for table cells
}

// ---------------------------------------------------------------------------
// walkInlines
// ---------------------------------------------------------------------------

/**
 * Iterates over all inline nodes within a paragraph's children in document
 * order, recursing into HyperlinkRun and FieldRun children.
 */
export function* walkInlines(para: Paragraph): Generator<InlineNode> {
  for (const child of para.children) {
    yield child;
    if (child.type === 'hyperlinkRun' || child.type === 'fieldRun') {
      for (const grandchild of child.children) {
        yield grandchild;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// walkBlocks (document-order DFS)
// ---------------------------------------------------------------------------

/**
 * Iterates over every BlockNode in document order, descending into table
 * cells.
 */
export function* walkBlocks(doc: Document): Generator<BlockNode> {
  for (const section of doc.sections) {
    yield* walkBlockArray(section.children);
  }
}

function* walkBlockArray(blocks: readonly BlockNode[]): Generator<BlockNode> {
  for (const block of blocks) {
    yield block;
    if (block.type === 'table') {
      for (const row of block.children) {
        for (const cell of row.children) {
          yield* walkBlockArray(cell.children);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// allParagraphs
// ---------------------------------------------------------------------------

/** Returns every Paragraph in document order, including those inside tables. */
export function allParagraphs(doc: Document): readonly Paragraph[] {
  const result: Paragraph[] = [];
  for (const block of walkBlocks(doc)) {
    if (block.type === 'paragraph') {
      result.push(block);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// findParagraph
// ---------------------------------------------------------------------------

/** Finds the first Paragraph with the given id, or undefined if not found. */
export function findParagraph(doc: Document, id: NodeId): Paragraph | undefined {
  for (const block of walkBlocks(doc)) {
    if (block.type === 'paragraph' && block.id === id) {
      return block;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// paragraphPathForId
// ---------------------------------------------------------------------------

/**
 * Returns the path (section index + nested block indices) to the paragraph
 * with the given id, or undefined if not found.
 *
 * The `blockPath` is a sequence of indices that can be used to navigate from
 * `doc.sections[sectionIdx].children` down to the paragraph.  For paragraphs
 * that are direct children of a section the path has one element.  For
 * paragraphs inside table cells the path grows by three elements per level of
 * nesting (tableIdx, rowIdx, cellIdx, then blockIdx within the cell).
 */
export function paragraphPathForId(doc: Document, id: NodeId): ParagraphPath | undefined {
  for (let si = 0; si < doc.sections.length; si++) {
    const section = doc.sections[si];
    if (section === undefined) continue;
    const blockPath = findInBlocks(section.children, id, []);
    if (blockPath !== undefined) {
      return { sectionIdx: si, blockPath };
    }
  }
  return undefined;
}

function findInBlocks(
  blocks: readonly BlockNode[],
  id: NodeId,
  prefix: readonly number[],
): readonly number[] | undefined {
  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    if (block === undefined) continue;
    const currentPath = [...prefix, bi];
    if (block.type === 'paragraph') {
      if (block.id === id) return currentPath;
    } else {
      for (let ri = 0; ri < block.children.length; ri++) {
        const row = block.children[ri];
        if (row === undefined) continue;
        for (let ci = 0; ci < row.children.length; ci++) {
          const cell = row.children[ci];
          if (cell === undefined) continue;
          const found = findInBlocks(cell.children, id, [...currentPath, ri, ci]);
          if (found !== undefined) return found;
        }
      }
    }
  }
  return undefined;
}
