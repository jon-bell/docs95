import { create } from 'zustand';

export type Theme = 'windows95' | 'modern' | 'highContrast' | 'dark';

export interface PrefsState {
  readonly theme: Theme;
  readonly showStatusBar: boolean;
  readonly showRulers: boolean;
  readonly recentFiles: readonly string[];
}

export interface PrefsActions {
  setTheme(t: Theme): void;
  toggleStatusBar(): void;
  toggleRulers(): void;
  pushRecent(path: string): void;
}

export type PrefsStore = PrefsState & PrefsActions;

const STORAGE_KEY = 'word.prefs.v1';
const MAX_RECENT = 9;

interface PersistedPrefs {
  theme?: Theme;
  showStatusBar?: boolean;
  showRulers?: boolean;
  recentFiles?: string[];
}

const VALID_THEMES: readonly Theme[] = ['windows95', 'modern', 'highContrast', 'dark'];

function loadFromStorage(): Partial<PrefsState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const p = parsed as PersistedPrefs;
    // Build a mutable intermediate so exactOptionalPropertyTypes is satisfied.
    type MutablePrefs = {
      theme?: Theme;
      showStatusBar?: boolean;
      showRulers?: boolean;
      recentFiles?: string[];
    };
    const out: MutablePrefs = {};
    if (typeof p.theme === 'string' && (VALID_THEMES as readonly string[]).includes(p.theme)) {
      out.theme = p.theme as Theme;
    }
    if (typeof p.showStatusBar === 'boolean') out.showStatusBar = p.showStatusBar;
    if (typeof p.showRulers === 'boolean') out.showRulers = p.showRulers;
    if (Array.isArray(p.recentFiles) && p.recentFiles.every((r) => typeof r === 'string')) {
      out.recentFiles = p.recentFiles as string[];
    }
    return out as Partial<PrefsState>;
  } catch {
    return {};
  }
}

function persist(state: PrefsState): void {
  try {
    const p: PersistedPrefs = {
      theme: state.theme,
      showStatusBar: state.showStatusBar,
      showRulers: state.showRulers,
      recentFiles: [...state.recentFiles],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // quota exceeded or private browsing — silently ignore
  }
}

const defaults: PrefsState = {
  theme: 'windows95',
  showStatusBar: true,
  showRulers: true,
  recentFiles: [],
};

const initial: PrefsState = { ...defaults, ...loadFromStorage() };

export const usePrefsStore = create<PrefsStore>((set, get) => ({
  ...initial,

  setTheme(t: Theme): void {
    set({ theme: t });
    persist(get());
  },

  toggleStatusBar(): void {
    set((s) => ({ showStatusBar: !s.showStatusBar }));
    persist(get());
  },

  toggleRulers(): void {
    set((s) => ({ showRulers: !s.showRulers }));
    persist(get());
  },

  pushRecent(path: string): void {
    set((s) => {
      const filtered = s.recentFiles.filter((f) => f !== path);
      return { recentFiles: [path, ...filtered].slice(0, MAX_RECENT) };
    });
    persist(get());
  },
}));
