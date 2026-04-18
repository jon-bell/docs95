// Deterministic node ID derivation for imported content without an explicit ID.
// Per ADR-0013: for imported content, derive ID from content hash so IDs are
// stable for unmodified imports but regenerated when content changes.
// We use a simple djb2 hash encoded as base-36 to stay within URL-safe chars.

export function buildUnknownNodeId(content: string): string {
  let h = 5381;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) + h + content.charCodeAt(i)) >>> 0;
  }
  // Pad to a fixed-ish length so collisions are less likely in large docs.
  return 'u' + h.toString(36).padStart(8, '0');
}
