/**
 * Toggle strikethrough on the current selection.
 */
import type { Document, Paragraph, Run } from '@word/domain';
import type { Command, CommandContext, CommandError, Result } from '../../command.js';
import { asCommandId } from '../../command.js';
import type { Patch } from '../../patch.js';
import type { Op } from '../../op.js';
import { isCollapsed } from '../../selection.js';

function runsInRange(doc: Document, paragraphId: string, from: number, to: number): readonly Run[] {
  const result: Run[] = [];
  for (const section of doc.sections) {
    for (const block of section.children) {
      if (block.type !== 'paragraph' || block.id !== paragraphId) continue;
      const para = block as Paragraph;
      let pos = 0;
      for (const child of para.children) {
        if (child.type !== 'run') continue;
        const end = pos + child.text.length;
        if (Math.max(pos, from) < Math.min(end, to)) {
          result.push(child as Run);
        }
        pos = end;
      }
    }
  }
  return result;
}

export function createToggleStrikethroughCommand(): Command<void> {
  return {
    meta: {
      id: asCommandId('app.format.strikethrough'),
      title: 'Strikethrough',
      category: 'format',
      coalesceKey: 'format:strikethrough',
    },

    canRun(ctx: CommandContext): boolean {
      return !isCollapsed(ctx.selection);
    },

    run(ctx: CommandContext): Result<Patch, CommandError> {
      const { anchor, focus } = ctx.selection.primary;
      if (anchor.leafId !== focus.leafId) {
        return {
          ok: false,
          error: { code: 'constraint', message: 'Cross-paragraph strikethrough not supported' },
        };
      }
      const from = Math.min(anchor.offset, focus.offset);
      const to = Math.max(anchor.offset, focus.offset);
      const runs = runsInRange(ctx.doc, anchor.leafId, from, to);
      const allStrike =
        runs.length > 0 &&
        runs.every((r) => (ctx.doc.props.run.get(r.attrs.runPropsId) ?? {}).strike === true);
      const op: Op = {
        kind: 'setRunProps',
        from: { leafId: anchor.leafId, offset: from },
        to: { leafId: anchor.leafId, offset: to },
        props: { strike: !allStrike },
      };
      return { ok: true, value: { ops: [op] } };
    },
  };
}
