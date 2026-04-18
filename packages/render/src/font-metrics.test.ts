import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCanvasMetrics } from './font-metrics.js';

// ---------------------------------------------------------------------------
// Helpers

const BASIC_PROPS = {
  fontName: 'Arial',
  halfPoints: 24, // 12pt
  bold: false,
  italic: false,
};

function makeMockContext() {
  const measureText = vi.fn().mockReturnValue({
    width: 50,
    actualBoundingBoxAscent: 10,
    actualBoundingBoxDescent: 3,
  });
  return { font: '', measureText };
}

// ---------------------------------------------------------------------------
// Tests

describe('createCanvasMetrics', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a FontMetricsPort with a measure function', () => {
    const port = createCanvasMetrics();
    expect(typeof port.measure).toBe('function');
  });

  it('measures text and returns numeric fields', () => {
    const mockCtx = makeMockContext();
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);

    const port = createCanvasMetrics();
    const result = port.measure('hello', BASIC_PROPS);
    expect(typeof result.widthPx).toBe('number');
    expect(typeof result.heightPx).toBe('number');
    expect(typeof result.ascentPx).toBe('number');
    expect(typeof result.descentPx).toBe('number');
    expect(result.widthPx).toBeGreaterThanOrEqual(0);
    expect(result.heightPx).toBeGreaterThanOrEqual(0);

    getContextSpy.mockRestore();
  });

  it('caches measurements — same key only calls measureText once', () => {
    // Spy on canvas context's measureText by intercepting getContext.
    const mockCtx = makeMockContext();

    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);

    const port = createCanvasMetrics();

    const r1 = port.measure('hello', BASIC_PROPS);
    const r2 = port.measure('hello', BASIC_PROPS);

    expect(r1).toBe(r2); // Same object reference from cache.
    expect(mockCtx.measureText).toHaveBeenCalledTimes(1);

    getContextSpy.mockRestore();
  });

  it('does not share cache entries for different text', () => {
    const mockCtx = makeMockContext();
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);

    const port = createCanvasMetrics();

    port.measure('hello', BASIC_PROPS);
    port.measure('world', BASIC_PROPS);

    expect(mockCtx.measureText).toHaveBeenCalledTimes(2);

    getContextSpy.mockRestore();
  });

  it('does not share cache entries for different font props', () => {
    const mockCtx = makeMockContext();
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);

    const port = createCanvasMetrics();

    port.measure('hi', BASIC_PROPS);
    port.measure('hi', { ...BASIC_PROPS, bold: true });

    expect(mockCtx.measureText).toHaveBeenCalledTimes(2);

    getContextSpy.mockRestore();
  });

  it('uses bounding-box metrics when available', () => {
    const mockCtx = {
      font: '',
      measureText: vi.fn().mockReturnValue({
        width: 60,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 4,
      }),
    };
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);

    const port = createCanvasMetrics();
    const result = port.measure('X', BASIC_PROPS);

    expect(result.ascentPx).toBe(12);
    expect(result.descentPx).toBe(4);
    expect(result.heightPx).toBe(16);

    getContextSpy.mockRestore();
  });

  it('falls back to 0.8/0.2 em-height when bounding-box metrics are unavailable', () => {
    const mockCtx = {
      font: '',
      // No actualBoundingBoxAscent / actualBoundingBoxDescent
      measureText: vi.fn().mockReturnValue({ width: 30 }),
    };
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);

    const port = createCanvasMetrics();
    // halfPoints=24 → 12pt → 12*(96/72) ≈ 16px
    const sizePx = (24 / 2) * (96 / 72);
    const result = port.measure('X', BASIC_PROPS);

    expect(result.ascentPx).toBeCloseTo(sizePx * 0.8);
    expect(result.descentPx).toBeCloseTo(sizePx * 0.2);

    getContextSpy.mockRestore();
  });
});
