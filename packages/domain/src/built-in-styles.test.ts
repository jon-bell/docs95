import { describe, it, expect } from 'vitest';
import { createNormalStylesRegistry } from './built-in-styles.js';
import { createMutablePropsRegistry } from './document-factory.js';

describe('createNormalStylesRegistry', () => {
  it('produces a registry with all required built-in styles', () => {
    const reg = createMutablePropsRegistry();
    const styles = createNormalStylesRegistry(reg);

    expect(styles.defaultParagraphStyleId).toBe('Normal');
    expect(styles.defaultCharacterStyleId).toBe('DefaultParagraphFont');

    const required = [
      'Normal',
      'Heading1',
      'Heading2',
      'Heading3',
      'DefaultParagraphFont',
      'ListParagraph',
    ];
    for (const id of required) {
      expect(styles.styles.has(id), `missing style "${id}"`).toBe(true);
    }
  });

  it('Normal is marked as default paragraph style', () => {
    const reg = createMutablePropsRegistry();
    const styles = createNormalStylesRegistry(reg);
    const normal = styles.styles.get('Normal');
    expect(normal?.isDefault).toBe(true);
    expect(normal?.type).toBe('paragraph');
  });

  it('Normal has Times New Roman 10pt and widowControl', () => {
    const reg = createMutablePropsRegistry();
    const styles = createNormalStylesRegistry(reg);
    const normal = styles.styles.get('Normal')!;
    const frozen = reg.freeze();
    const runProps =
      normal.runPropsId !== undefined ? frozen.run.get(normal.runPropsId) : undefined;
    expect(runProps?.fontName).toBe('Times New Roman');
    expect(runProps?.halfPoints).toBe(20); // 10pt = 20 half-points
    const paraProps =
      normal.paraPropsId !== undefined ? frozen.para.get(normal.paraPropsId) : undefined;
    expect(paraProps?.widowControl).toBe(true);
  });

  it('Heading1 is based on Normal with Arial 14pt bold and keepNext/keepLines', () => {
    const reg = createMutablePropsRegistry();
    const styles = createNormalStylesRegistry(reg);
    const h1 = styles.styles.get('Heading1')!;
    expect(h1.basedOn).toBe('Normal');
    expect(h1.type).toBe('paragraph');
    const frozen = reg.freeze();
    const runProps = h1.runPropsId !== undefined ? frozen.run.get(h1.runPropsId) : undefined;
    expect(runProps?.fontName).toBe('Arial');
    expect(runProps?.halfPoints).toBe(28); // 14pt = 28 half-points
    expect(runProps?.bold).toBe(true);
    const paraProps = h1.paraPropsId !== undefined ? frozen.para.get(h1.paraPropsId) : undefined;
    expect(paraProps?.keepNext).toBe(true);
    expect(paraProps?.keepLines).toBe(true);
    expect(paraProps?.outlineLevel).toBe(0);
    expect(paraProps?.spacing?.beforeTwips).toBe(240);
    expect(paraProps?.spacing?.afterTwips).toBe(60);
  });

  it('Heading2 is Arial 12pt bold italic, outlineLevel 1', () => {
    const reg = createMutablePropsRegistry();
    const styles = createNormalStylesRegistry(reg);
    const h2 = styles.styles.get('Heading2')!;
    expect(h2.basedOn).toBe('Normal');
    const frozen = reg.freeze();
    const runProps = h2.runPropsId !== undefined ? frozen.run.get(h2.runPropsId) : undefined;
    expect(runProps?.halfPoints).toBe(24); // 12pt
    expect(runProps?.bold).toBe(true);
    expect(runProps?.italic).toBe(true);
    const paraProps = h2.paraPropsId !== undefined ? frozen.para.get(h2.paraPropsId) : undefined;
    expect(paraProps?.outlineLevel).toBe(1);
  });

  it('Heading3 is Arial 12pt bold, outlineLevel 2', () => {
    const reg = createMutablePropsRegistry();
    const styles = createNormalStylesRegistry(reg);
    const h3 = styles.styles.get('Heading3')!;
    const frozen = reg.freeze();
    const runProps = h3.runPropsId !== undefined ? frozen.run.get(h3.runPropsId) : undefined;
    expect(runProps?.italic).toBeUndefined();
    const paraProps = h3.paraPropsId !== undefined ? frozen.para.get(h3.paraPropsId) : undefined;
    expect(paraProps?.outlineLevel).toBe(2);
  });

  it('DefaultParagraphFont is a character style and is default', () => {
    const reg = createMutablePropsRegistry();
    const styles = createNormalStylesRegistry(reg);
    const dpf = styles.styles.get('DefaultParagraphFont')!;
    expect(dpf.type).toBe('character');
    expect(dpf.isDefault).toBe(true);
  });

  it('ListParagraph is based on Normal with left indent 720', () => {
    const reg = createMutablePropsRegistry();
    const styles = createNormalStylesRegistry(reg);
    const lp = styles.styles.get('ListParagraph')!;
    expect(lp.basedOn).toBe('Normal');
    const frozen = reg.freeze();
    const paraProps = lp.paraPropsId !== undefined ? frozen.para.get(lp.paraPropsId) : undefined;
    expect(paraProps?.indent?.leftTwips).toBe(720);
  });

  it('interns props into the registry so PropsIds are valid', () => {
    const reg = createMutablePropsRegistry();
    const styles = createNormalStylesRegistry(reg);
    const frozen = reg.freeze();

    for (const [, def] of styles.styles) {
      if (def.runPropsId !== undefined) {
        expect(frozen.run.has(def.runPropsId)).toBe(true);
      }
      if (def.paraPropsId !== undefined) {
        expect(frozen.para.has(def.paraPropsId)).toBe(true);
      }
    }
  });

  it('calling twice with the same registry is idempotent (same PropsIds)', () => {
    const reg = createMutablePropsRegistry();
    const styles1 = createNormalStylesRegistry(reg);
    const styles2 = createNormalStylesRegistry(reg);

    const h1a = styles1.styles.get('Heading1')!;
    const h1b = styles2.styles.get('Heading1')!;
    expect(h1a.runPropsId).toBe(h1b.runPropsId);
    expect(h1a.paraPropsId).toBe(h1b.paraPropsId);
  });
});
