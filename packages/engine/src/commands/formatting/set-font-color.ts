/**
 * Set font color on the current selection.
 */
import type { ColorValue } from '@word/domain';
import type { Command, CommandContext, CommandError, Result } from '../../command.js';
import { asCommandId } from '../../command.js';
import type { Patch } from '../../patch.js';
import type { Op } from '../../op.js';
import { isCollapsed } from '../../selection.js';

export interface SetFontColorParams {
  readonly color: ColorValue;
}

export function createSetFontColorCommand(): Command<SetFontColorParams> {
  return {
    meta: {
      id: asCommandId('app.format.fontColor'),
      title: 'Font Color',
      category: 'format',
      coalesceKey: 'format:fontColor',
    },

    canRun(ctx: CommandContext, params: SetFontColorParams): boolean {
      return !isCollapsed(ctx.selection) && params.color !== undefined;
    },

    run(ctx: CommandContext, params: SetFontColorParams): Result<Patch, CommandError> {
      const { anchor, focus } = ctx.selection.primary;
      if (anchor.leafId !== focus.leafId) {
        return {
          ok: false,
          error: { code: 'constraint', message: 'Cross-paragraph font color not supported' },
        };
      }
      const from = Math.min(anchor.offset, focus.offset);
      const to = Math.max(anchor.offset, focus.offset);
      const op: Op = {
        kind: 'setRunProps',
        from: { leafId: anchor.leafId, offset: from },
        to: { leafId: anchor.leafId, offset: to },
        props: { color: params.color },
      };
      return { ok: true, value: { ops: [op] } };
    },
  };
}
