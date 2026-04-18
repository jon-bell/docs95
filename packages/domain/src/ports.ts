import type { IsoDateTime, NodeId } from './node.js';

/** Side-effect seams for the pure domain. The engine / app injects real implementations. */

export interface IdGenPort {
  /** 21-character nanoid, collision-free for the process lifetime. */
  newId(): NodeId;
}

export interface ClockPort {
  now(): IsoDateTime;
  perfNow(): number; // hi-res monotonic
}

export interface RandomPort {
  nextU32(): number;
  nextFloat(): number;
}

export interface LogPort {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}
