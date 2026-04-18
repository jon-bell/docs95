import type { IdGenPort } from './ports.js';
import type {
  Document,
  DocDefaults,
  DocumentMeta,
  NumberingRegistry,
  FontRegistry,
} from './document.js';
import type { Section } from './document.js';
import type { Paragraph } from './block.js';
import type {
  MutablePropsRegistry,
  PropsRegistry,
  RunProps,
  ParaProps,
  SectionProps,
  TableProps,
  RowProps,
  CellProps,
} from './props.js';
import type { PropsId } from './props.js';
import { asPropsId } from './props.js';
import { DEFAULT_PAGE, DEFAULT_MARGIN_TWIPS } from './constants.js';
import { createNormalStylesRegistry } from './built-in-styles.js';
import { createDefaultNumbering } from './built-in-numbering.js';

// ---------------------------------------------------------------------------
// Structural-hash key
//
// Produces a deterministic string key from any JSON-serialisable value by
// recursively sorting object keys before serialising.  Same input always
// yields the same key, independent of property insertion order.
// ---------------------------------------------------------------------------

function sortedStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + (value as unknown[]).map(sortedStringify).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ':' + sortedStringify(obj[k]));
  return '{' + pairs.join(',') + '}';
}

/**
 * Derives a stable PropsId from the canonical hash of props.  Using the
 * hash directly (prefixed with 'h:') as the id satisfies the "same input →
 * same id across sessions" contract without requiring a PRNG.
 */
function hashToPropsId(hash: string): PropsId {
  // A short prefix makes the ids recognisable in debug output.
  return asPropsId('h:' + hash);
}

// ---------------------------------------------------------------------------
// MutablePropsRegistry implementation
// ---------------------------------------------------------------------------

class MutablePropsRegistryImpl implements MutablePropsRegistry {
  private readonly runMap = new Map<PropsId, RunProps>();
  private readonly paraMap = new Map<PropsId, ParaProps>();
  private readonly sectionMap = new Map<PropsId, SectionProps>();
  private readonly tableMap = new Map<PropsId, TableProps>();
  private readonly rowMap = new Map<PropsId, RowProps>();
  private readonly cellMap = new Map<PropsId, CellProps>();

  private intern<T>(map: Map<PropsId, T>, value: T): PropsId {
    const id = hashToPropsId(sortedStringify(value));
    if (!map.has(id)) {
      map.set(id, value);
    }
    return id;
  }

  internRun(p: RunProps): PropsId {
    return this.intern(this.runMap, p);
  }
  internPara(p: ParaProps): PropsId {
    return this.intern(this.paraMap, p);
  }
  internSection(p: SectionProps): PropsId {
    return this.intern(this.sectionMap, p);
  }
  internTable(p: TableProps): PropsId {
    return this.intern(this.tableMap, p);
  }
  internRow(p: RowProps): PropsId {
    return this.intern(this.rowMap, p);
  }
  internCell(p: CellProps): PropsId {
    return this.intern(this.cellMap, p);
  }

  freeze(): PropsRegistry {
    return {
      run: new Map(this.runMap) as ReadonlyMap<PropsId, RunProps>,
      para: new Map(this.paraMap) as ReadonlyMap<PropsId, ParaProps>,
      section: new Map(this.sectionMap) as ReadonlyMap<PropsId, SectionProps>,
      table: new Map(this.tableMap) as ReadonlyMap<PropsId, TableProps>,
      row: new Map(this.rowMap) as ReadonlyMap<PropsId, RowProps>,
      cell: new Map(this.cellMap) as ReadonlyMap<PropsId, CellProps>,
    };
  }
}

/** Factory for a fresh, mutable props registry. */
export const createMutablePropsRegistry = (): MutablePropsRegistry =>
  new MutablePropsRegistryImpl();

// ---------------------------------------------------------------------------
// createEmptyDocument
// ---------------------------------------------------------------------------

const DEFAULT_RUN_PROPS: RunProps = {};
const DEFAULT_PARA_PROPS: ParaProps = {};
const DEFAULT_SECTION_PROPS: SectionProps = {
  pageSize: {
    widthTwips: DEFAULT_PAGE.widthTwips,
    heightTwips: DEFAULT_PAGE.heightTwips,
    orient: 'portrait',
  },
  pageMargin: {
    topTwips: DEFAULT_MARGIN_TWIPS.top,
    bottomTwips: DEFAULT_MARGIN_TWIPS.bottom,
    leftTwips: DEFAULT_MARGIN_TWIPS.left,
    rightTwips: DEFAULT_MARGIN_TWIPS.right,
    headerTwips: DEFAULT_MARGIN_TWIPS.header,
    footerTwips: DEFAULT_MARGIN_TWIPS.footer,
    gutterTwips: DEFAULT_MARGIN_TWIPS.gutter,
  },
};

const EMPTY_FONT_REGISTRY: FontRegistry = {
  faces: new Map(),
};

const EMPTY_META: DocumentMeta = {};

/**
 * Builds the simplest valid Document: one section, one empty paragraph,
 * interned built-in styles, default numbering, and empty side stores.
 *
 * The first paragraph is assigned a styleRef of 'Normal' so the resolver
 * can apply the Normal paragraph style defaults.
 */
export const createEmptyDocument = (idGen: IdGenPort): Document => {
  const registry = new MutablePropsRegistryImpl();

  // Seed built-in styles first so their props land in the registry.
  const styles = createNormalStylesRegistry(registry);
  const numbering = createDefaultNumbering();

  // Doc-level defaults: bare (empty) run and para props.  These form the
  // bottom of the property resolution chain and are intentionally minimal.
  const defaultRunPropsId = registry.internRun(DEFAULT_RUN_PROPS);
  const defaultParaPropsId = registry.internPara(DEFAULT_PARA_PROPS);
  const defaultSectionPropsId = registry.internSection(DEFAULT_SECTION_PROPS);

  const defaults: DocDefaults = {
    runPropsId: defaultRunPropsId,
    paraPropsId: defaultParaPropsId,
  };

  // The first paragraph carries an explicit styleRef so the style resolver
  // applies Normal's widowControl / font defaults without guessing.
  const firstParaPropsId = registry.internPara({ styleRef: 'Normal' });

  const emptyParagraph: Paragraph = {
    id: idGen.newId(),
    type: 'paragraph',
    attrs: { paraPropsId: firstParaPropsId },
    children: [],
  };

  const section: Section = {
    id: idGen.newId(),
    type: 'section',
    attrs: { sectionPropsId: defaultSectionPropsId },
    children: [emptyParagraph],
  };

  return {
    id: idGen.newId(),
    version: 0,
    sections: [section],
    footnotes: new Map(),
    endnotes: new Map(),
    comments: new Map(),
    bookmarks: new Map(),
    hyperlinks: new Map(),
    drawings: new Map(),
    images: new Map(),
    fields: new Map(),
    styles,
    numbering,
    fonts: EMPTY_FONT_REGISTRY,
    props: registry.freeze(),
    defaults,
    meta: EMPTY_META,
  };
};

/**
 * Builds the simplest valid Document with an **empty** style and numbering
 * registry.  Use this in tests that assert on the exact shape of registries
 * or that do not want built-in styles to interfere.
 */
export const createBareDocument = (idGen: IdGenPort): Document => {
  const registry = new MutablePropsRegistryImpl();

  const defaultRunPropsId = registry.internRun(DEFAULT_RUN_PROPS);
  const defaultParaPropsId = registry.internPara(DEFAULT_PARA_PROPS);
  const defaultSectionPropsId = registry.internSection(DEFAULT_SECTION_PROPS);

  const defaults: DocDefaults = {
    runPropsId: defaultRunPropsId,
    paraPropsId: defaultParaPropsId,
  };

  const emptyParagraph: Paragraph = {
    id: idGen.newId(),
    type: 'paragraph',
    attrs: { paraPropsId: defaultParaPropsId },
    children: [],
  };

  const section: Section = {
    id: idGen.newId(),
    type: 'section',
    attrs: { sectionPropsId: defaultSectionPropsId },
    children: [emptyParagraph],
  };

  const emptyNumbering: NumberingRegistry = { nums: new Map(), abstracts: new Map() };

  return {
    id: idGen.newId(),
    version: 0,
    sections: [section],
    footnotes: new Map(),
    endnotes: new Map(),
    comments: new Map(),
    bookmarks: new Map(),
    hyperlinks: new Map(),
    drawings: new Map(),
    images: new Map(),
    fields: new Map(),
    styles: {
      styles: new Map(),
      defaultParagraphStyleId: 'Normal',
      defaultCharacterStyleId: 'DefaultParagraphFont',
    },
    numbering: emptyNumbering,
    fonts: EMPTY_FONT_REGISTRY,
    props: registry.freeze(),
    defaults,
    meta: EMPTY_META,
  };
};
