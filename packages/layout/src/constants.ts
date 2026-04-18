// MVP layout constants. All layout arithmetic in this package uses pixels (px)
// as the working unit; twips are converted at the boundary.
//
// Assumptions for M0 MVP:
// - Single-column body layout only.
// - Letter page (8.5 × 11 in) with 1-inch margins.
// - 96 DPI screen resolution.
// - Line height = 1.15 × font cell height (matching Word 95 "single" spacing).

export const SCREEN_DPI = 96;

// 1440 twips per inch; 96 px per inch → 96/1440 = 1/15.
export const PX_PER_TWIP = SCREEN_DPI / 1440;

export const twipsToPx = (twips: number): number => twips * PX_PER_TWIP;

// Half-points → points → px: halfPts / 2 pts × (96 px / 72 pt).
export const halfPointsToPx = (halfPoints: number): number => (halfPoints / 2) * (SCREEN_DPI / 72);

// Fallback font size when neither the run nor the document defaults specify one.
export const DEFAULT_HALF_POINTS = 24; // 12 pt

// Multiplier applied to font cell height to obtain line height.
export const DEFAULT_LINE_RATIO = 1.15;

// Letter page dimensions in twips (8.5" × 11").
export const LETTER_WIDTH_TWIPS = 12_240;
export const LETTER_HEIGHT_TWIPS = 15_840;

// 1-inch margins in twips.
export const DEFAULT_MARGIN_TWIPS = 1_440;
