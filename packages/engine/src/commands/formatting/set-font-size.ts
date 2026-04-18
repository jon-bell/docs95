/**
 * Set font size on the current selection.
 * halfPoints: 2× point size (e.g., 24 = 12pt), matching Word's internal unit.
 */
import type { Command, CommandContext, CommandError, Result } from '../../command.js';
import { asCommandId } from '../../command.js';
import type { Patch } from '../../patch.js';
import type { Op } from '../../op.js';
import { isCollapsed } from '../../selection.js';

export interface SetFontSizeParams {
  /** Half-points (2× point size). E.g. 24 = 12pt. */
  readonly halfPoints: number;
}

export function createSetFontSizeCommand(): Command<SetFontSizeParams> {
  return {
    meta: {
      id: asCommandId('app.format.fontSize'),
      title: 'Font Size',
      category: 'format',
      coalesceKey: 'format:fontSize',
    },

    canRun(ctx: CommandContext, params: SetFontSizeParams): boolean {
      return (
        !isCollapsed(ctx.selection) && Number.isFinite(params.halfPoints) && params.halfPoints > 0
      );
    },

    run(ctx: CommandContext, params: SetFontSizeParams): Result<Patch, CommandError> {
      const { anchor, focus } = ctx.selection.primary;
      if (anchor.leafId !== focus.leafId) {
        return {
          ok: false,
          error: { code: 'constraint', message: 'Cross-paragraph font size not supported' },
        };
      }
      const from = Math.min(anchor.offset, focus.offset);
      const to = Math.max(anchor.offset, focus.offset);
      const op: Op = {
        kind: 'setRunProps',
        from: { leafId: anchor.leafId, offset: from },
        to: { leafId: anchor.leafId, offset: to },
        props: { halfPoints: params.halfPoints },
      };
      return { ok: true, value: { ops: [op] } };
    },
  };
}
