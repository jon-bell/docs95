import type { ClockPort, IsoDateTime, LogPort, RandomPort } from '@word/domain';

export const createClockPort = (): ClockPort => ({
  now: () => new Date().toISOString() as IsoDateTime,
  perfNow: () => performance.now(),
});

export const createRandomPort = (): RandomPort => ({
  nextU32: () => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] ?? 0;
  },
  nextFloat: () => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return ((buf[0] ?? 0) >>> 0) / 0x1_0000_0000;
  },
});

export const createConsoleLog = (): LogPort => ({
  debug: (msg, ctx) => console.debug('[word]', msg, ctx ?? ''),
  info: (msg, ctx) => console.info('[word]', msg, ctx ?? ''),
  warn: (msg, ctx) => console.warn('[word]', msg, ctx ?? ''),
  error: (msg, ctx) => console.error('[word]', msg, ctx ?? ''),
});
