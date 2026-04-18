/**
 * Replace-all command: finds every match and replaces them in a single transaction.
 *
 * Applies replacements from end-of-document backward so earlier matches' offsets
 * are not invalidated by later (earlier-in-doc) edits.
 */
import type { Command, CommandContext, CommandError, Result } from '../command.js';
import { asCommandId } from '../command.js';
import type { Patch } from '../patch.js';
import type { Op } from '../op.js';
import { findAll } from '../find.js';
import type { FindOptions } from '../find.js';

export interface ReplaceAllParams {
  readonly findOptions: FindOptions;
  readonly replacement: string;
}

export function createReplaceAllCommand(): Command<ReplaceAllParams> {
  return {
    meta: {
      id: asCommandId('app.edit.replaceAll'),
      title: 'Replace All',
      category: 'edit',
      coalesceKey: 'edit:replaceAll',
    },

    canRun(_ctx: CommandContext, params: ReplaceAllParams): boolean {
      return (
        params.findOptions !== undefined &&
        typeof params.findOptions.query === 'string' &&
        params.findOptions.query.length > 0 &&
        typeof params.replacement === 'string'
      );
    },

    run(ctx: CommandContext, params: ReplaceAllParams): Result<Patch, CommandError> {
      const matches = findAll(ctx.doc, params.findOptions);
      if (matches.length === 0) {
        return { ok: true, value: { ops: [] } };
      }

      const { replacement } = params;
      const ops: Op[] = [];

      // Process in reverse document order so earlier offsets remain valid
      const reversed = [...matches].reverse();
      for (const match of reversed) {
        const { anchor, focus } = match.range;
        if (anchor.leafId !== focus.leafId) continue; // skip cross-paragraph (not supported)

        const from = { leafId: anchor.leafId, offset: Math.min(anchor.offset, focus.offset) };
        const to = { leafId: anchor.leafId, offset: Math.max(anchor.offset, focus.offset) };

        ops.push({ kind: 'deleteRange', from, to });
        if (replacement.length > 0) {
          ops.push({ kind: 'insertText', at: from, text: replacement });
        }
      }

      return { ok: true, value: { ops } };
    },
  };
}
