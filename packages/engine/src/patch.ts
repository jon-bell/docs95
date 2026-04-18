import type { Document, NodeId } from '@word/domain';
import type { Op } from './op.js';
import { applyOp, type ApplyOpContext } from './apply-op.js';

export interface Patch {
  readonly ops: readonly Op[];
}

export interface PatchResult {
  readonly doc: Document;
  readonly inverse: Patch;
}

/**
 * Apply a Patch to a Document.
 *
 * Loops ops in forward order, accumulating inverse ops in reverse. Each op
 * handler uses structural sharing (no deep clone), returning only a new spine
 * along the mutation path. The inverse Patch's ops are the per-op inverses in
 * reversed sequence, per standard undo semantics.
 */
export function applyPatch(doc: Document, patch: Patch, ctx?: ApplyOpContext): PatchResult {
  const opCtx: ApplyOpContext = ctx ?? {
    idGen: {
      newId: () => {
        // Fallback: should always be provided by caller
        const bytes = new Uint8Array(16);
        for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
        return Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('') as NodeId;
      },
    },
  };

  let currentDoc = doc;
  const inverseOpsReversed: Op[] = [];

  for (const op of patch.ops) {
    const result = applyOp(currentDoc, op, opCtx);
    currentDoc = result.doc;
    // Collect inverse ops; they'll be reversed at the end
    for (const inv of result.inverseOps) {
      inverseOpsReversed.push(inv);
    }
  }

  // The inverse patch is the per-op inverses in reversed order
  const inverseOps = inverseOpsReversed.reverse();

  return {
    doc: currentDoc,
    inverse: { ops: inverseOps },
  };
}
