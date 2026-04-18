import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { resolveRunProps, resolveParaProps } from './style-resolution.js';
import { createMutablePropsRegistry } from './document-factory.js';
import type { Document, StyleRegistry, StyleDef } from './document.js';
import type { RunProps, ParaProps, PropsId } from './props.js';
import { asPropsId } from './props.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDocContext(
  overrides?: Partial<{
    styles: StyleRegistry;
    defaultRunProps: RunProps;
    defaultParaProps: ParaProps;
  }>,
): Pick<Document, 'styles' | 'props' | 'defaults'> {
  const reg = createMutablePropsRegistry();
  const defaultRunPropsId = reg.internRun(overrides?.defaultRunProps ?? {});
  const defaultParaPropsId = reg.internPara(overrides?.defaultParaProps ?? {});
  const props = reg.freeze();

  const styles: StyleRegistry = overrides?.styles ?? {
    styles: new Map(),
    defaultParagraphStyleId: 'Normal',
    defaultCharacterStyleId: 'DefaultParagraphFont',
  };

  return {
    styles,
    props,
    defaults: { runPropsId: defaultRunPropsId, paraPropsId: defaultParaPropsId },
  };
}

function makeStyleRegistry(defs: StyleDef[]): StyleRegistry {
  const map = new Map<string, StyleDef>();
  for (const d of defs) map.set(d.id, d);
  return {
    styles: map,
    defaultParagraphStyleId: 'Normal',
    defaultCharacterStyleId: 'DefaultParagraphFont',
  };
}

// ---------------------------------------------------------------------------
// resolveRunProps — basic
// ---------------------------------------------------------------------------

describe('resolveRunProps', () => {
  it('returns empty object when no style refs and no direct props', () => {
    const doc = makeDocContext();
    const result = resolveRunProps(undefined, undefined, undefined, doc);
    expect(result).toEqual({});
  });

  it('returns document defaults when no style refs', () => {
    const doc = makeDocContext({ defaultRunProps: { fontName: 'Arial', halfPoints: 24 } });
    const result = resolveRunProps(undefined, undefined, undefined, doc);
    expect(result.fontName).toBe('Arial');
    expect(result.halfPoints).toBe(24);
  });

  it('direct props override document defaults', () => {
    const doc = makeDocContext({ defaultRunProps: { bold: false, halfPoints: 20 } });
    const reg = createMutablePropsRegistry();
    reg.internRun(doc.props.run.get(doc.defaults.runPropsId)!);
    const directId = reg.internRun({ bold: true });
    const docWithDirect: typeof doc = {
      ...doc,
      props: { ...doc.props, run: new Map([...doc.props.run, [directId, { bold: true }]]) },
    };
    const result = resolveRunProps(directId, undefined, undefined, docWithDirect);
    expect(result.bold).toBe(true);
    expect(result.halfPoints).toBe(20); // inherited from defaults
  });

  it('paragraph style rPr is applied between defaults and direct', () => {
    const reg = createMutablePropsRegistry();
    const defaultRunId = reg.internRun({ halfPoints: 20 });
    const styleRunId = reg.internRun({ fontName: 'Courier New', halfPoints: 20 });
    const directRunId = reg.internRun({ bold: true });
    const props = reg.freeze();

    const paraStyle: StyleDef = {
      id: 'MyStyle',
      name: 'My Style',
      type: 'paragraph',
      runPropsId: styleRunId,
    };
    const styles = makeStyleRegistry([paraStyle]);

    const doc: Pick<Document, 'styles' | 'props' | 'defaults'> = {
      styles,
      props,
      defaults: { runPropsId: defaultRunId, paraPropsId: asPropsId('x') },
    };

    const result = resolveRunProps(directRunId, 'MyStyle', undefined, doc);
    expect(result.fontName).toBe('Courier New'); // from para style
    expect(result.bold).toBe(true); // from direct
    expect(result.halfPoints).toBe(20); // from para style (overrides default with same value)
  });

  it('character style rPr overrides paragraph style rPr', () => {
    const reg = createMutablePropsRegistry();
    const defaultRunId = reg.internRun({});
    const paraStyleRunId = reg.internRun({ fontName: 'Arial', bold: false });
    const charStyleRunId = reg.internRun({ fontName: 'Verdana' });
    const props = reg.freeze();

    const paraStyle: StyleDef = {
      id: 'ParaStyle',
      name: 'Para Style',
      type: 'paragraph',
      runPropsId: paraStyleRunId,
    };
    const charStyle: StyleDef = {
      id: 'CharStyle',
      name: 'Char Style',
      type: 'character',
      runPropsId: charStyleRunId,
    };

    const styles = makeStyleRegistry([paraStyle, charStyle]);
    const doc: Pick<Document, 'styles' | 'props' | 'defaults'> = {
      styles,
      props,
      defaults: { runPropsId: defaultRunId, paraPropsId: asPropsId('x') },
    };

    const result = resolveRunProps(undefined, 'ParaStyle', 'CharStyle', doc);
    expect(result.fontName).toBe('Verdana'); // char style wins over para style
    expect(result.bold).toBe(false); // para style contributed this
  });

  it('basedOn chain: child style overrides ancestor', () => {
    const reg = createMutablePropsRegistry();
    const defaultRunId = reg.internRun({});
    const h1RunId = reg.internRun({ fontName: 'Arial', halfPoints: 28, bold: true });
    const h2RunId = reg.internRun({ halfPoints: 24, italic: true });
    const props = reg.freeze();

    const h1Style: StyleDef = {
      id: 'Heading1',
      name: 'Heading 1',
      type: 'paragraph',
      runPropsId: h1RunId,
    };
    const h2Style: StyleDef = {
      id: 'Heading2',
      name: 'Heading 2',
      type: 'paragraph',
      basedOn: 'Heading1',
      runPropsId: h2RunId,
    };

    const styles = makeStyleRegistry([h1Style, h2Style]);
    const doc: Pick<Document, 'styles' | 'props' | 'defaults'> = {
      styles,
      props,
      defaults: { runPropsId: defaultRunId, paraPropsId: asPropsId('x') },
    };

    const result = resolveRunProps(undefined, 'Heading2', undefined, doc);
    // Heading2's rPr: halfPoints=24, italic=true. Bold comes from Heading1 chain.
    expect(result.fontName).toBe('Arial'); // from Heading1 (ancestor)
    expect(result.halfPoints).toBe(24); // Heading2 overrides Heading1's 28
    expect(result.bold).toBe(true); // from Heading1 (ancestor)
    expect(result.italic).toBe(true); // from Heading2
  });

  it('unknown styleRef contributes nothing', () => {
    const doc = makeDocContext({ defaultRunProps: { halfPoints: 20 } });
    const result = resolveRunProps(undefined, 'NoSuchStyle', undefined, doc);
    expect(result.halfPoints).toBe(20); // defaults still apply
    expect(result.fontName).toBeUndefined();
  });

  it('cycle in basedOn chain terminates without infinite loop', () => {
    const reg = createMutablePropsRegistry();
    const defaultRunId = reg.internRun({});
    const styleARunId = reg.internRun({ fontName: 'Arial' });
    const styleBRunId = reg.internRun({ bold: true });
    const props = reg.freeze();

    // A basedOn B, B basedOn A — cycle.
    const styleA: StyleDef = {
      id: 'A',
      name: 'A',
      type: 'paragraph',
      basedOn: 'B',
      runPropsId: styleARunId,
    };
    const styleB: StyleDef = {
      id: 'B',
      name: 'B',
      type: 'paragraph',
      basedOn: 'A',
      runPropsId: styleBRunId,
    };

    const styles = makeStyleRegistry([styleA, styleB]);
    const doc: Pick<Document, 'styles' | 'props' | 'defaults'> = {
      styles,
      props,
      defaults: { runPropsId: defaultRunId, paraPropsId: asPropsId('x') },
    };

    // Should not throw or hang.
    expect(() => resolveRunProps(undefined, 'A', undefined, doc)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// resolveParaProps — basic
// ---------------------------------------------------------------------------

describe('resolveParaProps', () => {
  it('returns empty when nothing is set', () => {
    const doc = makeDocContext();
    const result = resolveParaProps(undefined, undefined, doc);
    expect(result).toEqual({});
  });

  it('direct para props override style para props', () => {
    const reg = createMutablePropsRegistry();
    const defaultParaId = reg.internPara({});
    const defaultRunId = reg.internRun({});
    const styleParaId = reg.internPara({ alignment: 'center', widowControl: true });
    const directParaId = reg.internPara({ alignment: 'right' });
    const props = reg.freeze();

    const style: StyleDef = {
      id: 'MyPara',
      name: 'My Para',
      type: 'paragraph',
      paraPropsId: styleParaId,
    };
    const styles = makeStyleRegistry([style]);

    const doc: Pick<Document, 'styles' | 'props' | 'defaults'> = {
      styles,
      props,
      defaults: { runPropsId: defaultRunId, paraPropsId: defaultParaId },
    };

    const result = resolveParaProps(directParaId, 'MyPara', doc);
    expect(result.alignment).toBe('right'); // direct wins
    expect(result.widowControl).toBe(true); // from style
  });

  it('indent is merged shallowly from basedOn chain', () => {
    const reg = createMutablePropsRegistry();
    const defaultParaId = reg.internPara({});
    const defaultRunId = reg.internRun({});
    const parentParaId = reg.internPara({ indent: { leftTwips: 720 } });
    const childParaId = reg.internPara({ indent: { rightTwips: 360 } });
    const props = reg.freeze();

    const parentStyle: StyleDef = {
      id: 'Parent',
      name: 'Parent',
      type: 'paragraph',
      paraPropsId: parentParaId,
    };
    const childStyle: StyleDef = {
      id: 'Child',
      name: 'Child',
      type: 'paragraph',
      basedOn: 'Parent',
      paraPropsId: childParaId,
    };

    const styles = makeStyleRegistry([parentStyle, childStyle]);
    const doc: Pick<Document, 'styles' | 'props' | 'defaults'> = {
      styles,
      props,
      defaults: { runPropsId: defaultRunId, paraPropsId: defaultParaId },
    };

    const result = resolveParaProps(undefined, 'Child', doc);
    // leftTwips from Parent, rightTwips from Child.
    expect(result.indent?.leftTwips).toBe(720);
    expect(result.indent?.rightTwips).toBe(360);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

describe('resolveRunProps — property-based', () => {
  it('is deterministic: same inputs yield identical output', () => {
    fc.assert(
      fc.property(
        fc.option(fc.boolean()),
        fc.option(fc.integer({ min: 14, max: 48 })),
        (bold, halfPoints) => {
          const reg = createMutablePropsRegistry();
          const defaultRunId = reg.internRun({});
          const defaultParaId = reg.internPara({});
          const directId = reg.internRun({
            ...(bold !== null ? { bold } : {}),
            ...(halfPoints !== null ? { halfPoints } : {}),
          });
          const props = reg.freeze();

          const doc: Pick<Document, 'styles' | 'props' | 'defaults'> = {
            styles: {
              styles: new Map(),
              defaultParagraphStyleId: 'Normal',
              defaultCharacterStyleId: 'DefaultParagraphFont',
            },
            props,
            defaults: { runPropsId: defaultRunId, paraPropsId: defaultParaId },
          };

          const r1 = resolveRunProps(directId, undefined, undefined, doc);
          const r2 = resolveRunProps(directId, undefined, undefined, doc);
          expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
        },
      ),
    );
  });

  it('direct formatting always wins over style formatting', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (styleVal, directVal) => {
        const reg = createMutablePropsRegistry();
        const defaultRunId = reg.internRun({});
        const defaultParaId = reg.internPara({});
        const styleRunId = reg.internRun({ bold: styleVal });
        const directRunId = reg.internRun({ bold: directVal });
        const props = reg.freeze();

        const style: StyleDef = {
          id: 'S',
          name: 'S',
          type: 'paragraph',
          runPropsId: styleRunId,
        };

        const doc: Pick<Document, 'styles' | 'props' | 'defaults'> = {
          styles: makeStyleRegistry([style]),
          props,
          defaults: { runPropsId: defaultRunId, paraPropsId: defaultParaId },
        };

        const result = resolveRunProps(directRunId, 'S', undefined, doc);
        expect(result.bold).toBe(directVal);
      }),
    );
  });
});

describe('resolveParaProps — property-based', () => {
  it('is deterministic: same inputs yield identical output', () => {
    fc.assert(
      fc.property(
        fc.option(fc.constantFrom('left', 'center', 'right', 'justify' as const)),
        (alignment) => {
          const reg = createMutablePropsRegistry();
          const defaultRunId = reg.internRun({});
          const defaultParaId = reg.internPara({});
          const directId: PropsId | undefined =
            alignment !== null ? reg.internPara({ alignment }) : undefined;
          const props = reg.freeze();

          const doc: Pick<Document, 'styles' | 'props' | 'defaults'> = {
            styles: {
              styles: new Map(),
              defaultParagraphStyleId: 'Normal',
              defaultCharacterStyleId: 'DefaultParagraphFont',
            },
            props,
            defaults: { runPropsId: defaultRunId, paraPropsId: defaultParaId },
          };

          const r1 = resolveParaProps(directId, undefined, doc);
          const r2 = resolveParaProps(directId, undefined, doc);
          expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
        },
      ),
    );
  });
});
