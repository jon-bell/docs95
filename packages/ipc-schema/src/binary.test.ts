import { describe, it, expect } from 'vitest';
import { encodeBytes, decodeBytes } from './index';

describe('Binary Encoding/Decoding', () => {
  it('encodeBytes and decodeBytes round-trip', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = encodeBytes(original);
    const decoded = decodeBytes(encoded);
    expect(decoded).toEqual(original);
  });

  it('handles empty buffer', () => {
    const original = new Uint8Array([]);
    const encoded = encodeBytes(original);
    const decoded = decodeBytes(encoded);
    expect(decoded).toEqual(original);
  });

  it('handles large buffer', () => {
    const original = new Uint8Array(10000);
    for (let i = 0; i < original.length; i++) {
      original[i] = i % 256;
    }
    const encoded = encodeBytes(original);
    const decoded = decodeBytes(encoded);
    expect(decoded).toEqual(original);
  });

  it('handles all byte values 0-255', () => {
    const original = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      original[i] = i;
    }
    const encoded = encodeBytes(original);
    const decoded = decodeBytes(encoded);
    expect(decoded).toEqual(original);
  });

  it('produces valid base64', () => {
    const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const encoded = encodeBytes(original);
    expect(encoded).toBe('SGVsbG8=');
  });

  it('decodes base64 correctly', () => {
    const encoded = 'SGVsbG8gV29ybGQ=';
    const decoded = decodeBytes(encoded);
    const expected = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]); // "Hello World"
    expect(decoded).toEqual(expected);
  });
});
