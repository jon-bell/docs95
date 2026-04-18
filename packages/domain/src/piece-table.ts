/**
 * Piece table for paragraph text storage. See ADR-0003.
 *
 * Architecture: append-only `added` buffer + immutable `original` buffer
 * + an array of `Piece` entries (structural sharing — every mutating op
 * returns a new PieceTable, sharing unchanged Piece objects).
 *
 * Offsets throughout are **UTF-16 code units**, matching JavaScript's
 * native string indexing. Surrogate pairs (U+D800–U+DFFF, length 2) are
 * kept intact: we never split in the middle of a pair.
 */

export interface Piece {
  readonly buffer: 'original' | 'added';
  readonly start: number;
  readonly length: number;
}

export interface PieceTableSnapshot {
  readonly original: string;
  readonly added: string;
  readonly pieces: readonly Piece[];
  readonly length: number;
}

export interface PieceTable {
  readonly length: number;
  toString(): string;
  insert(offset: number, text: string): PieceTable;
  delete(offset: number, count: number): PieceTable;
  snapshot(): PieceTableSnapshot;
}

/** True when the code unit at index i is a high surrogate (first half of a pair). */
function isHighSurrogate(s: string, i: number): boolean {
  const c = s.charCodeAt(i);
  return c >= 0xd800 && c <= 0xdbff;
}

/**
 * Advance `offset` forward past any split surrogate pair in `s` at that
 * position.  We only ever need this guard on cut points produced by
 * arithmetic — surrogate pairs inserted by the caller are already
 * well-formed.
 */
function safeOffset(s: string, offset: number): number {
  if (offset > 0 && offset < s.length && isHighSurrogate(s, offset - 1)) {
    return offset + 1;
  }
  return offset;
}

function bufferSlice(original: string, added: string, piece: Piece): string {
  const buf = piece.buffer === 'original' ? original : added;
  return buf.slice(piece.start, piece.start + piece.length);
}

class PieceTableImpl implements PieceTable {
  readonly length: number;

  constructor(
    private readonly original: string,
    private readonly added: string,
    private readonly pieces: readonly Piece[],
  ) {
    let len = 0;
    for (const p of pieces) {
      len += p.length;
    }
    this.length = len;
  }

  toString(): string {
    if (this.pieces.length === 0) return '';
    const parts: string[] = [];
    for (const p of this.pieces) {
      parts.push(bufferSlice(this.original, this.added, p));
    }
    return parts.join('');
  }

  insert(offset: number, text: string): PieceTable {
    if (text.length === 0) return this;

    const clampedOffset = Math.max(0, Math.min(offset, this.length));
    const newAdded = this.added + text;
    const newPiece: Piece = {
      buffer: 'added',
      start: this.added.length,
      length: text.length,
    };

    if (clampedOffset === 0) {
      return new PieceTableImpl(this.original, newAdded, [newPiece, ...this.pieces]);
    }

    if (clampedOffset === this.length) {
      return new PieceTableImpl(this.original, newAdded, [...this.pieces, newPiece]);
    }

    // Find the piece containing the insertion offset.
    const { pieceIdx, localOffset } = this.findPieceAt(clampedOffset);
    const target = this.pieces[pieceIdx];
    if (target === undefined) {
      return new PieceTableImpl(this.original, newAdded, [...this.pieces, newPiece]);
    }

    // Guard against splitting a surrogate pair.
    const targetText = bufferSlice(this.original, this.added, target);
    const safeLocal = safeOffset(targetText, localOffset);

    if (safeLocal === 0) {
      // Insert before this piece.
      const before = this.pieces.slice(0, pieceIdx);
      const after = this.pieces.slice(pieceIdx);
      return new PieceTableImpl(this.original, newAdded, [...before, newPiece, ...after]);
    }

    if (safeLocal >= target.length) {
      // Insert after this piece.
      const before = this.pieces.slice(0, pieceIdx + 1);
      const after = this.pieces.slice(pieceIdx + 1);
      return new PieceTableImpl(this.original, newAdded, [...before, newPiece, ...after]);
    }

    // Split the target piece at safeLocal.
    const left: Piece = { buffer: target.buffer, start: target.start, length: safeLocal };
    const right: Piece = {
      buffer: target.buffer,
      start: target.start + safeLocal,
      length: target.length - safeLocal,
    };
    const before = this.pieces.slice(0, pieceIdx);
    const after = this.pieces.slice(pieceIdx + 1);
    return new PieceTableImpl(this.original, newAdded, [
      ...before,
      left,
      newPiece,
      right,
      ...after,
    ]);
  }

  delete(offset: number, count: number): PieceTable {
    if (count <= 0) return this;

    const start = Math.max(0, Math.min(offset, this.length));
    const end = Math.max(0, Math.min(offset + count, this.length));
    if (start >= end) return this;

    const newPieces: Piece[] = [];
    let pos = 0;

    for (const piece of this.pieces) {
      const pieceEnd = pos + piece.length;

      if (pieceEnd <= start || pos >= end) {
        // Entirely outside the delete range.
        newPieces.push(piece);
      } else if (pos >= start && pieceEnd <= end) {
        // Entirely inside — drop it.
      } else {
        // Partially overlapping — keep the non-deleted portions.
        if (pos < start) {
          // Keep the prefix, guard surrogate.
          const localEnd = safeOffset(bufferSlice(this.original, this.added, piece), start - pos);
          if (localEnd > 0) {
            newPieces.push({ buffer: piece.buffer, start: piece.start, length: localEnd });
          }
        }
        if (pieceEnd > end) {
          // Keep the suffix, guard surrogate.
          const localStart = safeOffset(bufferSlice(this.original, this.added, piece), end - pos);
          if (localStart < piece.length) {
            newPieces.push({
              buffer: piece.buffer,
              start: piece.start + localStart,
              length: piece.length - localStart,
            });
          }
        }
      }
      pos = pieceEnd;
    }

    return new PieceTableImpl(this.original, this.added, newPieces);
  }

  snapshot(): PieceTableSnapshot {
    return {
      original: this.original,
      added: this.added,
      pieces: this.pieces,
      length: this.length,
    };
  }

  /**
   * Locate which piece contains the given logical offset and the offset
   * within that piece. Returns pieceIdx === pieces.length when offset falls
   * exactly at the end (caller appends).
   */
  private findPieceAt(offset: number): { pieceIdx: number; localOffset: number } {
    let pos = 0;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      if (p === undefined) break;
      const next = pos + p.length;
      if (offset < next || (offset === next && i === this.pieces.length - 1)) {
        return { pieceIdx: i, localOffset: offset - pos };
      }
      pos = next;
    }
    return { pieceIdx: this.pieces.length, localOffset: 0 };
  }
}

export const createPieceTable = (initial = ''): PieceTable => {
  if (initial.length === 0) {
    return new PieceTableImpl('', '', []);
  }
  const piece: Piece = { buffer: 'original', start: 0, length: initial.length };
  return new PieceTableImpl(initial, '', [piece]);
};
