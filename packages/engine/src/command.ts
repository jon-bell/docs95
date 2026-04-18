import type { ClockPort, Document, IdGenPort, LogPort, NodeId, RandomPort } from '@word/domain';
import type { Patch } from './patch.js';
import type { SelectionSet } from './selection.js';
import type { IdRange } from '@word/domain';

export type CommandId = string & { readonly __brand: 'CommandId' };
export const asCommandId = (s: string): CommandId => s as CommandId;

export interface CommandMeta {
  readonly id: CommandId;
  readonly title: string;
  readonly category?: string;
  readonly label?: string;
  readonly scope?: 'doc' | 'selection' | 'view';
  readonly coalesceKey?: string;
}

export interface CommandError {
  readonly code: 'constraint' | 'invalidArgs' | 'schema' | 'plugin' | 'internal';
  readonly message: string;
  readonly cause?: unknown;
}

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export interface CommandContext {
  readonly doc: Document;
  readonly selection: SelectionSet;
  readonly idGen: IdGenPort;
  readonly clock: ClockPort;
  readonly random: RandomPort;
  readonly log: LogPort;
}

export interface Command<Params = void> {
  readonly meta: CommandMeta;
  canRun(ctx: CommandContext, params: Params): boolean;
  run(ctx: CommandContext, params: Params): Result<Patch, CommandError>;
  computeSelectionAfter?(ctx: CommandContext, params: Params, patch: Patch): IdRange | undefined;
}

export type AnyCommand = Command<unknown>;

export { NodeId };
