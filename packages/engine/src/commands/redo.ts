/**
 * redo command: triggers redo via the History.
 * See undo.ts for the architectural pattern.
 */
import type { Command, CommandContext, CommandError, Result } from '../command.js';
import { asCommandId } from '../command.js';
import type { Patch } from '../patch.js';

export type RedoParams = Record<string, never>;

export function createRedoCommand(): Command<RedoParams> {
  return {
    meta: {
      id: asCommandId('doc.redo'),
      title: 'Redo',
      category: 'edit',
      scope: 'doc',
    },

    canRun(ctx: CommandContext, _params: RedoParams): boolean {
      // The EditorInstance checks history.canRedo before dispatching; we guard with version
      return ctx.doc.version >= 0;
    },

    run(_ctx: CommandContext, _params: RedoParams): Result<Patch, CommandError> {
      return { ok: true, value: { ops: [] } };
    },
  };
}
