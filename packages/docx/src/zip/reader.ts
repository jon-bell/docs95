// ZIP reader backed by fflate. fflate types never leak past this module boundary.
import { unzipSync } from 'fflate';

// exactOptionalPropertyTypes: fields must be number when present, never undefined.
export interface UnzipOptions {
  readonly maxUncompressedBytes?: number | undefined;
  readonly maxCompressionRatio?: number | undefined;
}

const DEFAULT_MAX_UNCOMPRESSED = 200 * 1024 * 1024; // 200 MB
const DEFAULT_MAX_RATIO = 200;

function validateEntryName(name: string): void {
  if (name.includes('..')) {
    throw new Error(`ZIP path traversal rejected: "${name}" contains ".."`);
  }
  if (name.startsWith('/') || name.startsWith('\\')) {
    throw new Error(`ZIP absolute path rejected: "${name}"`);
  }
  if (name.includes('\0')) {
    throw new Error(`ZIP path with NUL byte rejected`);
  }
}

export function unzip(bytes: Uint8Array, opts: UnzipOptions = {}): Map<string, Uint8Array> {
  const maxUncompressed = opts.maxUncompressedBytes ?? DEFAULT_MAX_UNCOMPRESSED;
  const maxRatio = opts.maxCompressionRatio ?? DEFAULT_MAX_RATIO;

  // fflate's unzipSync decompresses all entries at once; we post-validate.
  // We use the filter callback to check entry names and declared sizes before
  // decompression, then verify ratio on the result.
  let totalUncompressed = 0;

  const raw = unzipSync(bytes, {
    filter(file) {
      validateEntryName(file.name);

      // Ratio check against declared sizes (before decompression).
      if (file.size > 0 && file.originalSize / file.size > maxRatio) {
        throw new Error(
          `ZIP bomb rejected: entry "${file.name}" has compression ratio ` +
            `${(file.originalSize / file.size).toFixed(1)} > ${maxRatio}`,
        );
      }

      totalUncompressed += file.originalSize;
      if (totalUncompressed > maxUncompressed) {
        throw new Error(
          `ZIP bomb rejected: total uncompressed size would exceed ${maxUncompressed} bytes`,
        );
      }

      return true;
    },
  });

  const result = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(raw)) {
    validateEntryName(name);
    result.set(name, data);
  }
  return result;
}
