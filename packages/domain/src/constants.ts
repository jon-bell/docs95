export const TWIPS_PER_INCH = 1440;
export const TWIPS_PER_POINT = 20;
export const EMU_PER_INCH = 914_400;
export const EMU_PER_POINT = 12_700;
export const EMU_PER_TWIP = 635;

export const DEFAULT_PAGE = {
  widthTwips: 12_240, // 8.5"
  heightTwips: 15_840, // 11"
} as const;

export const DEFAULT_MARGIN_TWIPS = {
  top: 1440,
  bottom: 1440,
  left: 1440,
  right: 1440,
  header: 720,
  footer: 720,
  gutter: 0,
} as const;

export const NODE_ID_LENGTH = 21;
