/**
 * insert-text command: inserts a string at the given IdPosition (or selection focus if omitted).
 * Replaces a non-collapsed selection with the new text (delete then insert).
 */
import type { IdPosition } from '@word/domain';
import type { Command, CommandContext, CommandError, Result } from '../command.js';
import { asCommandId } from '../command.js';
import type { Patch } from '../patch.js';
import type { Op } from '../op.js';
import { isCollapsed } from '../selection.js';

export interface InsertTextParams {
  readonly text: string;
  /** If omitted, uses selection.primary.focus. */
  readonly at?: IdPosition;
}

export function createInsertTextCommand(): Command<InsertTextParams> {
  return {
    meta: {
      id: asCommandId('doc.insertText'),
      title: 'Insert Text',
      category: 'edit',
      scope: 'doc',
      coalesceKey: 'typing',
    },

    canRun(_ctx: CommandContext, params: InsertTextParams): boolean {
      return typeof params.text === 'string' && params.text.length > 0;
    },

    run(ctx: CommandContext, params: InsertTextParams): Result<Patch, CommandError> {
      const { text, at } = params;
      const sel = ctx.selection;
      const ops: Op[] = [];

      // If selection is non-collapsed, delete it first
      if (!isCollapsed(sel)) {
        const { anchor, focus } = sel.primary;
        ops.push({
          kind: 'deleteRange',
          from: anchor,
          to: focus,
        });
      }

      const insertAt: IdPosition = at ?? sel.primary.focus;
      ops.push({
        kind: 'insertText',
        at: insertAt,
        text,
      });

      return { ok: true, value: { ops } };
    },
  };
}
