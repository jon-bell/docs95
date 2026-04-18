// Wire AST types: faithful to ECMA-376. Unknown subtrees captured as WireUnknown.
// This is the persistence-side contract. The domain is the editor-side contract.
// See ADR-0005 for the two-stage rationale.

export interface WireDocument {
  readonly type: 'document';
  readonly body: WireBody;
}

export interface WireBody {
  readonly type: 'body';
  readonly children: readonly WireBodyChild[];
}

// M0 scope: only paragraphs and opaque unknowns at body level.
export type WireBodyChild = WireParagraph | WireUnknown;

export interface WireParagraph {
  readonly type: 'paragraph';
  /** Serialized <w:pPr> XML, or null if absent. Round-tripped opaquely. */
  readonly pPrXml: string | null;
  readonly children: readonly WireParagraphChild[];
}

export type WireParagraphChild = WireRun | WireUnknown;

export interface WireRun {
  readonly type: 'run';
  /** Serialized <w:rPr> XML, or null if absent. Round-tripped opaquely. */
  readonly rPrXml: string | null;
  readonly children: readonly WireRunChild[];
}

export type WireRunChild = WireText | WireBreak | WireUnknown;

export interface WireText {
  readonly type: 'text';
  readonly value: string;
  /** xml:space="preserve" — needed when value has leading/trailing spaces. */
  readonly preserveSpace: boolean;
}

export interface WireBreak {
  readonly type: 'break';
  /** w:type attribute value, or null (means line break). */
  readonly breakType: string | null;
  readonly clear: string | null;
}

/**
 * An element or subtree from an unknown or unsupported namespace/tag.
 * Stored as serialized XML so it can be re-emitted verbatim.
 * Per ADR-0013, carries a stable nodeId derived from content hash at parse time.
 */
export interface WireUnknown {
  readonly type: 'unknown';
  readonly nodeId: string;
  readonly ns: string;
  readonly tag: string;
  /** Serialized outer XML (including the element's own tags and all children). */
  readonly xml: string;
}
