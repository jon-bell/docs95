import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB cap
const PATH_REDACT_THRESHOLD = 80;

/**
 * Redact path values that are too long to be helpful: keep the filename and
 * elide the middle of the directory portion so logs stay scannable.
 */
function redactPath(p: string): string {
  if (p.length <= PATH_REDACT_THRESHOLD) {
    return p;
  }
  const basename = path.basename(p);
  const dir = path.dirname(p);
  const keep = 20;
  const prefix = dir.slice(0, keep);
  const suffix = dir.slice(-keep);
  return `${prefix}…${suffix}/${basename}`;
}

function redactRecord(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'path' && typeof value === 'string') {
      result[key] = redactPath(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function logFilePath(): string {
  const logsDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  return path.join(logsDir, 'main.log');
}

function rotate(filePath: string): void {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_LOG_BYTES) {
      // Truncate by writing a rotation notice; simple single-file strategy.
      fs.writeFileSync(filePath, `[log rotated at ${new Date().toISOString()}]\n`, 'utf8');
    }
  } catch {
    // File doesn't exist yet — that's fine.
  }
}

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogPort {
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

export function createLogger(): LogPort {
  function write(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
    const filePath = logFilePath();
    rotate(filePath);

    const safeExtra = extra !== undefined ? redactRecord(extra) : undefined;
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      ...(safeExtra !== undefined ? { extra: safeExtra } : {}),
    });

    try {
      fs.appendFileSync(filePath, entry + '\n', 'utf8');
    } catch {
      // Swallow write failures — logging must never crash the app.
    }

    // Also surface to stderr during development.
    if (process.env['NODE_ENV'] !== 'production') {
      console[level](`[word-main] ${message}`, safeExtra ?? '');
    }
  }

  return {
    info: (msg, extra) => write('info', msg, extra),
    warn: (msg, extra) => write('warn', msg, extra),
    error: (msg, extra) => write('error', msg, extra),
  };
}
