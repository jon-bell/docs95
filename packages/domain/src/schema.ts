import type { Document } from './document.js';
import type { NodeId } from './node.js';
import type { BlockNode, Cell, Paragraph, Row, Table } from './block.js';
import type { BookmarkMarker, CommentMarker, InlineNode } from './inline.js';
import type { PropsId, PropsRegistry } from './props.js';

/** Schema violations returned by validateDocument(). */
export interface SchemaIssue {
  readonly path: readonly (string | number)[];
  readonly code:
    | 'empty-section'
    | 'empty-paragraph-children'
    | 'orphan-ref'
    | 'duplicate-node-id'
    | 'bad-props-id'
    | 'bad-run-text'
    | 'bad-tree-shape'
    | 'marker-mismatched'
    | 'unknown';
  readonly message: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly issues: readonly SchemaIssue[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type Issues = SchemaIssue[];

function issue(
  issues: Issues,
  path: readonly (string | number)[],
  code: SchemaIssue['code'],
  message: string,
): void {
  issues.push({ path, code, message });
}

function checkPropsId(
  issues: Issues,
  path: readonly (string | number)[],
  id: PropsId,
  mapName: keyof PropsRegistry,
  registry: PropsRegistry,
): void {
  const map = registry[mapName] as ReadonlyMap<PropsId, unknown>;
  if (!map.has(id)) {
    issue(issues, path, 'bad-props-id', `PropsId "${id}" not found in registry.${mapName}`);
  }
}

function collectInlineIds(
  inline: InlineNode,
  seenIds: Set<string>,
  issues: Issues,
  path: readonly (string | number)[],
  doc: Document,
): void {
  if (seenIds.has(inline.id)) {
    issue(issues, path, 'duplicate-node-id', `Duplicate NodeId "${inline.id}"`);
  } else {
    seenIds.add(inline.id);
  }

  switch (inline.type) {
    case 'run': {
      // Validate that the run text is a valid UTF-16 string (no lone surrogates).
      for (let i = 0; i < inline.text.length; i++) {
        const c = inline.text.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff) {
          const next = inline.text.charCodeAt(i + 1);
          if (!(next >= 0xdc00 && next <= 0xdfff)) {
            issue(issues, [...path, 'text'], 'bad-run-text', 'Lone high surrogate in run text');
          }
          i++;
        } else if (c >= 0xdc00 && c <= 0xdfff) {
          issue(issues, [...path, 'text'], 'bad-run-text', 'Lone low surrogate in run text');
        }
      }
      break;
    }
    case 'fieldRun': {
      if (!doc.fields.has(inline.attrs.fieldId)) {
        issue(
          issues,
          [...path, 'attrs', 'fieldId'],
          'orphan-ref',
          `FieldRun references unknown fieldId "${inline.attrs.fieldId}"`,
        );
      }
      for (let ci = 0; ci < inline.children.length; ci++) {
        const child = inline.children[ci];
        if (child !== undefined) {
          collectInlineIds(child, seenIds, issues, [...path, 'children', ci], doc);
        }
      }
      break;
    }
    case 'hyperlinkRun': {
      if (!doc.hyperlinks.has(inline.attrs.hyperlinkId)) {
        issue(
          issues,
          [...path, 'attrs', 'hyperlinkId'],
          'orphan-ref',
          `HyperlinkRun references unknown hyperlinkId "${inline.attrs.hyperlinkId}"`,
        );
      }
      for (let ci = 0; ci < inline.children.length; ci++) {
        const child = inline.children[ci];
        if (child !== undefined) {
          collectInlineIds(child, seenIds, issues, [...path, 'children', ci], doc);
        }
      }
      break;
    }
    case 'drawingRun': {
      if (!doc.drawings.has(inline.attrs.drawingId)) {
        issue(
          issues,
          [...path, 'attrs', 'drawingId'],
          'orphan-ref',
          `DrawingRun references unknown drawingId "${inline.attrs.drawingId}"`,
        );
      }
      break;
    }
    case 'commentMarker': {
      if (!doc.comments.has(inline.attrs.commentId)) {
        issue(
          issues,
          [...path, 'attrs', 'commentId'],
          'orphan-ref',
          `CommentMarker references unknown commentId "${inline.attrs.commentId}"`,
        );
      }
      break;
    }
    case 'bookmarkMarker': {
      if (!doc.bookmarks.has(inline.attrs.bookmarkId)) {
        issue(
          issues,
          [...path, 'attrs', 'bookmarkId'],
          'orphan-ref',
          `BookmarkMarker references unknown bookmarkId "${inline.attrs.bookmarkId}"`,
        );
      }
      break;
    }
    case 'footnoteMarker': {
      if (!doc.footnotes.has(inline.attrs.footnoteId)) {
        issue(
          issues,
          [...path, 'attrs', 'footnoteId'],
          'orphan-ref',
          `FootnoteMarker references unknown footnoteId "${inline.attrs.footnoteId}"`,
        );
      }
      break;
    }
    case 'endnoteMarker': {
      if (!doc.endnotes.has(inline.attrs.endnoteId)) {
        issue(
          issues,
          [...path, 'attrs', 'endnoteId'],
          'orphan-ref',
          `EndnoteMarker references unknown endnoteId "${inline.attrs.endnoteId}"`,
        );
      }
      break;
    }
    case 'break':
      break;
    default: {
      // exhaustiveness guard
      const _: never = inline;
      void _;
    }
  }
}

function checkParagraph(
  para: Paragraph,
  seenIds: Set<string>,
  issues: Issues,
  path: readonly (string | number)[],
  doc: Document,
): void {
  if (seenIds.has(para.id)) {
    issue(issues, path, 'duplicate-node-id', `Duplicate NodeId "${para.id}"`);
  } else {
    seenIds.add(para.id);
  }

  checkPropsId(
    issues,
    [...path, 'attrs', 'paraPropsId'],
    para.attrs.paraPropsId,
    'para',
    doc.props,
  );

  // Gather comment/bookmark markers for pairing validation.
  const commentStartSeen = new Set<NodeId>();
  const commentEndSeen = new Set<NodeId>();
  const bookmarkStartSeen = new Set<NodeId>();
  const bookmarkEndSeen = new Set<NodeId>();

  for (let i = 0; i < para.children.length; i++) {
    const child = para.children[i];
    if (child === undefined) continue;
    collectInlineIds(child, seenIds, issues, [...path, 'children', i], doc);

    if (child.type === 'commentMarker') {
      const cm = child as CommentMarker;
      if (cm.attrs.side === 'start') commentStartSeen.add(cm.attrs.commentId);
      else if (cm.attrs.side === 'end') commentEndSeen.add(cm.attrs.commentId);
    }
    if (child.type === 'bookmarkMarker') {
      const bm = child as BookmarkMarker;
      if (bm.attrs.side === 'start') bookmarkStartSeen.add(bm.attrs.bookmarkId);
      else if (bm.attrs.side === 'end') bookmarkEndSeen.add(bm.attrs.bookmarkId);
    }
  }

  // Marker pairing: every start must have a matching end within this paragraph.
  for (const id of commentStartSeen) {
    if (!commentEndSeen.has(id)) {
      issue(
        issues,
        path,
        'marker-mismatched',
        `CommentMarker for commentId "${id}" has start but no end in this paragraph`,
      );
    }
  }
  for (const id of commentEndSeen) {
    if (!commentStartSeen.has(id)) {
      issue(
        issues,
        path,
        'marker-mismatched',
        `CommentMarker for commentId "${id}" has end but no start in this paragraph`,
      );
    }
  }
  for (const id of bookmarkStartSeen) {
    if (!bookmarkEndSeen.has(id)) {
      issue(
        issues,
        path,
        'marker-mismatched',
        `BookmarkMarker for bookmarkId "${id}" has start but no end in this paragraph`,
      );
    }
  }
  for (const id of bookmarkEndSeen) {
    if (!bookmarkStartSeen.has(id)) {
      issue(
        issues,
        path,
        'marker-mismatched',
        `BookmarkMarker for bookmarkId "${id}" has end but no start in this paragraph`,
      );
    }
  }
}

function checkCell(
  cell: Cell,
  seenIds: Set<string>,
  issues: Issues,
  path: readonly (string | number)[],
  doc: Document,
): void {
  if (seenIds.has(cell.id)) {
    issue(issues, path, 'duplicate-node-id', `Duplicate NodeId "${cell.id}"`);
  } else {
    seenIds.add(cell.id);
  }
  checkPropsId(
    issues,
    [...path, 'attrs', 'cellPropsId'],
    cell.attrs.cellPropsId,
    'cell',
    doc.props,
  );
  checkBlocks(cell.children, seenIds, issues, [...path, 'children'], doc);
}

function checkRow(
  row: Row,
  seenIds: Set<string>,
  issues: Issues,
  path: readonly (string | number)[],
  doc: Document,
): void {
  if (seenIds.has(row.id)) {
    issue(issues, path, 'duplicate-node-id', `Duplicate NodeId "${row.id}"`);
  } else {
    seenIds.add(row.id);
  }
  checkPropsId(issues, [...path, 'attrs', 'rowPropsId'], row.attrs.rowPropsId, 'row', doc.props);
  for (let i = 0; i < row.children.length; i++) {
    const cell = row.children[i];
    if (cell !== undefined) {
      checkCell(cell, seenIds, issues, [...path, 'children', i], doc);
    }
  }
}

function checkTable(
  table: Table,
  seenIds: Set<string>,
  issues: Issues,
  path: readonly (string | number)[],
  doc: Document,
): void {
  if (seenIds.has(table.id)) {
    issue(issues, path, 'duplicate-node-id', `Duplicate NodeId "${table.id}"`);
  } else {
    seenIds.add(table.id);
  }
  checkPropsId(
    issues,
    [...path, 'attrs', 'tablePropsId'],
    table.attrs.tablePropsId,
    'table',
    doc.props,
  );
  for (let i = 0; i < table.children.length; i++) {
    const row = table.children[i];
    if (row !== undefined) {
      checkRow(row, seenIds, issues, [...path, 'children', i], doc);
    }
  }
}

function checkBlocks(
  blocks: readonly BlockNode[],
  seenIds: Set<string>,
  issues: Issues,
  path: readonly (string | number)[],
  doc: Document,
): void {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block === undefined) continue;
    if (block.type === 'paragraph') {
      checkParagraph(block, seenIds, issues, [...path, i], doc);
    } else {
      checkTable(block, seenIds, issues, [...path, i], doc);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates a Document's structural invariants:
 * - Every NodeId unique across tree and all side stores.
 * - Every paraPropsId / runPropsId / etc. resolves in PropsRegistry.
 * - No empty sections (each section has ≥1 block).
 * - Inline marker-pair sides match within each paragraph.
 * - All reference ids (commentId, bookmarkId, fieldId, …) exist in their
 *   respective side stores.
 */
export const validateDocument = (doc: Document): ValidationResult => {
  const issues: Issues = [];
  const seenIds = new Set<string>();

  // Document root id.
  seenIds.add(doc.id);

  // Default props must exist.
  checkPropsId(issues, ['defaults', 'runPropsId'], doc.defaults.runPropsId, 'run', doc.props);
  checkPropsId(issues, ['defaults', 'paraPropsId'], doc.defaults.paraPropsId, 'para', doc.props);

  // Sections.
  for (let si = 0; si < doc.sections.length; si++) {
    const section = doc.sections[si];
    if (section === undefined) continue;
    const sPath = ['sections', si] as const;

    if (seenIds.has(section.id)) {
      issue(issues, sPath, 'duplicate-node-id', `Duplicate NodeId "${section.id}"`);
    } else {
      seenIds.add(section.id);
    }

    checkPropsId(
      issues,
      [...sPath, 'attrs', 'sectionPropsId'],
      section.attrs.sectionPropsId,
      'section',
      doc.props,
    );

    if (section.children.length === 0) {
      issue(issues, sPath, 'empty-section', `Section at index ${si} has no blocks`);
    }

    checkBlocks(section.children, seenIds, issues, [...sPath, 'children'], doc);
  }

  // Side stores: validate their ids are unique and their internal refs resolve.
  for (const [id, footnote] of doc.footnotes) {
    if (seenIds.has(footnote.id)) {
      issue(issues, ['footnotes', id], 'duplicate-node-id', `Duplicate NodeId "${footnote.id}"`);
    } else {
      seenIds.add(footnote.id);
    }
    checkBlocks(footnote.children, seenIds, issues, ['footnotes', id, 'children'], doc);
  }

  for (const [id, endnote] of doc.endnotes) {
    if (seenIds.has(endnote.id)) {
      issue(issues, ['endnotes', id], 'duplicate-node-id', `Duplicate NodeId "${endnote.id}"`);
    } else {
      seenIds.add(endnote.id);
    }
    checkBlocks(endnote.children, seenIds, issues, ['endnotes', id, 'children'], doc);
  }

  for (const [id, comment] of doc.comments) {
    if (seenIds.has(comment.id)) {
      issue(issues, ['comments', id], 'duplicate-node-id', `Duplicate NodeId "${comment.id}"`);
    } else {
      seenIds.add(comment.id);
    }
    checkBlocks(comment.children, seenIds, issues, ['comments', id, 'children'], doc);
  }

  for (const [id, bookmark] of doc.bookmarks) {
    if (seenIds.has(bookmark.id)) {
      issue(issues, ['bookmarks', id], 'duplicate-node-id', `Duplicate NodeId "${bookmark.id}"`);
    } else {
      seenIds.add(bookmark.id);
    }
  }

  for (const [id, hyperlink] of doc.hyperlinks) {
    if (seenIds.has(hyperlink.id)) {
      issue(issues, ['hyperlinks', id], 'duplicate-node-id', `Duplicate NodeId "${hyperlink.id}"`);
    } else {
      seenIds.add(hyperlink.id);
    }
  }

  for (const [id, drawing] of doc.drawings) {
    if (seenIds.has(drawing.id)) {
      issue(issues, ['drawings', id], 'duplicate-node-id', `Duplicate NodeId "${drawing.id}"`);
    } else {
      seenIds.add(drawing.id);
    }
    if (drawing.imageId !== undefined && !doc.images.has(drawing.imageId)) {
      issue(
        issues,
        ['drawings', id, 'imageId'],
        'orphan-ref',
        `Drawing "${id}" references unknown imageId "${drawing.imageId}"`,
      );
    }
  }

  for (const [id, image] of doc.images) {
    if (seenIds.has(image.id)) {
      issue(issues, ['images', id], 'duplicate-node-id', `Duplicate NodeId "${image.id}"`);
    } else {
      seenIds.add(image.id);
    }
  }

  for (const [id, field] of doc.fields) {
    if (seenIds.has(field.id)) {
      issue(issues, ['fields', id], 'duplicate-node-id', `Duplicate NodeId "${field.id}"`);
    } else {
      seenIds.add(field.id);
    }
  }

  return { ok: issues.length === 0, issues };
};
