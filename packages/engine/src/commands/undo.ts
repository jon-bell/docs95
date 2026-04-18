/**
 * undo command: triggers undo via the History.
 *
 * The command itself returns an empty patch — the actual document restoration
 * is performed by the caller (createEditorInstance) which intercepts the undo
 * result and replaces the current document from history. This matches the
 * architecture where CommandBus goes through applyPatch, but undo/redo are
 * special: they restore a prior snapshot rather than applying ops forward.
 *
 * Pattern: canRun checks history.canUndo; run() emits a zero-op Patch.
 * The EditorInstance listens for the 'doc.undo' command and performs the
 * actual history traversal outside CommandBus dispatch.
 */
import type { Command, CommandContext, CommandError, Result } from '../command.js';
import { asCommandId } from '../command.js';
import type { Patch } from '../patch.js';

export type UndoParams = Record<string, never>;

/**
 * The undo command checks canUndo and, on dispatch, signals intent.
 * The EditorInstance wraps dispatch to intercept undo and call history.undo()
 * to restore the prior document snapshot.
 */
export function createUndoCommand(): Command<UndoParams> {
  return {
    meta: {
      id: asCommandId('doc.undo'),
      title: 'Undo',
      category: 'edit',
      scope: 'doc',
    },

    canRun(ctx: CommandContext, _params: UndoParams): boolean {
      return ctx.doc.version > 0; // History manages canUndo; fallback to version check
    },

    run(_ctx: CommandContext, _params: UndoParams): Result<Patch, CommandError> {
      // Returns a no-op patch; actual undo is performed by the EditorInstance
      // intercepting this command's dispatch and calling history.undo().
      return { ok: true, value: { ops: [] } };
    },
  };
}
