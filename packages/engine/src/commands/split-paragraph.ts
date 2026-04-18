/**
 * split-paragraph command: ENTER key semantics.
 * Splits the paragraph at the selection focus. If selection is non-collapsed,
 * the range is deleted first, then the split occurs at the resulting caret.
 */
import type { Command, CommandContext, CommandError, Result } from '../command.js';
import { asCommandId } from '../command.js';
import type { Patch } from '../patch.js';
import type { Op } from '../op.js';
import { isCollapsed } from '../selection.js';

export type SplitParagraphParams = Record<string, never>;

export function createSplitParagraphCommand(): Command<SplitParagraphParams> {
  return {
    meta: {
      id: asCommandId('doc.splitParagraph'),
      title: 'Split Paragraph',
      category: 'edit',
      scope: 'doc',
    },

    canRun(_ctx: CommandContext, _params: SplitParagraphParams): boolean {
      return true;
    },

    run(ctx: CommandContext, _params: SplitParagraphParams): Result<Patch, CommandError> {
      const sel = ctx.selection;
      const ops: Op[] = [];

      // Delete selection first if non-collapsed
      if (!isCollapsed(sel)) {
        ops.push({
          kind: 'deleteRange',
          from: sel.primary.anchor,
          to: sel.primary.focus,
        });
      }

      const at = sel.primary.focus;
      const newId = ctx.idGen.newId();

      ops.push({
        kind: 'splitParagraph',
        at,
        newId,
      });

      return { ok: true, value: { ops } };
    },
  };
}
