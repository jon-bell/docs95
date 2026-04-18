/**
 * Maps RunProps fields to CSS style properties for inline run rendering.
 * All color resolution is done here so page-host.tsx stays declarative.
 */
import type { RunProps, ColorValue, HighlightColor, UnderlineKind } from '@word/domain';
import type React from 'react';

export const FALLBACK_FONT_STACK = '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif';

const HIGHLIGHT_MAP: Readonly<Record<HighlightColor, string>> = {
  none: 'transparent',
  black: '#000000',
  blue: '#0000ff',
  cyan: '#00ffff',
  darkBlue: '#00008b',
  darkCyan: '#008b8b',
  darkGray: '#a9a9a9',
  darkGreen: '#006400',
  darkMagenta: '#8b008b',
  darkRed: '#8b0000',
  darkYellow: '#808000',
  green: '#00ff00',
  lightGray: '#d3d3d3',
  magenta: '#ff00ff',
  red: '#ff0000',
  white: '#ffffff',
  yellow: '#ffff00',
};

function resolveColor(c: ColorValue | undefined): string {
  if (c === undefined) return 'currentColor';
  if (c.kind === 'auto') return 'currentColor';
  if (c.kind === 'rgb') return `#${c.value}`;
  // themed — no theme engine yet; fall back to black
  return '#000000';
}

function resolveTextDecorationLine(
  underline: UnderlineKind | undefined,
  strike: boolean | undefined,
  doubleStrike: boolean | undefined,
): string {
  const parts: string[] = [];
  if (underline !== undefined && underline !== 'none') parts.push('underline');
  if (strike === true || doubleStrike === true) parts.push('line-through');
  return parts.length > 0 ? parts.join(' ') : 'none';
}

function resolveTextDecorationStyle(
  underline: UnderlineKind | undefined,
): React.CSSProperties['textDecorationStyle'] {
  if (underline === undefined || underline === 'none') return 'solid';
  if (underline === 'double') return 'double';
  if (underline === 'wave' || underline === 'wavyHeavy' || underline === 'wavyDouble')
    return 'wavy';
  if (
    underline === 'dotted' ||
    underline === 'dottedHeavy' ||
    underline === 'dotDash' ||
    underline === 'dotDashHeavy' ||
    underline === 'dotDotDash' ||
    underline === 'dotDotDashHeavy'
  )
    return 'dotted';
  if (
    underline === 'dash' ||
    underline === 'dashHeavy' ||
    underline === 'dashLong' ||
    underline === 'dashLongHeavy'
  )
    return 'dashed';
  return 'solid';
}

/**
 * Derives inline CSS style properties from a resolved RunProps.
 * Returns an object safe to spread into a React style prop.
 */
export function runPropsToStyle(props: RunProps): React.CSSProperties {
  const {
    fontName,
    halfPoints,
    bold,
    italic,
    underline,
    strike,
    doubleStrike,
    color,
    highlight,
    smallCaps,
    caps,
    verticalAlign,
  } = props;

  const textDecorationLine = resolveTextDecorationLine(underline, strike, doubleStrike);

  return {
    fontFamily:
      fontName !== undefined ? `${fontName}, ${FALLBACK_FONT_STACK}` : FALLBACK_FONT_STACK,
    fontSize: halfPoints !== undefined ? `${halfPoints / 2}pt` : undefined,
    fontWeight: bold === true ? 700 : 400,
    fontStyle: italic === true ? 'italic' : 'normal',
    textDecorationLine,
    textDecorationStyle: resolveTextDecorationStyle(underline),
    color: resolveColor(color),
    backgroundColor:
      highlight !== undefined && highlight !== 'none' ? HIGHLIGHT_MAP[highlight] : undefined,
    fontVariantCaps: smallCaps === true ? 'small-caps' : undefined,
    // caps: CSS text-transform is the correct visual equivalent for M1.
    // Real Word renders caps as visual (no text mutation in the model).
    textTransform: caps === true ? 'uppercase' : undefined,
    verticalAlign:
      verticalAlign === 'superscript'
        ? 'super'
        : verticalAlign === 'subscript'
          ? 'sub'
          : verticalAlign === 'baseline'
            ? 'baseline'
            : undefined,
  };
}
