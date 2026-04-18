/**
 * Toggle bold on the current selection.
 * If all runs in the selection are bold, clears bold; otherwise sets bold.
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
        const overlapStart = Math.max(pos, from);
        const overlapEnd = Math.min(end, to);
        if (overlapStart < overlapEnd) {
          result.push(child as Run);
        }
        pos = end;
      }
    }
  }
  return result;
}

function getRunProps(doc: Document, run: Run) {
  return doc.props.run.get(run.attrs.runPropsId) ?? {};
}

export function createToggleBoldCommand(): Command<void> {
  return {
    meta: {
      id: asCommandId('app.format.bold'),
      title: 'Bold',
      category: 'format',
      coalesceKey: 'format:bold',
    },

    canRun(ctx: CommandContext): boolean {
      return !isCollapsed(ctx.selection);
    },

    run(ctx: CommandContext): Result<Patch, CommandError> {
      const { anchor, focus } = ctx.selection.primary;
      if (anchor.leafId !== focus.leafId) {
        return {
          ok: false,
          error: { code: 'constraint', message: 'Cross-paragraph bold not supported' },
        };
      }
      const from = Math.min(anchor.offset, focus.offset);
      const to = Math.max(anchor.offset, focus.offset);
      const runs = runsInRange(ctx.doc, anchor.leafId, from, to);
      const allBold = runs.length > 0 && runs.every((r) => getRunProps(ctx.doc, r).bold === true);
      const newBold = !allBold;

      const op: Op = {
        kind: 'setRunProps',
        from: { leafId: anchor.leafId, offset: from },
        to: { leafId: anchor.leafId, offset: to },
        props: { bold: newBold },
      };
      return { ok: true, value: { ops: [op] } };
    },
  };
}
