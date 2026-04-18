// ZIP writer backed by fflate. Deterministic: sorted entries, pinned timestamps.
import { zipSync } from 'fflate';
import type { ZipOptions as FflateZipOptions } from 'fflate';

export interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

export interface ZipOptions {
  readonly deterministic?: boolean | undefined;
  /** ISO 8601 timestamp string to pin into all entries when deterministic=true. */
  readonly pinnedTimestamp?: string | undefined;
}

// DOS epoch is 1980-01-01. We use it as the deterministic default so output is
// byte-stable across machines and CI runs.
const DOS_EPOCH_MS = Date.UTC(1980, 0, 1, 0, 0, 0, 0);

function parsePinnedTimestamp(ts: string): number {
  const ms = Date.parse(ts);
  return isNaN(ms) ? DOS_EPOCH_MS : ms;
}

export function zip(entries: readonly ZipEntry[], opts: ZipOptions = {}): Uint8Array {
  const deterministic = opts.deterministic ?? false;
  const mtime = deterministic
    ? opts.pinnedTimestamp != null
      ? new Date(parsePinnedTimestamp(opts.pinnedTimestamp))
      : new Date(DOS_EPOCH_MS)
    : undefined;

  // Sort entries by name for deterministic output.
  const sorted = deterministic
    ? [...entries].sort((a, b) => a.name.localeCompare(b.name))
    : entries;

  const zippable: Record<string, [Uint8Array, FflateZipOptions]> = {};
  for (const entry of sorted) {
    zippable[entry.name] = [entry.data, { level: 6, mtime }];
  }

  return zipSync(zippable);
}
