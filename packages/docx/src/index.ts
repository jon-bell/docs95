// @word/docx — ECMA-376 Transitional reader/writer, two-stage AST ↔ Domain.
// Fleet agent implements. Sealed boundary: nothing else understands OOXML.

import type { Document } from '@word/domain';
import { readDocx as readDocxImpl } from './read-docx.js';
import { writeDocx as writeDocxImpl } from './write-docx.js';

export interface ReadDocxOptions {
  /** Zip-bomb defenses: max uncompressed bytes / ratio. */
  readonly maxUncompressedBytes?: number;
  readonly maxCompressionRatio?: number;
  /** Abort read if more than this many warnings accrue. */
  readonly warningLimit?: number;
}

export interface ReadDocxResult {
  readonly doc: Document;
  readonly warnings: readonly DocxWarning[];
}

export interface WriteDocxOptions {
  /** Deterministic writes for tests and diffs. */
  readonly deterministic?: boolean;
  /** ISO timestamp pinned into meta when deterministic=true. */
  readonly pinnedTimestamp?: string;
}

export interface DocxWarning {
  readonly code: string;
  readonly message: string;
  readonly part?: string;
}

export async function readDocx(
  bytes: Uint8Array,
  opts: ReadDocxOptions = {},
): Promise<ReadDocxResult> {
  return readDocxImpl(bytes, opts);
}

export async function writeDocx(doc: Document, opts: WriteDocxOptions = {}): Promise<Uint8Array> {
  return writeDocxImpl(doc, opts);
}
