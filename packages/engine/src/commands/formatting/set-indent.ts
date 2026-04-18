/**
 * Set paragraph indentation. Exposes four sub-command ids:
 *   app.format.indent.left, app.format.indent.right,
 *   app.format.firstLineIndent, app.format.hangingIndent
 * Each takes a single `twips` number.
 */
import type { NodeId } from '@word/domain';
import type { Command, CommandContext, CommandError, Result } from '../../command.js';
import { asCommandId } from '../../command.js';
import type { Patch } from '../../patch.js';
import type { Op } from '../../op.js';

export interface SetIndentParams {
  /** Value in twips. */
  readonly twips: number;
}

function makeIndentCommand(
  id: string,
  title: string,
  indentKey: 'leftTwips' | 'rightTwips' | 'firstLineTwips' | 'hangingTwips',
): Command<SetIndentParams> {
  return {
    meta: {
      id: asCommandId(id),
      title,
      category: 'format',
      coalesceKey: `format:indent:${indentKey}`,
    },

    canRun(_ctx: CommandContext, params: SetIndentParams): boolean {
      return Number.isFinite(params.twips);
    },

    run(ctx: CommandContext, params: SetIndentParams): Result<Patch, CommandError> {
      const { anchor, focus } = ctx.selection.primary;
      const ids = new Set<NodeId>([anchor.leafId]);
      if (focus.leafId !== anchor.leafId) ids.add(focus.leafId);

      const ops: Op[] = Array.from(ids).map((paragraphId) => ({
        kind: 'setParaProps' as const,
        paragraphId,
        props: { indent: { [indentKey]: params.twips } },
      }));
      return { ok: true, value: { ops } };
    },
  };
}

export function createSetIndentLeftCommand(): Command<SetIndentParams> {
  return makeIndentCommand('app.format.indent.left', 'Left Indent', 'leftTwips');
}

export function createSetIndentRightCommand(): Command<SetIndentParams> {
  return makeIndentCommand('app.format.indent.right', 'Right Indent', 'rightTwips');
}

export function createSetFirstLineIndentCommand(): Command<SetIndentParams> {
  return makeIndentCommand('app.format.firstLineIndent', 'First Line Indent', 'firstLineTwips');
}

export function createSetHangingIndentCommand(): Command<SetIndentParams> {
  return makeIndentCommand('app.format.hangingIndent', 'Hanging Indent', 'hangingTwips');
}
