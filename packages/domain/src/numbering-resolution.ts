import type { Document } from './document.js';
import type { Paragraph } from './block.js';
import type { RunProps, PropsId } from './props.js';
import { resolveParaProps } from './style-resolution.js';

// ---------------------------------------------------------------------------
// Abstract numbering level definition
// ---------------------------------------------------------------------------

export type NumberFormat =
  | 'decimal'
  | 'bullet'
  | 'upperLetter'
  | 'lowerLetter'
  | 'upperRoman'
  | 'lowerRoman'
  | 'none';

export interface AbstractNumLevel {
  readonly ilvl: number;
  readonly start: number;
  readonly numFmt: NumberFormat;
  /** Template string: %1, %2 … are replaced with the counter value at that level. */
  readonly lvlText: string;
  readonly indentTwips: number;
  readonly runPropsId?: string;
}

export interface AbstractNumDef {
  readonly id: number;
  readonly levels: readonly AbstractNumLevel[];
}

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

export interface NumberingLevelResult {
  readonly text: string;
  readonly indentTwips: number;
  readonly runProps: RunProps;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Convert a 1-based integer to an upper-case letter sequence (A, B, … Z, AA, …). */
function toUpperLetter(n: number): string {
  let result = '';
  let remaining = n;
  while (remaining > 0) {
    remaining--;
    result = String.fromCharCode(65 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26);
  }
  return result;
}

const UPPER_ROMAN: readonly [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

function toRoman(n: number): string {
  if (n <= 0) return '0';
  let result = '';
  let remaining = n;
  for (const [value, numeral] of UPPER_ROMAN) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }
  return result;
}

function formatCounter(n: number, fmt: NumberFormat): string {
  switch (fmt) {
    case 'decimal':
      return String(n);
    case 'upperLetter':
      return toUpperLetter(n);
    case 'lowerLetter':
      return toUpperLetter(n).toLowerCase();
    case 'upperRoman':
      return toRoman(n);
    case 'lowerRoman':
      return toRoman(n).toLowerCase();
    case 'bullet':
    case 'none':
      return '';
  }
}

/**
 * Expand a lvlText template.
 * `%1` → counter at level 0, `%2` → level 1, …
 * `%N` placeholders beyond the provided counters are treated as '0'.
 */
function expandLvlText(
  template: string,
  counters: readonly number[],
  levels: readonly AbstractNumLevel[],
): string {
  return template.replace(/%(\d+)/g, (_, numStr: string) => {
    const lvlIdx = parseInt(numStr, 10) - 1;
    const counter = counters[lvlIdx] ?? 0;
    const levelDef = levels[lvlIdx];
    if (levelDef === undefined) return String(counter);
    return formatCounter(counter, levelDef.numFmt);
  });
}

// ---------------------------------------------------------------------------
// Counter state helpers
// ---------------------------------------------------------------------------

/**
 * Ensure the counter array for numId has at least 9 slots.
 * Returns the mutable array (already stored in the map).
 */
function ensureCounters(state: Map<number, number[]>, numId: number): number[] {
  let arr = state.get(numId);
  if (arr === undefined) {
    arr = new Array<number>(9).fill(0);
    state.set(numId, arr);
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

/**
 * Resolve the numbering marker for a paragraph.
 *
 * Returns `undefined` when the paragraph has no numbering, the numId is
 * missing, or the abstract definition is absent.
 *
 * Mutates `counterState` in-place — callers should pass a fresh map per
 * layout pass, or reset between passes.
 */
export function resolveNumbering(
  doc: Pick<Document, 'numbering' | 'styles' | 'props' | 'defaults'>,
  paragraph: Paragraph,
  counterState: Map<number, number[]>,
): NumberingLevelResult | undefined {
  // Resolve the effective para props to find the numPr.
  const paraPropsId = paragraph.attrs.paraPropsId;
  const directParaProps = doc.props.para.get(paraPropsId);
  const styleRef = directParaProps?.styleRef;
  const resolvedParaProps = resolveParaProps(paraPropsId, styleRef, doc);

  const numPr = resolvedParaProps.numbering;
  if (numPr === undefined) return undefined;

  const { numId, ilvl } = numPr;

  // Resolve numId → abstractId.
  const numDef = doc.numbering.nums.get(numId);
  if (numDef === undefined) return undefined;

  // Look up abstract definition.
  const abstract = doc.numbering.abstracts.get(numDef.abstractId) as AbstractNumDef | undefined;
  if (abstract === undefined) return undefined;

  const levelDef = abstract.levels[ilvl];
  if (levelDef === undefined) return undefined;

  // Increment counter at this level; reset deeper levels.
  const counters = ensureCounters(counterState, numId);
  counters[ilvl] = (counters[ilvl] ?? 0) + 1;
  for (let i = ilvl + 1; i < counters.length; i++) {
    counters[i] = 0;
  }

  // Build the marker text.
  const text = expandLvlText(levelDef.lvlText, counters, abstract.levels);

  // Resolve run props for the marker.
  const runProps: RunProps =
    levelDef.runPropsId !== undefined
      ? (doc.props.run.get(levelDef.runPropsId as PropsId) ?? {})
      : {};

  return {
    text,
    indentTwips: levelDef.indentTwips,
    runProps,
  };
}
