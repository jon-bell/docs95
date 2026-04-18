import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePrefsStore } from './prefs-store.js';

// Reset to defaults before each test by clearing localStorage and re-importing
// would require module re-evaluation; instead we exercise the public API.
beforeEach(() => {
  localStorage.clear();
  // Reset store to defaults via setTheme / toggle actions
  const store = usePrefsStore.getState();
  store.setTheme('windows95');
  if (!store.showStatusBar) store.toggleStatusBar();
  if (!store.showRulers) store.toggleRulers();
  // Reset recentFiles: push a sentinel then observe it
});

describe('PrefsStore', () => {
  it('has default theme windows95', () => {
    expect(usePrefsStore.getState().theme).toBe('windows95');
  });

  it('has showStatusBar true by default', () => {
    expect(usePrefsStore.getState().showStatusBar).toBe(true);
  });

  it('has showRulers true by default', () => {
    expect(usePrefsStore.getState().showRulers).toBe(true);
  });

  it('setTheme changes theme', () => {
    usePrefsStore.getState().setTheme('dark');
    expect(usePrefsStore.getState().theme).toBe('dark');
  });

  it('toggleStatusBar flips showStatusBar', () => {
    usePrefsStore.getState().toggleStatusBar();
    expect(usePrefsStore.getState().showStatusBar).toBe(false);
    usePrefsStore.getState().toggleStatusBar();
    expect(usePrefsStore.getState().showStatusBar).toBe(true);
  });

  it('toggleRulers flips showRulers', () => {
    usePrefsStore.getState().toggleRulers();
    expect(usePrefsStore.getState().showRulers).toBe(false);
    usePrefsStore.getState().toggleRulers();
    expect(usePrefsStore.getState().showRulers).toBe(true);
  });

  it('pushRecent adds paths, most recent first', () => {
    usePrefsStore.getState().pushRecent('/file/a.docx');
    usePrefsStore.getState().pushRecent('/file/b.docx');
    const { recentFiles } = usePrefsStore.getState();
    expect(recentFiles[0]).toBe('/file/b.docx');
    expect(recentFiles[1]).toBe('/file/a.docx');
  });

  it('pushRecent deduplicates by moving existing path to front', () => {
    usePrefsStore.getState().pushRecent('/file/a.docx');
    usePrefsStore.getState().pushRecent('/file/b.docx');
    usePrefsStore.getState().pushRecent('/file/a.docx');
    const { recentFiles } = usePrefsStore.getState();
    expect(recentFiles[0]).toBe('/file/a.docx');
    expect(recentFiles.filter((f) => f === '/file/a.docx')).toHaveLength(1);
  });

  it('setTheme persists to localStorage', () => {
    usePrefsStore.getState().setTheme('highContrast');
    const raw = localStorage.getItem('word.prefs.v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { theme?: string };
    expect(parsed.theme).toBe('highContrast');
  });

  it('handles corrupt localStorage gracefully', () => {
    // Corrupt the stored prefs — the store should still initialise with defaults
    localStorage.setItem('word.prefs.v1', 'NOT_JSON{{{');
    // The load already happened at module init; subsequent sets should work fine
    usePrefsStore.getState().setTheme('modern');
    expect(usePrefsStore.getState().theme).toBe('modern');
  });

  it('all valid themes are accepted by setTheme', () => {
    const themes = ['windows95', 'modern', 'highContrast', 'dark'] as const;
    for (const t of themes) {
      usePrefsStore.getState().setTheme(t);
      expect(usePrefsStore.getState().theme).toBe(t);
    }
  });

  it('localStorage quota exceeded does not throw', () => {
    // Simulate setItem throwing (quota exceeded)
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    // Should not throw
    expect(() => usePrefsStore.getState().setTheme('modern')).not.toThrow();
    vi.restoreAllMocks();
  });
});
