/**
 * Find commands: wrappers that invoke the find service and move the selection.
 *
 * app.edit.find    — initiate a search (first result)
 * app.edit.findNext — advance to next result from current caret
 * app.edit.findPrev — go to previous result from current caret
 *
 * These commands produce no Patch (document is not mutated); they signal the UI
 * by returning an empty patch. The selection update is handled via computeSelectionAfter.
 */
import type { Command, CommandContext, CommandError, Result } from '../command.js';
import { asCommandId } from '../command.js';
import type { Patch } from '../patch.js';
import type { IdRange } from '@word/domain';
import { findAll, findNext, findPrev } from '../find.js';
import type { FindOptions } from '../find.js';

export interface FindParams {
  readonly findOptions: FindOptions;
}

export function createFindCommand(): Command<FindParams> {
  return {
    meta: {
      id: asCommandId('app.edit.find'),
      title: 'Find',
      category: 'edit',
    },

    canRun(_ctx: CommandContext, params: FindParams): boolean {
      return typeof params.findOptions.query === 'string' && params.findOptions.query.length > 0;
    },

    run(ctx: CommandContext, params: FindParams): Result<Patch, CommandError> {
      const results = findAll(ctx.doc, params.findOptions);
      if (results.length === 0) {
        return { ok: true, value: { ops: [] } };
      }
      return { ok: true, value: { ops: [] } };
    },

    computeSelectionAfter(ctx: CommandContext, params: FindParams): IdRange | undefined {
      const results = findAll(ctx.doc, params.findOptions);
      if (results.length === 0) return undefined;
      const first = results[0]!;
      return { anchor: first.range.anchor, focus: first.range.focus };
    },
  };
}

export function createFindNextCommand(): Command<FindParams> {
  return {
    meta: {
      id: asCommandId('app.edit.findNext'),
      title: 'Find Next',
      category: 'edit',
    },

    canRun(_ctx: CommandContext, params: FindParams): boolean {
      return typeof params.findOptions.query === 'string' && params.findOptions.query.length > 0;
    },

    run(ctx: CommandContext, params: FindParams): Result<Patch, CommandError> {
      void findNext(ctx.doc, ctx.selection.primary.focus, params.findOptions);
      return { ok: true, value: { ops: [] } };
    },

    computeSelectionAfter(ctx: CommandContext, params: FindParams): IdRange | undefined {
      const result = findNext(ctx.doc, ctx.selection.primary.focus, params.findOptions);
      if (result === undefined) return undefined;
      return { anchor: result.range.anchor, focus: result.range.focus };
    },
  };
}

export function createFindPrevCommand(): Command<FindParams> {
  return {
    meta: {
      id: asCommandId('app.edit.findPrev'),
      title: 'Find Previous',
      category: 'edit',
    },

    canRun(_ctx: CommandContext, params: FindParams): boolean {
      return typeof params.findOptions.query === 'string' && params.findOptions.query.length > 0;
    },

    run(ctx: CommandContext, params: FindParams): Result<Patch, CommandError> {
      void findPrev(ctx.doc, ctx.selection.primary.focus, params.findOptions);
      return { ok: true, value: { ops: [] } };
    },

    computeSelectionAfter(ctx: CommandContext, params: FindParams): IdRange | undefined {
      const result = findPrev(ctx.doc, ctx.selection.primary.focus, params.findOptions);
      if (result === undefined) return undefined;
      return { anchor: result.range.anchor, focus: result.range.focus };
    },
  };
}
