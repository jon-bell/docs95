import { describe, it, expect } from 'vitest';
import { createDefaultNumbering } from './built-in-numbering.js';
import type { AbstractNumDef } from './numbering-resolution.js';

describe('createDefaultNumbering', () => {
  it('returns two nums: numId 1 (decimal) and numId 2 (bullet)', () => {
    const reg = createDefaultNumbering();
    expect(reg.nums.has(1)).toBe(true);
    expect(reg.nums.has(2)).toBe(true);
  });

  it('numId 1 maps to abstractId 0', () => {
    const reg = createDefaultNumbering();
    expect(reg.nums.get(1)?.abstractId).toBe(0);
  });

  it('numId 2 maps to abstractId 1', () => {
    const reg = createDefaultNumbering();
    expect(reg.nums.get(2)?.abstractId).toBe(1);
  });

  it('abstractId 0 is a decimal definition with 9 levels', () => {
    const reg = createDefaultNumbering();
    const abstract = reg.abstracts.get(0) as AbstractNumDef;
    expect(abstract).toBeDefined();
    expect(abstract.levels).toHaveLength(9);
    for (const level of abstract.levels) {
      expect(level.numFmt).toBe('decimal');
    }
  });

  it('abstractId 1 is a bullet definition with 9 levels', () => {
    const reg = createDefaultNumbering();
    const abstract = reg.abstracts.get(1) as AbstractNumDef;
    expect(abstract).toBeDefined();
    expect(abstract.levels).toHaveLength(9);
    for (const level of abstract.levels) {
      expect(level.numFmt).toBe('bullet');
    }
  });

  it('decimal level 0 has lvlText "%1." and indentTwips 720', () => {
    const reg = createDefaultNumbering();
    const abstract = reg.abstracts.get(0) as AbstractNumDef;
    const level0 = abstract.levels[0]!;
    expect(level0.lvlText).toBe('%1.');
    expect(level0.indentTwips).toBe(720);
  });

  it('decimal level 1 has lvlText "%2." and indentTwips 1440', () => {
    const reg = createDefaultNumbering();
    const abstract = reg.abstracts.get(0) as AbstractNumDef;
    const level1 = abstract.levels[1]!;
    expect(level1.lvlText).toBe('%2.');
    expect(level1.indentTwips).toBe(1440);
  });

  it('bullet levels all use the bullet character', () => {
    const reg = createDefaultNumbering();
    const abstract = reg.abstracts.get(1) as AbstractNumDef;
    for (const level of abstract.levels) {
      expect(level.lvlText).toBe('\u2022');
    }
  });

  it('all decimal levels have start = 1', () => {
    const reg = createDefaultNumbering();
    const abstract = reg.abstracts.get(0) as AbstractNumDef;
    for (const level of abstract.levels) {
      expect(level.start).toBe(1);
    }
  });

  it('indent increases by 720 twips per level', () => {
    const reg = createDefaultNumbering();
    const abstract = reg.abstracts.get(0) as AbstractNumDef;
    for (let i = 0; i < 9; i++) {
      expect(abstract.levels[i]?.indentTwips).toBe((i + 1) * 720);
    }
  });
});
