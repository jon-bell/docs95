/**
 * Set font name on the current selection.
 */
import type { Command, CommandContext, CommandError, Result } from '../../command.js';
import { asCommandId } from '../../command.js';
import type { Patch } from '../../patch.js';
import type { Op } from '../../op.js';
import { isCollapsed } from '../../selection.js';

export interface SetFontNameParams {
  readonly fontName: string;
}

export function createSetFontNameCommand(): Command<SetFontNameParams> {
  return {
    meta: {
      id: asCommandId('app.format.fontName'),
      title: 'Font Name',
      category: 'format',
      coalesceKey: 'format:fontName',
    },

    canRun(ctx: CommandContext, params: SetFontNameParams): boolean {
      return (
        !isCollapsed(ctx.selection) &&
        typeof params.fontName === 'string' &&
        params.fontName.length > 0
      );
    },

    run(ctx: CommandContext, params: SetFontNameParams): Result<Patch, CommandError> {
      const { anchor, focus } = ctx.selection.primary;
      if (anchor.leafId !== focus.leafId) {
        return {
          ok: false,
          error: { code: 'constraint', message: 'Cross-paragraph font name not supported' },
        };
      }
      const from = Math.min(anchor.offset, focus.offset);
      const to = Math.max(anchor.offset, focus.offset);
      const op: Op = {
        kind: 'setRunProps',
        from: { leafId: anchor.leafId, offset: from },
        to: { leafId: anchor.leafId, offset: to },
        props: { fontName: params.fontName },
      };
      return { ok: true, value: { ops: [op] } };
    },
  };
}
