/**
 * Replace command: replaces a single found range with a string.
 * Produces a patch of deleteRange + insertText ops.
 */
import type { Command, CommandContext, CommandError, Result } from '../command.js';
import { asCommandId } from '../command.js';
import type { Patch } from '../patch.js';
import type { Op } from '../op.js';
import type { IdRange } from '@word/domain';

export interface ReplaceParams {
  readonly range: IdRange;
  readonly replacement: string;
}

export function createReplaceCommand(): Command<ReplaceParams> {
  return {
    meta: {
      id: asCommandId('app.edit.replace'),
      title: 'Replace',
      category: 'edit',
      coalesceKey: 'edit:replace',
    },

    canRun(_ctx: CommandContext, params: ReplaceParams): boolean {
      return params.range !== undefined && typeof params.replacement === 'string';
    },

    run(_ctx: CommandContext, params: ReplaceParams): Result<Patch, CommandError> {
      const { range, replacement } = params;
      const { anchor, focus } = range;

      if (anchor.leafId !== focus.leafId) {
        return {
          ok: false,
          error: { code: 'constraint', message: 'Cross-paragraph replace not supported' },
        };
      }

      const from = { leafId: anchor.leafId, offset: Math.min(anchor.offset, focus.offset) };
      const to = { leafId: anchor.leafId, offset: Math.max(anchor.offset, focus.offset) };

      const ops: Op[] = [{ kind: 'deleteRange', from, to }];

      if (replacement.length > 0) {
        ops.push({
          kind: 'insertText',
          at: from,
          text: replacement,
        });
      }

      return { ok: true, value: { ops } };
    },
  };
}
