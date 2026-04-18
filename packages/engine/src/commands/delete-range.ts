/**
 * delete-range command: deletes the primary selection range.
 * Collapsed selection (caret) is a no-op.
 */
import type { Command, CommandContext, CommandError, Result } from '../command.js';
import { asCommandId } from '../command.js';
import type { Patch } from '../patch.js';
import type { Op } from '../op.js';
import { isCollapsed } from '../selection.js';

export type DeleteRangeParams = Record<string, never>;

export function createDeleteRangeCommand(): Command<DeleteRangeParams> {
  return {
    meta: {
      id: asCommandId('doc.deleteRange'),
      title: 'Delete Selection',
      category: 'edit',
      scope: 'selection',
    },

    canRun(_ctx: CommandContext, _params: DeleteRangeParams): boolean {
      return true;
    },

    run(ctx: CommandContext, _params: DeleteRangeParams): Result<Patch, CommandError> {
      const sel = ctx.selection;

      if (isCollapsed(sel)) {
        // Collapsed — nothing to delete
        return { ok: true, value: { ops: [] } };
      }

      const { anchor, focus } = sel.primary;
      const ops: Op[] = [
        {
          kind: 'deleteRange',
          from: anchor,
          to: focus,
        },
      ];

      return { ok: true, value: { ops } };
    },
  };
}
