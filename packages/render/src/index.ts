// @word/render — React bindings over the layout engine.
export { PageHost } from './page-host.js';
export type { PageHostProps } from './page-host.js';

export { Caret } from './caret.js';
export type { CaretProps, CaretPosition } from './caret.js';

export { SelectionOverlay } from './selection-overlay.js';
export type { SelectionOverlayProps } from './selection-overlay.js';

export { useHitTest } from './use-hit-test.js';
export type { HitTestFn } from './use-hit-test.js';

export { ImeSurface } from './ime-surface.js';
export type { ImeSurfaceProps } from './ime-surface.js';

export { createCanvasMetrics } from './font-metrics.js';

export { ListMarker } from './list-marker.js';
export type { ListMarkerProps, MarkerData } from './list-marker.js';

export { runPropsToStyle, FALLBACK_FONT_STACK } from './run-styles.js';
