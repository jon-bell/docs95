/**
 * Encode a Uint8Array to a base64 string for IPC transmission.
 * Main process handlers use this to encode binary responses.
 */
export function encodeBytes(data: Uint8Array): string {
  return Buffer.from(data).toString('base64');
}

/**
 * Decode a base64 string back to a Uint8Array.
 * Renderer uses this to decode binary IPC responses.
 */
export function decodeBytes(encoded: string): Uint8Array {
  return new Uint8Array(Buffer.from(encoded, 'base64'));
}
