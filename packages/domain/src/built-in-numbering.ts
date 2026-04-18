import type { NumberingRegistry, NumberingDef } from './document.js';
import type { AbstractNumDef, AbstractNumLevel } from './numbering-resolution.js';

// ---------------------------------------------------------------------------
// Built-in numbering definitions
//
// Mirrors the two abstractNums that Word 95 emits when the user applies a
// numbered or bulleted list from the toolbar.
// ---------------------------------------------------------------------------

/** Indent widths (twips) per level for the standard list indent pattern. */
const LEVEL_INDENT_TWIPS: readonly number[] = [720, 1440, 2160, 2880, 3600, 4320, 5040, 5760, 6480];

// ── Abstract 0 — decimal numbered list ───────────────────────────────────

function makeDecimalLevels(): readonly AbstractNumLevel[] {
  const levels: AbstractNumLevel[] = [];
  for (let i = 0; i < 9; i++) {
    // Template: level 0 → "%1.", level 1 → "%2.", …
    const lvlText = `%${i + 1}.`;
    levels.push({
      ilvl: i,
      start: 1,
      numFmt: 'decimal',
      lvlText,
      indentTwips: LEVEL_INDENT_TWIPS[i] ?? (i + 1) * 720,
    });
  }
  return levels;
}

const ABSTRACT_DECIMAL: AbstractNumDef = {
  id: 0,
  levels: makeDecimalLevels(),
};

// ── Abstract 1 — bullet list ──────────────────────────────────────────────

// Word 95 used the Symbol font bullet character (U+F0B7 private-use, mapped
// to the filled circle bullet in Symbol).  We store the Unicode bullet
// character (•, U+2022) which round-trips identically in DOCX via lvlText.
const BULLET_CHAR = '\u2022';

function makeBulletLevels(): readonly AbstractNumLevel[] {
  const levels: AbstractNumLevel[] = [];
  for (let i = 0; i < 9; i++) {
    levels.push({
      ilvl: i,
      start: 1,
      numFmt: 'bullet',
      lvlText: BULLET_CHAR,
      indentTwips: LEVEL_INDENT_TWIPS[i] ?? (i + 1) * 720,
    });
  }
  return levels;
}

const ABSTRACT_BULLET: AbstractNumDef = {
  id: 1,
  levels: makeBulletLevels(),
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the default NumberingRegistry with two pre-defined list types:
 *  - numId 1 → abstractId 0 (decimal)
 *  - numId 2 → abstractId 1 (bullet)
 */
export function createDefaultNumbering(): NumberingRegistry {
  const abstracts = new Map<number, AbstractNumDef>();
  abstracts.set(ABSTRACT_DECIMAL.id, ABSTRACT_DECIMAL);
  abstracts.set(ABSTRACT_BULLET.id, ABSTRACT_BULLET);

  const numDef1: NumberingDef = { id: 1, abstractId: 0 };
  const numDef2: NumberingDef = { id: 2, abstractId: 1 };

  const nums = new Map<number, NumberingDef>();
  nums.set(1, numDef1);
  nums.set(2, numDef2);

  return {
    nums,
    abstracts: abstracts as ReadonlyMap<number, unknown>,
  };
}
