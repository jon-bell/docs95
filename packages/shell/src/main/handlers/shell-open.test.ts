import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
}));

const { isSchemeAllowed, shellOpenExternal } = await import('./shell-open.js');

describe('isSchemeAllowed', () => {
  it('allows http URLs', () => {
    expect(isSchemeAllowed('http://example.com')).toBe(true);
  });

  it('allows https URLs', () => {
    expect(isSchemeAllowed('https://example.com/path?q=1')).toBe(true);
  });

  it('allows mailto URLs', () => {
    expect(isSchemeAllowed('mailto:user@example.com')).toBe(true);
  });

  it('rejects javascript: URLs', () => {
    expect(isSchemeAllowed('javascript:alert(1)')).toBe(false);
  });

  it('rejects file: URLs', () => {
    expect(isSchemeAllowed('file:///etc/passwd')).toBe(false);
  });

  it('rejects ftp: URLs', () => {
    expect(isSchemeAllowed('ftp://files.example.com')).toBe(false);
  });

  it('rejects data: URLs', () => {
    expect(isSchemeAllowed('data:text/html,<h1>hi</h1>')).toBe(false);
  });

  it('rejects malformed strings', () => {
    expect(isSchemeAllowed('not a url')).toBe(false);
  });
});

describe('shellOpenExternal', () => {
  it('opens an allowed https URL', async () => {
    const result = await shellOpenExternal({ url: 'https://example.com' });
    expect(result.ok).toBe(true);
  });

  it('throws for a disallowed scheme (defense-in-depth)', async () => {
    // The Zod schema on the channel already prevents this from reaching the
    // handler in production, but the handler guards independently.
    // We bypass Zod here and call the handler directly.
    await expect(
      shellOpenExternal({ url: 'file:///etc/passwd' } as unknown as {
        url: `http://${string}` | `https://${string}` | `mailto:${string}`;
      }),
    ).rejects.toThrow('scheme not allowed');
  });
});
