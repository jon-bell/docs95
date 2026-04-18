import type { Document } from './document.js';
import type { StyleDef } from './document.js';
import type { RunProps, ParaProps, PropsId } from './props.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const MAX_CHAIN_DEPTH = 64;

/**
 * Walk the basedOn chain for a style id, returning styles from most-ancestor
 * first to the starting style last.  Cycle detection breaks the walk early
 * with a console.warn so the partial result is still used.
 */
function resolveBasedOnChain(
  startId: string,
  styles: ReadonlyMap<string, StyleDef>,
): readonly StyleDef[] {
  const chain: StyleDef[] = [];
  const seen = new Set<string>();
  let current: string | undefined = startId;

  while (current !== undefined) {
    if (seen.has(current)) {
      // Cycle detected — break silently.  The domain cannot log; callers
      // that need diagnostics should inspect the partial result.
      break;
    }
    if (chain.length >= MAX_CHAIN_DEPTH) {
      // Pathologically deep chain — truncate to avoid stack pressure.
      break;
    }
    const def = styles.get(current);
    if (def === undefined) {
      // Unknown style — stop silently (missing style = no contribution).
      break;
    }
    seen.add(current);
    chain.unshift(def); // ancestor first
    current = def.basedOn;
  }

  return chain;
}

/**
 * Merge two RunProps objects left-to-right; right-hand side wins for each
 * defined property.
 */
function mergeRunProps(base: RunProps, override: RunProps): RunProps {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override) as Array<keyof RunProps>) {
    const val = override[key];
    if (val !== undefined) {
      result[key] = val;
    }
  }
  return result as RunProps;
}

/**
 * Merge two ParaProps objects left-to-right; right-hand side wins for each
 * defined property.  Nested objects (indent, spacing) are merged shallowly.
 */
function mergeParaProps(base: ParaProps, override: ParaProps): ParaProps {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override) as Array<keyof ParaProps>) {
    const val = override[key];
    if (val !== undefined) {
      if (val !== null && typeof val === 'object' && !Array.isArray(val) && key !== 'numbering') {
        const baseVal = (base as Record<string, unknown>)[key];
        result[key] =
          baseVal !== null && typeof baseVal === 'object' && !Array.isArray(baseVal)
            ? { ...(baseVal as object), ...(val as object) }
            : val;
      } else {
        result[key] = val;
      }
    }
  }
  return result as ParaProps;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the effective RunProps for a run.
 *
 * Resolution order (Word 95 spec):
 *   1. Document defaults  (doc.defaults.runPropsId → doc.props.run)
 *   2. Paragraph style's rPr  (walk basedOn chain; ancestor first)
 *   3. Character style's rPr  (walk basedOn chain; ancestor first)
 *   4. Direct run formatting  (doc.props.run.get(runPropsId))
 *
 * Later layers override earlier ones property-by-property.
 * Absent props entries and unknown style ids produce no contribution.
 */
export function resolveRunProps(
  runPropsId: PropsId | undefined,
  paraStyleRef: string | undefined,
  charStyleRef: string | undefined,
  doc: Pick<Document, 'styles' | 'props' | 'defaults'>,
): RunProps {
  // 1. Document defaults.
  let resolved: RunProps = doc.props.run.get(doc.defaults.runPropsId) ?? {};

  // 2. Paragraph style rPr chain (ancestor → descendant).
  if (paraStyleRef !== undefined) {
    const chain = resolveBasedOnChain(paraStyleRef, doc.styles.styles);
    for (const styleDef of chain) {
      if (styleDef.runPropsId !== undefined) {
        const styleRunProps = doc.props.run.get(styleDef.runPropsId);
        if (styleRunProps !== undefined) {
          resolved = mergeRunProps(resolved, styleRunProps);
        }
      }
    }
  }

  // 3. Character style rPr chain (ancestor → descendant).
  if (charStyleRef !== undefined) {
    const chain = resolveBasedOnChain(charStyleRef, doc.styles.styles);
    for (const styleDef of chain) {
      if (styleDef.runPropsId !== undefined) {
        const styleRunProps = doc.props.run.get(styleDef.runPropsId);
        if (styleRunProps !== undefined) {
          resolved = mergeRunProps(resolved, styleRunProps);
        }
      }
    }
  }

  // 4. Direct run formatting.
  if (runPropsId !== undefined) {
    const directProps = doc.props.run.get(runPropsId);
    if (directProps !== undefined) {
      resolved = mergeRunProps(resolved, directProps);
    }
  }

  return resolved;
}

/**
 * Resolve the effective ParaProps for a paragraph.
 *
 * Resolution order (Word 95 spec):
 *   1. Document defaults  (doc.defaults.paraPropsId → doc.props.para)
 *   2. Paragraph style's pPr  (walk basedOn chain; ancestor first)
 *   3. Direct paragraph formatting  (doc.props.para.get(paraPropsId))
 *
 * Later layers override earlier ones property-by-property.
 */
export function resolveParaProps(
  paraPropsId: PropsId | undefined,
  paraStyleRef: string | undefined,
  doc: Pick<Document, 'styles' | 'props' | 'defaults'>,
): ParaProps {
  // 1. Document defaults.
  let resolved: ParaProps = doc.props.para.get(doc.defaults.paraPropsId) ?? {};

  // 2. Paragraph style pPr chain (ancestor → descendant).
  if (paraStyleRef !== undefined) {
    const chain = resolveBasedOnChain(paraStyleRef, doc.styles.styles);
    for (const styleDef of chain) {
      if (styleDef.paraPropsId !== undefined) {
        const styleParaProps = doc.props.para.get(styleDef.paraPropsId);
        if (styleParaProps !== undefined) {
          resolved = mergeParaProps(resolved, styleParaProps);
        }
      }
    }
  }

  // 3. Direct paragraph formatting.
  if (paraPropsId !== undefined) {
    const directProps = doc.props.para.get(paraPropsId);
    if (directProps !== undefined) {
      resolved = mergeParaProps(resolved, directProps);
    }
  }

  return resolved;
}
