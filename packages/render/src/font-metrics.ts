import type { FontMetricsPort, MeasureProps } from '@word/layout';

const LRU_CAPACITY = 1000;

/** Minimal doubly-linked LRU cache keyed by string. */
class LruCache<V> {
  private readonly cap: number;
  private readonly map = new Map<string, V>();

  constructor(capacity: number) {
    this.cap = capacity;
  }

  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    // Refresh insertion order (Map preserves insertion order).
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.cap) {
      // Evict oldest (first) entry.
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }

  get size(): number {
    return this.map.size;
  }
}

interface Measurement {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly ascentPx: number;
  readonly descentPx: number;
}

function makeCacheKey(text: string, props: MeasureProps): string {
  return `${props.fontName}|${props.halfPoints}|${props.bold ? 'b' : ''}|${props.italic ? 'i' : ''}|${text}`;
}

function getOrCreateCanvas(): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(1, 1);
  }
  return document.createElement('canvas');
}

function getFontString(props: MeasureProps): string {
  const style = props.italic === true ? 'italic ' : '';
  const weight = props.bold === true ? 'bold ' : '';
  // half-points → pt → px: pt/72*96 = pt*96/72
  const sizePx = (props.halfPoints / 2) * (96 / 72);
  return `${style}${weight}${sizePx}px ${props.fontName}`;
}

/**
 * Canvas-based font metrics port with a bounded LRU cache.
 * Uses OffscreenCanvas when available, falling back to a regular canvas element.
 */
export function createCanvasMetrics(): FontMetricsPort {
  const cache = new LruCache<Measurement>(LRU_CAPACITY);
  // Lazily created so construction is synchronous and safe in SSR/test contexts.
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  function getCtx(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
    if (ctx !== null) return ctx;
    const canvas = getOrCreateCanvas();
    const c = canvas.getContext('2d');
    if (c === null) throw new Error('Failed to obtain 2D canvas context for font metrics');
    ctx = c as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    return ctx;
  }

  return {
    measure(text: string, props: MeasureProps): Measurement {
      const key = makeCacheKey(text, props);
      const cached = cache.get(key);
      if (cached !== undefined) return cached;

      const c = getCtx();
      c.font = getFontString(props);

      const sizePx = (props.halfPoints / 2) * (96 / 72);

      let widthPx: number;
      let ascentPx: number;
      let descentPx: number;

      const tm = c.measureText(text);
      widthPx = tm.width;

      if (tm.actualBoundingBoxAscent !== undefined && tm.actualBoundingBoxDescent !== undefined) {
        ascentPx = tm.actualBoundingBoxAscent;
        descentPx = tm.actualBoundingBoxDescent;
      } else {
        // Fallback approximation when bounding box metrics are unavailable.
        ascentPx = sizePx * 0.8;
        descentPx = sizePx * 0.2;
      }

      const heightPx = ascentPx + descentPx;
      const result: Measurement = { widthPx, heightPx, ascentPx, descentPx };
      cache.set(key, result);
      return result;
    },
  };
}
