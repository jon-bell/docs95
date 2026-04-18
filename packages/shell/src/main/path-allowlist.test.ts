import { describe, it, expect, vi } from 'vitest';

// Mock electron before importing the module under test.
const mockDocuments = '/home/x/Documents';
const mockDownloads = '/home/x/Downloads';
const mockDesktop = '/home/x/Desktop';
const mockUserData = '/home/x/.config/word';

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      switch (name) {
        case 'documents':
          return mockDocuments;
        case 'downloads':
          return mockDownloads;
        case 'desktop':
          return mockDesktop;
        case 'userData':
          return mockUserData;
        default:
          throw new Error(`Unknown path: ${name}`);
      }
    },
  },
}));

// Import after mock is registered.
const { isPathAllowed } = await import('./path-allowlist.js');

describe('isPathAllowed', () => {
  describe('allowed paths', () => {
    it('allows a file inside the documents root', () => {
      expect(isPathAllowed('/home/x/Documents/a.docx')).toBe(true);
    });

    it('allows a nested file inside the documents root', () => {
      expect(isPathAllowed('/home/x/Documents/projects/draft.docx')).toBe(true);
    });

    it('allows a file inside the downloads root', () => {
      expect(isPathAllowed('/home/x/Downloads/report.pdf')).toBe(true);
    });

    it('allows a file on the desktop', () => {
      expect(isPathAllowed('/home/x/Desktop/memo.docx')).toBe(true);
    });

    it('allows a file inside userData', () => {
      expect(isPathAllowed('/home/x/.config/word/settings.json')).toBe(true);
    });
  });

  describe('rejected paths', () => {
    it('rejects /etc/passwd', () => {
      expect(isPathAllowed('/etc/passwd')).toBe(false);
    });

    it('rejects a traversal that escapes documents root', () => {
      expect(isPathAllowed('/home/x/Documents/../../../etc/passwd')).toBe(false);
    });

    it('rejects /root', () => {
      expect(isPathAllowed('/root')).toBe(false);
    });

    it('rejects a relative path', () => {
      expect(isPathAllowed('relative/path.docx')).toBe(false);
    });

    it('rejects /tmp', () => {
      expect(isPathAllowed('/tmp/evil.docx')).toBe(false);
    });

    it('rejects a path that is a prefix of documents root but escapes it', () => {
      // /home/x/DocumentsBad is not inside /home/x/Documents
      expect(isPathAllowed('/home/x/DocumentsBad/a.docx')).toBe(false);
    });
  });
});
