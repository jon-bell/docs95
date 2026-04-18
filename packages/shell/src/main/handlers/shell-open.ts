import { shell } from 'electron';
import type { OpenExternalRequest, OpenExternalResponse } from '@word/ipc-schema';

/**
 * Allowed URL schemes per ADR-0014. An allowlist is used, not a blocklist,
 * so novel schemes introduced by OS or browser vendors default to denied.
 */
const ALLOWED_SCHEMES = ['http:', 'https:', 'mailto:'] as const;

export function isSchemeAllowed(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (ALLOWED_SCHEMES as readonly string[]).includes(parsed.protocol);
}

export async function shellOpenExternal(
  params: OpenExternalRequest,
): Promise<OpenExternalResponse> {
  if (!isSchemeAllowed(params.url)) {
    // Rejection here is defense-in-depth; the Zod schema on the channel
    // already enforces the http/https/mailto regex.
    throw new Error(`URL scheme not allowed: ${new URL(params.url).protocol}`);
  }

  await shell.openExternal(params.url);
  return { ok: true };
}
