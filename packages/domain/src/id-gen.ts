import { nanoid } from 'nanoid';
import type { IdGenPort } from './ports.js';
import type { NodeId } from './node.js';
import { NODE_ID_LENGTH } from './constants.js';

/** Production IdGenPort backed by nanoid. */
export const createIdGen = (): IdGenPort => ({
  newId: (): NodeId => nanoid(NODE_ID_LENGTH) as NodeId,
});
