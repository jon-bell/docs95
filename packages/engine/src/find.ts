/**
 * Find service: scan paragraphs in document order to locate text matches.
 *
 * Ranges are reported at paragraph granularity ({leafId: paragraphId, offset: charOffset}).
 * Honours caseSensitive, wholeWord, and regex options.
 */
import type { Document, IdPosition, IdRange, NodeId, Paragraph, Run } from '@word/domain';

export type { IdRange };

export interface FindOptions {
  readonly query: string;
  readonly caseSensitive?: boolean;
  readonly wholeWord?: boolean;
  readonly regex?: boolean;
}

export interface FindResult {
  readonly range: IdRange;
  readonly paragraphId: NodeId;
  /** A short excerpt surrounding the match. */
  readonly snippet: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SNIPPET_CONTEXT = 20;

function buildSnippet(text: string, matchStart: number, matchEnd: number): string {
  const before = text.slice(Math.max(0, matchStart - SNIPPET_CONTEXT), matchStart);
  const match = text.slice(matchStart, matchEnd);
  const after = text.slice(matchEnd, Math.min(text.length, matchEnd + SNIPPET_CONTEXT));
  return before + match + after;
}

function buildRegex(opts: FindOptions): RegExp {
  const source = opts.regex === true ? opts.query : escapeRegex(opts.query);
  const withBoundary = opts.wholeWord === true ? `\\b${source}\\b` : source;
  const flags = opts.caseSensitive === true ? 'gd' : 'gid';
  // 'd' flag (hasIndices) not universally available; fall back without it
  try {
    return new RegExp(withBoundary, flags);
  } catch {
    return new RegExp(withBoundary, opts.caseSensitive === true ? 'g' : 'gi');
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function paragraphText(para: Paragraph): string {
  return para.children
    .filter((c): c is Run => c.type === 'run')
    .map((r) => r.text)
    .join('');
}

interface ParagraphEntry {
  readonly id: NodeId;
  readonly text: string;
}

function collectParagraphs(doc: Document): readonly ParagraphEntry[] {
  const result: ParagraphEntry[] = [];
  for (const section of doc.sections) {
    for (const block of section.children) {
      if (block.type === 'paragraph') {
        result.push({ id: block.id, text: paragraphText(block as Paragraph) });
      }
    }
  }
  return result;
}

function matchesInParagraph(entry: ParagraphEntry, regex: RegExp): readonly FindResult[] {
  const results: FindResult[] = [];
  let m: RegExpExecArray | null;
  regex.lastIndex = 0;
  while ((m = regex.exec(entry.text)) !== null) {
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    results.push({
      range: {
        anchor: { leafId: entry.id, offset: matchStart },
        focus: { leafId: entry.id, offset: matchEnd },
      },
      paragraphId: entry.id,
      snippet: buildSnippet(entry.text, matchStart, matchEnd),
    });
    // Prevent infinite loop on zero-length match
    if (m[0].length === 0) regex.lastIndex++;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Find all occurrences of the query across the entire document. */
export function findAll(doc: Document, opts: FindOptions): readonly FindResult[] {
  if (opts.query.length === 0) return [];
  const regex = buildRegex(opts);
  const paragraphs = collectParagraphs(doc);
  const results: FindResult[] = [];
  for (const entry of paragraphs) {
    for (const r of matchesInParagraph(entry, regex)) {
      results.push(r);
    }
  }
  return results;
}

/** Find the next occurrence after `fromPos` (exclusive). Wraps around to the start. */
export function findNext(
  doc: Document,
  fromPos: IdPosition,
  opts: FindOptions,
): FindResult | undefined {
  const all = findAll(doc, opts);
  if (all.length === 0) return undefined;

  const paragraphs = collectParagraphs(doc);
  const paraIndex = new Map<string, number>();
  for (let i = 0; i < paragraphs.length; i++) {
    paraIndex.set(paragraphs[i]!.id, i);
  }

  const fromParaIdx = paraIndex.get(fromPos.leafId) ?? 0;

  // Find the first result that is strictly after fromPos
  for (const result of all) {
    const rParaIdx = paraIndex.get(result.paragraphId) ?? 0;
    if (rParaIdx > fromParaIdx) return result;
    if (rParaIdx === fromParaIdx && result.range.anchor.offset > fromPos.offset) return result;
  }
  // Wrap to start
  return all[0];
}

/** Find the previous occurrence before `fromPos` (exclusive). Wraps around to the end. */
export function findPrev(
  doc: Document,
  fromPos: IdPosition,
  opts: FindOptions,
): FindResult | undefined {
  const all = findAll(doc, opts);
  if (all.length === 0) return undefined;

  const paragraphs = collectParagraphs(doc);
  const paraIndex = new Map<string, number>();
  for (let i = 0; i < paragraphs.length; i++) {
    paraIndex.set(paragraphs[i]!.id, i);
  }

  const fromParaIdx = paraIndex.get(fromPos.leafId) ?? 0;

  // Find the last result that is strictly before fromPos (scan in reverse)
  for (let i = all.length - 1; i >= 0; i--) {
    const result = all[i]!;
    const rParaIdx = paraIndex.get(result.paragraphId) ?? 0;
    if (rParaIdx < fromParaIdx) return result;
    if (rParaIdx === fromParaIdx && result.range.focus.offset < fromPos.offset) return result;
  }
  // Wrap to end
  return all[all.length - 1];
}
