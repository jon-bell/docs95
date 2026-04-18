import type { IsoDateTime, NodeId } from '@word/domain';
import type { Patch } from './patch.js';

export interface Transaction {
  readonly id: NodeId;
  readonly label: string;
  readonly timestamp: IsoDateTime;
  readonly author?: string;
  readonly atomic: boolean;
  readonly ops: Patch;
  readonly inverse: Patch;
  readonly coalesceKey?: string;
}
